// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Message Parameter Schemas
 * Zod schemas for runtime validation of message parameters
 *
 * @module utils/messaging/schemas
 */

import { z } from 'zod';

// ========== Enum Schemas ==========

export const playbackStatusSchema = z.enum([
  'idle',
  'loading',
  'playing',
  'paused',
  'stopped',
  'error',
]);

export const extractionModeSchema = z.enum(['selection', 'article', 'full']);

export const providerIdSchema = z.enum(['elevenlabs', 'browser', 'openai', 'groq', 'cartesia']);

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

export const logComponentSchema = z.enum(['background', 'content', 'popup', 'options']);

export const footerActionSchema = z.enum([
  'play',
  'pause',
  'stop',
  'next',
  'prev',
  'seek',
  'speed',
  'close',
  'minimize',
  'expand',
]);

export const footerPositionXSchema = z.union([z.enum(['left', 'center', 'right']), z.number()]);

export const segmentTypeSchema = z.enum(['paragraph', 'heading', 'list']);

export const languageSourceSchema = z.enum(['metadata', 'text', 'fallback']);

// ========== Playback Message Schemas ==========

export const playbackStartParamsSchema = z.object({
  mode: extractionModeSchema,
  provider: providerIdSchema.optional(),
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
});

export const playbackSeekParamsSchema = z.object({
  index: z.number().int().nonnegative(),
});

export const playbackSetSpeedParamsSchema = z.object({
  speed: z.number().min(0.5).max(2.0),
});

export const playbackStateResponseSchema = z.object({
  status: playbackStatusSchema,
  currentIndex: z.number().int().nonnegative(),
  totalParagraphs: z.number().int().nonnegative(),
  progress: z.number().min(0).max(100),
  currentText: z.string(),
  provider: providerIdSchema,
  voice: z.string().nullable(),
  speed: z.number().min(0.5).max(2.0),
  mode: extractionModeSchema,
  error: z.string().optional(),
});

// ========== Audio Message Schemas ==========

export const wordTimelineEntrySchema = z.object({
  word: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});

export const audioGenerateParamsSchema = z.object({
  text: z.string().min(1),
  provider: providerIdSchema,
  voice: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
});

export const audioGenerateResponseSchema = z.object({
  success: z.boolean(),
  audioUrl: z.string().optional(),
  wordTimeline: z.array(wordTimelineEntrySchema).optional(),
  error: z.string().optional(),
});

export const audioCacheParamsSchema = z.object({
  key: z.string().min(1),
  audioUrl: z.string().url(),
  wordTimeline: z.array(wordTimelineEntrySchema).optional(),
});

export const audioCacheStateResponseSchema = z.object({
  size: z.number().nonnegative(),
  maxSize: z.number().positive(),
  entries: z.number().int().nonnegative(),
});

// ========== Provider Message Schemas ==========

export const providerSelectParamsSchema = z.object({
  providerId: providerIdSchema,
});

export const providerInfoSchema = z.object({
  id: providerIdSchema,
  name: z.string(),
  requiresApiKey: z.boolean(),
  supportsWordTiming: z.boolean(),
});

export const providerValidateLanguageSupportParamsSchema = z.object({
  providerId: providerIdSchema,
  languageCode: z.string().length(2), // ISO 639-1 codes
});

export const providerValidateLanguageSupportResponseSchema = z.object({
  supported: z.boolean(),
  alternativeProviders: z.array(providerIdSchema).optional(),
});

// ========== Content Message Schemas ==========

export const contentExtractParamsSchema = z.object({
  mode: extractionModeSchema,
});

export const contentParagraphSchema = z.object({
  text: z.string(),
  index: z.number().int().nonnegative(),
  type: segmentTypeSchema,
});

export const contentExtractResponseSchema = z.object({
  success: z.boolean(),
  paragraphs: z.array(contentParagraphSchema),
  totalCharacters: z.number().nonnegative(),
  extractionTimeMs: z.number().nonnegative(),
});

export const contentScoreParamsSchema = z.object({
  html: z.string().min(1),
});

export const contentScoreResponseSchema = z.object({
  score: z.number().min(0).max(1),
  paragraphCount: z.number().int().nonnegative(),
  linkDensity: z.number().min(0).max(1),
  headingCount: z.number().int().nonnegative(),
});

export const contentFindDOMParamsSchema = z.object({
  paragraphs: z.array(
    z.object({
      text: z.string(),
      index: z.number().int().nonnegative(),
    }),
  ),
});

export const contentDOMElementSchema = z.object({
  index: z.number().int().nonnegative(),
  xpath: z.string().optional(),
  found: z.boolean(),
});

// ========== Highlight Message Schemas ==========

export const highlightParagraphParamsSchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  scroll: z.boolean().optional(),
});

export const highlightWordParamsSchema = z.object({
  wordIndex: z.number().int().nonnegative(),
  paragraphIndex: z.number().int().nonnegative(),
});

export const highlightStateResponseSchema = z.object({
  currentParagraphIndex: z.number().int().nonnegative().nullable(),
  currentWordIndex: z.number().int().nonnegative().nullable(),
  highlightEnabled: z.boolean(),
});

// ========== Language Message Schemas ==========

export const languageDetectParamsSchema = z.object({
  metadata: z.string().optional(),
  textSample: z.string().optional(),
  url: z.string().url(),
});

export const languageDetectResponseSchema = z.object({
  code: z.string().length(2), // ISO 639-1
  confidence: z.number().min(0).max(1),
  source: languageSourceSchema,
  isReliable: z.boolean(),
});

export const languageGetStateParamsSchema = z.object({
  tabId: z.number().int().nonnegative(),
});

export const languageStateResponseSchema = z.object({
  detected: z
    .object({
      code: z.string().length(2),
      confidence: z.number().min(0).max(1),
      source: languageSourceSchema,
    })
    .nullable(),
  override: z.string().length(2).nullable(),
  effective: z.string().length(2),
  autoDetect: z.boolean(),
});

export const languageSetOverrideParamsSchema = z.object({
  languageCode: z.string().length(2),
});

// ========== Settings Message Schemas ==========

export const settingsSchema = z.object({
  mode: extractionModeSchema,
  provider: providerIdSchema,
  voice: z.string().nullable(),
  speed: z.number().min(0.5).max(2.0),
  showCostEstimate: z.boolean(),
  cacheEnabled: z.boolean(),
  maxCacheSize: z.number().int().positive(),
  wordSyncEnabled: z.boolean(),
});

export const settingsUpdateParamsSchema = settingsSchema.partial();

export const settingsMigrateParamsSchema = z.object({
  fromVersion: z.string(),
  toVersion: z.string(),
});

export const settingsMigrateResponseSchema = z.object({
  success: z.boolean(),
  migratedKeys: z.array(z.string()),
});

// ========== Footer Message Schemas ==========

export const footerPositionSchema = z.object({
  x: footerPositionXSchema,
  yOffset: z.number(),
});

export const footerUpdateStateParamsSchema = z.object({
  status: playbackStatusSchema.optional(),
  currentIndex: z.number().int().nonnegative().optional(),
  totalParagraphs: z.number().int().nonnegative().optional(),
  progress: z.number().min(0).max(100).optional(),
  currentTime: z.string().optional(),
  totalTime: z.string().optional(),
  speed: z.number().min(0.5).max(2.0).optional(),
});

export const footerStateResponseSchema = z.object({
  isVisible: z.boolean(),
  isMinimized: z.boolean(),
  position: footerPositionSchema,
});

export const footerActionParamsSchema = z.object({
  action: footerActionSchema,
  value: z.number().optional(), // For seek and speed actions
});

// ========== Logging Message Schemas ==========

export const loggingLogRemoteParamsSchema = z.object({
  level: logLevelSchema,
  message: z.string().min(1).max(10000),
  component: logComponentSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const loggingStateResponseSchema = z.object({
  enabled: z.boolean(),
  bufferSize: z.number().nonnegative(),
  lastFlushAttempt: z.number().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative(),
  circuitBreakerOpen: z.boolean(),
});
