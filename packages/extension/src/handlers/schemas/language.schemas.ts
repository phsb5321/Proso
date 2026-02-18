/**
 * Language Handler Validation Schemas
 *
 * Zod schemas for validating language handler parameters.
 *
 * @module handlers/schemas/language
 */

import { z } from 'zod';

export const languageDetectParamsSchema = z.object({
  textSample: z.string().optional(),
  metadata: z.string().optional(),
  url: z.string().optional(),
  __tabId: z.number().int().nonnegative().optional(),
});

export const languageGetStateParamsSchema = z.object({
  tabId: z.number().int().nonnegative().optional(),
});

export const languageSetOverrideParamsSchema = z.object({
  languageCode: z.string().min(2),
});
