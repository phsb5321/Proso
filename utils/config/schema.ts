/**
 * VoxPage Configuration Schema
 * Zod-first TypeScript validation
 *
 * @module utils/config/schema
 * @description All types are derived from Zod schemas using z.infer<>
 */

import { z } from 'zod';

/**
 * Valid mode values for text extraction
 */
export const MODES = ['selection', 'article', 'full'] as const;

/**
 * Valid TTS provider values
 */
export const PROVIDERS = ['openai', 'elevenlabs', 'cartesia', 'groq', 'browser'] as const;

/**
 * Valid language detection sources
 */
export const DETECTION_SOURCES = ['metadata', 'text', 'user'] as const;

/**
 * Footer position schema
 */
export const footerPositionSchema = z.object({
  x: z.union([z.literal('left'), z.literal('center'), z.literal('right'), z.number()]),
  yOffset: z.number().default(0),
});

/**
 * Footer state schema (018-ui-redesign)
 */
export const footerStateSchema = z.object({
  isVisible: z.boolean().default(false),
  isMinimized: z.boolean().default(false),
  position: footerPositionSchema.default({ x: 'center', yOffset: 0 }),
});

/**
 * Main settings schema
 */
export const settingsSchema = z.object({
  // Text extraction mode
  mode: z.enum(MODES).default('article'),

  // TTS provider
  provider: z.enum(PROVIDERS).default('browser'),

  // Selected voice ID (provider-specific, null means use provider default)
  voice: z.string().nullable().default(null),

  // Playback speed multiplier: 0.5 - 2.0
  speed: z.number().min(0.5).max(2.0).default(1.0),

  // Show cost estimate before playback
  showCostEstimate: z.boolean().default(true),

  // Enable audio segment caching
  cacheEnabled: z.boolean().default(true),

  // Maximum number of cached audio segments: 10 - 200
  maxCacheSize: z.number().int().min(10).max(200).default(50),

  // Enable word-level highlighting
  wordSyncEnabled: z.boolean().default(true),

  // Enable automatic language detection (019-multilingual-tts)
  autoDetectLanguage: z.boolean().default(true),

  // Footer state (018-ui-redesign)
  footerState: footerStateSchema.optional(),
});

/**
 * Detected language schema (019-multilingual-tts)
 */
export const detectedLanguageSchema = z.object({
  code: z.string().min(2).max(10),
  confidence: z.number().min(0).max(1),
  source: z.enum(DETECTION_SOURCES),
  isReliable: z.boolean(),
  primaryCode: z.string().min(2).max(3),
  detectedAt: z.number(),
});

/**
 * Language preference schema (019-multilingual-tts)
 */
export const languagePreferenceSchema = z.object({
  autoDetect: z.boolean().default(true),
  currentOverride: z.string().nullable().default(null),
  voicePreferences: z.record(z.string(), z.string()).default({}),
});

/**
 * Inferred TypeScript types from Zod schemas
 */
export type Settings = z.infer<typeof settingsSchema>;
export type FooterState = z.infer<typeof footerStateSchema>;
export type FooterPosition = z.infer<typeof footerPositionSchema>;
export type DetectedLanguage = z.infer<typeof detectedLanguageSchema>;
export type LanguagePreference = z.infer<typeof languagePreferenceSchema>;
export type Mode = typeof MODES[number];
export type Provider = typeof PROVIDERS[number];
export type DetectionSource = typeof DETECTION_SOURCES[number];
