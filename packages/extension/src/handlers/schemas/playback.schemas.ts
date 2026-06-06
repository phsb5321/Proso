/**
 * Playback Handler Validation Schemas
 *
 * Zod schemas for validating playback handler parameters.
 *
 * @module handlers/schemas/playback
 */

import { z } from 'zod';

export const playbackStartParamsSchema = z.object({
  paragraphs: z.array(z.string()).optional(),
  tabId: z.number().int().positive().optional(),
  pageUrl: z.string().optional(),
  // Extraction mode used when `paragraphs` is not supplied. Defaults to
  // 'article' (whole-page reading). 'selection' reads the user's current text
  // selection (used by the "Read with Proso" context menu).
  mode: z.enum(['selection', 'article', 'full']).optional(),
});

export const playbackSeekToParagraphParamsSchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
});

export const playbackSetSpeedParamsSchema = z.object({
  speed: z.number().min(0.5).max(2.0),
});

export const playbackSeekParamsSchema = z.object({
  progress: z.number().min(0).max(100),
});

export const paragraphClickedParamsSchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  isCached: z.boolean().optional(),
});
