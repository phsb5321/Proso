import { Err, Ok } from '@proso/shared';
import type { Block, DocumentCoverage, Result } from '@proso/shared';
import type { ReadingSourceError } from '../../ports/reading-source.port';
import type { ExtractedContent } from '../../ports/text-extractor.port';

export const NORMALIZATION_VERSION = 'proso-normalize-v1';
export interface NormalizedSourceBlock {
  readonly kind: Block['kind'];
  readonly originalText: string;
  readonly parentOrdinal: number | null;
}
export interface NormalizedSourceContent {
  readonly blocks: readonly NormalizedSourceBlock[];
  readonly coverage: DocumentCoverage;
}

/** Input is decoded, inert extraction output, never HTML or speech-expanded text. */
export function normalizeDocumentContent(
  content: ExtractedContent,
  coverage: DocumentCoverage = { status: 'unknown', reasons: ['extraction-coverage-unknown'] },
  parents: readonly (number | null)[] = content.paragraphs.map(() => null),
): Result<NormalizedSourceContent, ReadingSourceError> {
  if (parents.length !== content.paragraphs.length) return Err({ type: 'INVALID_RESPONSE' });
  const blocks: NormalizedSourceBlock[] = [];
  const remap = new Map<number, number | null>();
  let bytes = 0;
  for (const [index, paragraph] of content.paragraphs.entries()) {
    const parent = parents[index];
    if (parent !== null && (!Number.isSafeInteger(parent) || parent < 0 || parent >= index))
      return Err({ type: 'INVALID_RESPONSE' });
    if (/[\uD800-\uDFFF]/u.test(paragraph.text)) return Err({ type: 'INVALID_RESPONSE' });
    const originalText = paragraph.text
      .normalize('NFC')
      .replace(/[\t\n\f\r \u00a0]+/g, ' ')
      .replace(/^ | $/g, '');
    const parentOrdinal = parent === null ? null : (remap.get(parent) ?? null);
    remap.set(index, originalText ? blocks.length : parentOrdinal);
    if (!originalText) continue;
    bytes += new TextEncoder().encode(originalText).byteLength;
    if (bytes > 1_048_576 || blocks.length >= 10_000) return Err({ type: 'LIMIT' });
    blocks.push({ kind: paragraph.type, originalText, parentOrdinal });
  }
  if (blocks.length === 0) return Err({ type: 'UNREADABLE' });
  return Ok({ blocks, coverage });
}
