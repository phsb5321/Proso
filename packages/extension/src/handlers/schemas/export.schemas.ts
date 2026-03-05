/**
 * Export Handler Validation Schemas
 *
 * Zod schemas for validating export handler parameters.
 *
 * @module handlers/schemas/export
 */

import { z } from 'zod';

export const exportStartParamsSchema = z.object({
  jobId: z.string().min(1),
  paragraphs: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        text: z.string().min(1),
      }),
    )
    .min(1),
  provider: z.string().min(1),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.0),
  quality: z.string().optional(),
});

export const exportCancelParamsSchema = z.object({
  jobId: z.string().min(1),
});

export const exportProgressParamsSchema = z.object({
  jobId: z.string().min(1),
});

export const exportDownloadParamsSchema = z.object({
  jobId: z.string().min(1),
  filename: z.string().optional(),
});
