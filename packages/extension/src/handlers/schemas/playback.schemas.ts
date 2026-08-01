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

/**
 * A tab asking to be told where the audio is (FR-005).
 *
 * `__tabId` is stamped on by the background dispatcher, and is what decides
 * whether the asking tab is the one being read into. The other two fields are
 * the caller's own diagnostics, accepted so a stray one cannot fail the
 * request but not read by the handler.
 */
export const playbackResyncParamsSchema = z.object({
  __tabId: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
  timestamp: z.number().optional(),
});
