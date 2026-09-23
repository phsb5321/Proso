import { Err } from '@proso/shared';
import type { Result } from '@proso/shared';
import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  createExtractedContent,
  createParagraph,
} from '../../core/content-extraction/extracted-content';
import { normalizeDocumentContent } from '../../core/reading-source/document-normalizer';
import type { NormalizedSourceContent } from '../../core/reading-source/document-normalizer';
import type { ReadingSourceError } from '../../ports/reading-source.port';
import type { Paragraph } from '../../ports/text-extractor.port';

const groups = new Set(['div', 'section', 'article', 'blockquote', 'ul', 'ol']);
const inline = new Set([
  'span',
  'a',
  'em',
  'strong',
  'b',
  'i',
  'u',
  's',
  'small',
  'sub',
  'sup',
  'code',
]);
const dropped = new Set([
  'script',
  'style',
  'template',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'img',
  'picture',
  'source',
  'video',
  'audio',
  'track',
  'canvas',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'option',
]);
type Node = DefaultTreeAdapterMap['node'];

/** Proso source-text allowlist v1. Data-only AST; no DOM, attributes or resource loading. */
export function extractSourceText(
  html: string,
): Result<NormalizedSourceContent, ReadingSourceError> {
  if (new TextEncoder().encode(html).byteLength > 2 * 1024 * 1024) return Err({ type: 'LIMIT' });
  if (/[\uD800-\uDFFF]/u.test(html)) return Err({ type: 'INVALID_RESPONSE' });
  try {
    const root = parseFragment(html);
    const paragraphs: Paragraph[] = [];
    const parents: (number | null)[] = [];
    const reasons = new Set<string>();
    const lists: { ordinal: number | null }[] = [];
    let kind: Paragraph['type'] = 'paragraph';
    let text = '';
    const flush = () => {
      if (text.replace(/[\t\n\f\r \u00a0]/g, '')) {
        const parent = lists.length > 1 ? lists[lists.length - 2].ordinal : null;
        const current = lists[lists.length - 1];
        if (current && current.ordinal === null) current.ordinal = paragraphs.length;
        parents.push(parent);
        paragraphs.push(createParagraph(text, paragraphs.length, kind));
      }
      text = '';
    };
    // Iterative traversal also bounds stack use for adversarial deeply nested feed HTML.
    type Visit = { node: Node; exit?: boolean; previousKind?: Paragraph['type'] };
    const stack: Visit[] = [{ node: root }];
    while (stack.length) {
      const visit = stack.pop();
      if (!visit) break;
      const { node } = visit;
      if ('value' in node && node.nodeName === '#text') {
        text += node.value;
        continue;
      }
      const tag = 'tagName' in node ? node.tagName : '';
      if (visit.exit) {
        flush();
        if (tag === 'li') lists.pop();
        kind = visit.previousKind ?? 'paragraph';
        continue;
      }
      if (dropped.has(tag)) {
        reasons.add('omitted-content');
        continue;
      }
      if (tag === 'br') {
        text += ' ';
        continue;
      }
      const blockKind =
        tag === 'li' ? 'list' : /^h[1-6]$/.test(tag) ? 'heading' : tag === 'p' ? 'paragraph' : null;
      const structural = blockKind !== null || groups.has(tag);
      if (tag && !structural && !inline.has(tag)) reasons.add('unsupported-structure');
      if (structural) {
        flush();
        stack.push({ node, exit: true, previousKind: kind });
        if (tag === 'li') lists.push({ ordinal: null });
        kind = blockKind ?? (lists.length ? 'list' : 'paragraph');
      }
      if ('childNodes' in node) {
        for (let i = node.childNodes.length - 1; i >= 0; i--)
          stack.push({ node: node.childNodes[i] });
      }
      if (paragraphs.length > 10_000) return Err({ type: 'LIMIT' });
    }
    flush();
    return normalizeDocumentContent(
      createExtractedContent(paragraphs, '', null, 0),
      {
        status: reasons.size ? 'partial' : 'full',
        reasons: [...reasons],
      },
      parents,
    );
  } catch {
    return Err({ type: 'INVALID_RESPONSE' });
  }
}
