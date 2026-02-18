/**
 * Settings Handler Validation Schemas
 *
 * Zod schemas for validating settings handler parameters.
 *
 * @module handlers/schemas/settings
 */

import { z } from 'zod';
import { providerIdSchema, extractionModeSchema } from '../../utils/messaging/schemas';

export const settingsUpdateParamsSchema = z.object({
  settings: z.object({
    mode: extractionModeSchema.optional(),
    provider: providerIdSchema.optional(),
    voice: z.string().nullable().optional(),
    speed: z.number().min(0.5).max(2.0).optional(),
    showCostEstimate: z.boolean().optional(),
    cacheEnabled: z.boolean().optional(),
    maxCacheSize: z.number().int().min(10).max(200).optional(),
    wordSyncEnabled: z.boolean().optional(),
  }).optional(),
  mode: extractionModeSchema.optional(),
  provider: providerIdSchema.optional(),
  voice: z.string().nullable().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
  showCostEstimate: z.boolean().optional(),
  cacheEnabled: z.boolean().optional(),
  maxCacheSize: z.number().int().min(10).max(200).optional(),
  wordSyncEnabled: z.boolean().optional(),
});

export const apiKeyParamsSchema = z.object({
  provider: z.string().min(1),
  key: z.string().optional(),
});

export const testApiKeyParamsSchema = z.object({
  provider: z.string().min(1),
  key: z.string().optional(),
  apiKey: z.string().optional(),
  data: z.object({
    provider: z.string().min(1),
    apiKey: z.string().min(1),
  }).optional(),
});

export const setThemeParamsSchema = z.object({
  mode: z.enum(['light', 'dark', 'system']).optional(),
});

export const resetSectionParamsSchema = z.object({
  section: z.enum(['quick-settings', 'appearance', 'reading-queue', 'developer', 'all']).optional(),
});
