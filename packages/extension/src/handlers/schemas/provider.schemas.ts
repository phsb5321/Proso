/**
 * Provider Handler Validation Schemas
 *
 * Zod schemas for validating provider handler parameters.
 *
 * @module handlers/schemas/provider
 */

import { z } from 'zod';
import { providerIdSchema } from '../../utils/messaging/schemas';

export const providerSelectParamsSchema = z.object({
  provider: providerIdSchema,
  validatedApiKey: z.string().min(1).optional(),
});

export const providerValidateLanguageParamsSchema = z.object({
  language: z.string().min(1),
  provider: providerIdSchema.optional(),
});
