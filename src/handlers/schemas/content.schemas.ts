/**
 * Content Handler Validation Schemas
 *
 * Zod schemas for validating content handler parameters.
 *
 * @module handlers/schemas/content
 */

import { z } from 'zod';
import { extractionModeSchema } from '../../utils/messaging/schemas';

export const contentExtractParamsSchema = z.object({
  html: z.string().min(1),
  mode: extractionModeSchema.optional(),
});

export const contentScoreParamsSchema = z.object({
  html: z.string().min(1),
});
