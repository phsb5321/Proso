/**
 * Miscellaneous Handler Validation Schemas
 *
 * Zod schemas for audio, highlight, prefetch, reader, logging, and debug handlers.
 *
 * @module handlers/schemas/misc
 */

import { z } from 'zod';
import { providerIdSchema } from '../../utils/messaging/schemas';

// ========== Audio Schemas ==========

export const audioGetVoicesParamsSchema = z.object({
  language: z.string().optional(),
});

export const audioSetVoiceParamsSchema = z.object({
  voiceId: z.string().min(1),
});

export const audioValidateCredentialsParamsSchema = z.object({
  provider: providerIdSchema.optional(),
});

export const audioGenerateParamsSchema = z.object({
  text: z.string().min(1),
  voice: z.string().nullable(),
  speed: z.number().min(0.5).max(2.0),
  language: z.string().nullable(),
});

// ========== Highlight Schemas ==========

export const highlightCreateParamsSchema = z.object({
  url: z.string().min(1),
  exact: z.string().min(1),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  color: z.enum(['yellow', 'green', 'blue', 'pink', 'purple']).optional(),
  note: z.string().optional(),
});

export const highlightGetParamsSchema = z.object({
  id: z.string().min(1),
});

export const highlightListParamsSchema = z.object({
  url: z.string().min(1),
});

export const highlightUpdateParamsSchema = z.object({
  id: z.string().min(1),
  color: z.enum(['yellow', 'green', 'blue', 'pink', 'purple']).optional(),
  note: z.string().optional(),
});

export const highlightDeleteParamsSchema = z.object({
  id: z.string().min(1),
});

export const highlightDeleteByUrlParamsSchema = z.object({
  url: z.string().min(1),
});

/**
 * Every highlight the content script tried to place, and whether it landed.
 *
 * Successes are carried as well as failures: a page can be edited back into
 * matching, and a report of failures alone could only ever set the flag, never
 * clear it.
 */
export const highlightReportAnchoringParamsSchema = z.object({
  results: z
    .array(
      z.object({
        id: z.string().min(1),
        orphaned: z.boolean(),
      }),
    )
    .min(1),
});

// ========== Prefetch Schemas ==========

export const prefetchStartParamsSchema = z
  .object({
    currentIndex: z.number().int().nonnegative().optional(),
  })
  .optional();

export const prefetchClearBufferParamsSchema = z
  .object({
    keepIndices: z.array(z.number().int().nonnegative()).optional(),
  })
  .optional();

// ========== Reader Schemas ==========

export const readerExtractArticleParamsSchema = z.object({
  html: z.string().min(1),
  url: z.string().optional(),
});

export const readerGetParagraphsParamsSchema = z.object({
  tabId: z.number().int().positive().optional(),
});

export const readerGetParagraphParamsSchema = z.object({
  index: z.number().int().nonnegative(),
  tabId: z.number().int().positive().optional(),
});

export const readerGetArticleInfoParamsSchema = z.object({
  tabId: z.number().int().positive().optional(),
});

export const readerClearArticleParamsSchema = z.object({
  tabId: z.number().int().positive().optional(),
});

export const readerIsArticlePageParamsSchema = z.object({
  html: z.string().min(1),
});

// ========== Logging Schemas ==========

export const loggingLogRemoteParamsSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().min(1),
  component: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ========== Debug Schemas ==========

export const debugGetDispatchSummaryParamsSchema = z.object({
  legacyHandlers: z.array(z.string()).optional(),
});
