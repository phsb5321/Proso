import { describe, expect, it, jest } from '@jest/globals';
import { extractSourceText } from '../../../../src/adapters/reading-source/source-text';
import {
  createExtractedContent,
  createParagraph,
} from '../../../../src/core/content-extraction/extracted-content';
import { normalizeDocumentContent } from '../../../../src/core/reading-source/document-normalizer';

describe('source-text allowlist and pure normalization', () => {
  it('preserves short text, headings, repeated blocks and decoded entities exactly once', () => {
    const result = extractSourceText(
      '<h2>Cafe\u0301</h2><p> Hi&nbsp; &amp; 😀 </p><p>Echo</p><p>Echo</p><p>&amp;amp;</p>',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        blocks: [
          { kind: 'heading', originalText: 'Café', parentOrdinal: null },
          { kind: 'paragraph', originalText: 'Hi & 😀', parentOrdinal: null },
          { kind: 'paragraph', originalText: 'Echo', parentOrdinal: null },
          { kind: 'paragraph', originalText: 'Echo', parentOrdinal: null },
          { kind: 'paragraph', originalText: '&amp;', parentOrdinal: null },
        ],
        coverage: { status: 'full', reasons: [] },
      },
    });
  });
  it('preserves nested list traversal and parents without duplicating text', () => {
    const result = extractSourceText(
      '<ul><li>Parent<ul><li>Child<ul><li>Grandchild</li></ul></li></ul>Tail</li><li>Sibling</li></ul>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks.map((b) => [b.originalText, b.parentOrdinal])).toEqual([
      ['Parent', null],
      ['Child', 0],
      ['Grandchild', 1],
      ['Tail', null],
      ['Sibling', null],
    ]);
  });
  it('uses plain inline runs and grouping containers, retaining non-collapsible whitespace', () => {
    const result = extractSourceText(
      '<article> A<br>B <div><strong>C</strong>\u2003D</div></article>',
    );
    expect(result.ok && result.value.blocks.map((b) => b.originalText)).toEqual([
      'A B',
      'C\u2003D',
    ]);
  });
  it('makes unsupported content partial and drops active/resource subtrees without network or DOM parsing', () => {
    const original = globalThis.fetch;
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as typeof fetch;
    const domSpy = jest.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      const result = extractSourceText(
        '<p onclick="evil()">Safe<img src="https://publisher.test/pixel" alt="Omitted"></p><script>evil()</script><iframe src="https://other.test">hidden</iframe><template>hidden</template><svg><text>hidden</text></svg><table><tr><td>Cell</td></tr></table>',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.blocks.map((b) => b.originalText)).toEqual(['Safe', 'Cell']);
      expect(result.value.coverage).toEqual({
        status: 'partial',
        reasons: ['omitted-content', 'unsupported-structure'],
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(domSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
      domSpy.mockRestore();
    }
  });
  it.each(['', '<p> \n&nbsp;</p>', '<script>only active content</script>'])(
    'rejects unreadable content %s',
    (html) => {
      expect(extractSourceText(html)).toEqual({ ok: false, error: { type: 'UNREADABLE' } });
    },
  );
  it('normalizes existing extraction output and reparents through omitted empty blocks', () => {
    const content = createExtractedContent(
      [createParagraph('A', 0), createParagraph(' ', 1), createParagraph('B', 2)],
      '',
      null,
      0,
    );
    const result = normalizeDocumentContent(
      content,
      { status: 'partial', reasons: ['truncated'] },
      [null, 0, 1],
    );
    expect(result.ok && result.value.blocks).toEqual([
      { kind: 'paragraph', originalText: 'A', parentOrdinal: null },
      { kind: 'paragraph', originalText: 'B', parentOrdinal: 0 },
    ]);
    expect(result.ok && result.value.coverage.status).toBe('partial');
    expect(normalizeDocumentContent(content, undefined, [null, 2, null]).ok).toBe(false);
  });
  it('rejects lone surrogates and limits without truncating to full coverage', () => {
    expect(extractSourceText('<p>\ud800</p>')).toEqual({
      ok: false,
      error: { type: 'INVALID_RESPONSE' },
    });
    expect(extractSourceText('x'.repeat(2 * 1024 * 1024 + 1))).toEqual({
      ok: false,
      error: { type: 'LIMIT' },
    });
    expect(extractSourceText('é'.repeat(524_289))).toEqual({ ok: false, error: { type: 'LIMIT' } });
  });
});
