/**
 * Queue Handler Validation Schemas
 *
 * Zod schemas for validating queue handler parameters.
 *
 * @module handlers/schemas/queue
 */

import { z } from 'zod';

export const queueAddParamsSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  faviconUrl: z.string().optional(),
  language: z.string().optional(),
  estimatedReadTime: z.number().nonnegative().optional(),
});

export const queueRemoveParamsSchema = z.object({
  id: z.string().min(1),
});

export const queueReorderParamsSchema = z.object({
  id: z.string().min(1),
  newPosition: z.number().int().nonnegative(),
});

export const queueUpdateStatusParamsSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pending', 'reading', 'completed', 'archived']),
});

export const queueUpdateProgressParamsSchema = z.object({
  id: z.string().min(1),
  progress: z.number().min(0).max(100),
  lastParagraphIndex: z.number().int().nonnegative().optional(),
});

export const queueClearParamsSchema = z.object({
  filter: z.enum(['all', 'completed', 'archived']).optional(),
});

export const queueGetItemParamsSchema = z.object({
  id: z.string().min(1),
});

export const queuePlayParamsSchema = z.object({
  startFromId: z.string().optional(),
});
