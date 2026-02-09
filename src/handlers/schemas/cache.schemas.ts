/**
 * Cache Handler Validation Schemas
 *
 * Zod schemas for validating cache handler parameters.
 *
 * @module handlers/schemas/cache
 */

import { z } from 'zod';

export const cacheClearParamsSchema = z.object({
  urlFilter: z.string().optional(),
});

export const cacheKeyParamsSchema = z.object({
  urlHash: z.string().min(1),
  paragraphIndex: z.number().int().nonnegative(),
  provider: z.string().min(1),
  voice: z.string(),
  contentHash: z.string().min(1),
});

export const getCachedParagraphsParamsSchema = z.object({
  url: z.string().min(1),
  provider: z.string().optional(),
  voice: z.string().optional(),
  totalParagraphs: z.number().int().nonnegative().optional(),
});

export const costEstimateParamsSchema = z.object({
  url: z.string().min(1),
  paragraphs: z.array(z.string()).optional(),
  provider: z.string().optional(),
  voice: z.string().optional(),
  startParagraph: z.number().int().nonnegative().optional(),
  endParagraph: z.number().int().nonnegative().optional(),
});
