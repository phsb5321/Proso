/**
 * Footer Handler Validation Schemas
 *
 * Zod schemas for validating footer handler parameters.
 *
 * @module handlers/schemas/footer
 */

import { z } from 'zod';
import { playbackStatusSchema } from '../../utils/messaging/schemas';

export const footerShowParamsSchema = z.object({
  tabId: z.number().int().nonnegative().optional(),
});

export const footerHideParamsSchema = z.object({
  tabId: z.number().int().nonnegative().optional(),
});

export const footerStateUpdateParamsSchema = z.object({
  tabId: z.number().int().nonnegative().optional(),
  status: playbackStatusSchema,
  currentIndex: z.number().int().nonnegative(),
  totalParagraphs: z.number().int().nonnegative(),
  progress: z.number().min(0).max(100),
  currentTime: z.string(),
  totalTime: z.string(),
  speed: z.number().min(0.5).max(2.0),
  voice: z.string().nullable().optional(),
});

export const footerActionParamsSchema = z.object({
  action: z.string().min(1),
  value: z.union([z.number(), z.string()]).optional(),
});

export const footerVisibilityParamsSchema = z.object({
  isMinimized: z.boolean().optional(),
  isVisible: z.boolean().optional(),
});

export const footerPositionParamsSchema = z.object({
  x: z.union([z.enum(['left', 'center', 'right']), z.number()]),
  yOffset: z.number(),
});
