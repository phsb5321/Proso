import { Err, Ok, ReadableDocumentSchema } from '@proso/shared';
import type { Block, ReadableDocument, Result } from '@proso/shared';
import type { ReadingSourceError } from '../../ports/reading-source.port';
import { NORMALIZATION_VERSION } from './document-normalizer';
import type { NormalizedSourceBlock, NormalizedSourceContent } from './document-normalizer';

/** Hashing boundary returns the complete lowercase SHA-256, never a cache-key fallback. */
export type SourceDigest = (preimage: string) => Promise<Result<string, ReadingSourceError>>;

export function documentPreimage(
  blocks: readonly NormalizedSourceBlock[],
  version = NORMALIZATION_VERSION,
): string {
  return JSON.stringify([
    version,
    blocks.map((block) => [block.kind, block.originalText, block.parentOrdinal]),
  ]);
}

export async function deriveDocumentIdentity(
  content: NormalizedSourceContent,
  digest: SourceDigest,
  version = NORMALIZATION_VERSION,
): Promise<
  Result<{ readonly revision: string; readonly blocks: readonly Block[] }, ReadingSourceError>
> {
  if (!version || /[\uD800-\uDFFF]/u.test(version) || content.blocks.length === 0)
    return Err({ type: 'INVALID_RESPONSE' });
  for (const [ordinal, block] of content.blocks.entries()) {
    if (
      block.parentOrdinal !== null &&
      (!Number.isSafeInteger(block.parentOrdinal) ||
        block.parentOrdinal < 0 ||
        block.parentOrdinal >= ordinal)
    )
      return Err({ type: 'INVALID_RESPONSE' });
  }
  const hash = await digest(documentPreimage(content.blocks, version));
  if (!hash.ok) return hash;
  if (!/^[a-f0-9]{64}$/.test(hash.value)) return Err({ type: 'INVALID_RESPONSE' });
  const revision = `r1-${hash.value}`;
  const blocks: Block[] = [];
  for (const [ordinal, block] of content.blocks.entries()) {
    const id = await digest(JSON.stringify(['proso-block-v1', revision, ordinal]));
    if (!id.ok) return id;
    if (!/^[a-f0-9]{64}$/.test(id.value)) return Err({ type: 'INVALID_RESPONSE' });
    blocks.push({
      id: `b1-${id.value}`,
      kind: block.kind,
      originalText: block.originalText,
      ...(block.parentOrdinal === null ? {} : { parentId: blocks[block.parentOrdinal].id }),
    });
  }
  return Ok({ revision, blocks });
}

export async function createReadableDocument(
  metadata: Omit<ReadableDocument, 'revision' | 'blocks' | 'coverage'>,
  content: NormalizedSourceContent,
  digest: SourceDigest,
): Promise<Result<ReadableDocument, ReadingSourceError>> {
  const identity = await deriveDocumentIdentity(content, digest);
  if (!identity.ok) return identity;
  const parsed = ReadableDocumentSchema.safeParse({
    ...metadata,
    ...identity.value,
    coverage: content.coverage,
  });
  return parsed.success ? Ok(parsed.data) : Err({ type: 'INVALID_RESPONSE' });
}

/** Recompute before recovery: syntactically valid digests are not proof of intact bytes. */
export async function validateDocumentIdentity(
  document: ReadableDocument,
  digest: SourceDigest,
): Promise<Result<void, ReadingSourceError>> {
  if (!ReadableDocumentSchema.safeParse(document).success) return Err({ type: 'INVALID_RESPONSE' });
  const ordinals = new Map(document.blocks.map((block, index) => [block.id, index]));
  const identity = await deriveDocumentIdentity(
    {
      coverage: document.coverage,
      blocks: document.blocks.map((block) => ({
        kind: block.kind,
        originalText: block.originalText,
        parentOrdinal: block.parentId === undefined ? null : (ordinals.get(block.parentId) ?? -1),
      })),
    },
    digest,
  );
  if (!identity.ok) return identity;
  return identity.value.revision === document.revision &&
    identity.value.blocks.every((block, index) => block.id === document.blocks[index].id)
    ? Ok(undefined)
    : Err({ type: 'INVALID_RESPONSE' });
}
