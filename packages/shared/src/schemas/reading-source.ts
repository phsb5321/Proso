import { z } from 'zod';
import type { ReadableDocument } from '../domain/reading-source.js';

const opaqueId = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^\s\p{Cc}]+$/u);
export const DocumentRevisionSchema = z.string().regex(/^r1-[0-9a-f]{64}$/);
export const BlockIdSchema = z.string().regex(/^b1-[0-9a-f]{64}$/);

export const SourceRefSchema = z
  .object({
    provider: z.literal('miniflux'),
    connectionId: opaqueId,
    itemId: opaqueId,
    canonicalUrl: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
      }),
  })
  .strict()
  .readonly();

export const BlockSchema = z
  .object({
    id: BlockIdSchema,
    kind: z.enum(['paragraph', 'heading', 'list']),
    originalText: z
      .string()
      .min(1)
      .refine(
        (text) =>
          !/[\uD800-\uDFFF]/u.test(text) &&
          text === text.normalize('NFC') &&
          text === text.replace(/[\t\n\f\r \u00a0]+/g, ' ').replace(/^ | $/g, ''),
      ),
    sourceAnchor: z.string().min(1).optional(),
    parentId: BlockIdSchema.optional(),
  })
  .strict()
  .readonly();

export const DocumentCoverageSchema = z
  .object({
    status: z.enum(['full', 'partial', 'unknown']),
    reasons: z.array(z.string().min(1)).readonly(),
  })
  .strict()
  .refine(({ status, reasons }) => (status === 'full' ? reasons.length === 0 : reasons.length > 0))
  .readonly();

export const ReadableDocumentSchema = z
  .object({
    source: SourceRefSchema,
    title: z.string(),
    author: z.string().nullable(),
    language: z
      .string()
      .refine((value) => {
        try {
          return Intl.getCanonicalLocales(value).length === 1;
        } catch {
          return false;
        }
      })
      .nullable(),
    revision: DocumentRevisionSchema,
    blocks: z.array(BlockSchema).min(1).max(10_000).readonly(),
    coverage: DocumentCoverageSchema,
    fetchedAt: z.number().int().nonnegative().safe(),
  })
  .strict()
  .superRefine(({ blocks }, context) => {
    const seen = new Set<string>();
    for (const [index, block] of blocks.entries()) {
      // Earlier parents imply both referential integrity and an acyclic graph.
      if (seen.has(block.id) || (block.parentId !== undefined && !seen.has(block.parentId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['blocks', index],
          message: 'Invalid block identity or parent',
        });
      }
      seen.add(block.id);
    }
    if (
      new TextEncoder().encode(blocks.map((block) => block.originalText).join('')).byteLength >
      1_048_576
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocks'],
        message: 'Normalized text limit exceeded',
      });
    }
  })
  .readonly();

export const CheckpointSchema = z
  .object({
    documentRevision: DocumentRevisionSchema,
    blockId: BlockIdSchema,
    sourceOffset: z.number().int().nonnegative().safe(),
    audioOffsetMs: z.number().finite().nonnegative(),
  })
  .strict()
  .readonly();

/** Contextual validation is required in addition to the standalone wire schema. */
export function checkpointForDocumentSchema(document: ReadableDocument) {
  return CheckpointSchema.refine((checkpoint) => {
    const block = document.blocks.find(({ id }) => id === checkpoint.blockId);
    if (!block || checkpoint.documentRevision !== document.revision) return false;
    const offset = checkpoint.sourceOffset;
    return (
      offset <= block.originalText.length &&
      !(
        /[\uD800-\uDBFF]/.test(block.originalText.charAt(offset - 1)) &&
        /[\uDC00-\uDFFF]/.test(block.originalText.charAt(offset))
      )
    );
  }, 'Checkpoint does not address a source boundary');
}
