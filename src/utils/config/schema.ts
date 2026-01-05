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
 * Valid theme mode values (027-settings-ux-overhaul)
 */
export const THEME_MODES = ['light', 'dark', 'system'] as const;

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

  // Theme mode preference (027-settings-ux-overhaul)
  themeMode: z.enum(THEME_MODES).default('system'),

  // Enable text highlighting during playback (027-settings-ux-overhaul)
  highlightEnabled: z.boolean().default(true),

  // Enable auto-scroll to follow playback (027-settings-ux-overhaul)
  autoScroll: z.boolean().default(true),
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
export type ThemeMode = typeof THEME_MODES[number];

// ========== Roadmap Feature Schemas (023-feature-roadmap) ==========

/**
 * Valid AI summarization providers
 */
export const AI_PROVIDERS = ['openai', 'anthropic'] as const;
export type AIProvider = typeof AI_PROVIDERS[number];

/**
 * Valid queue item statuses
 */
export const QUEUE_STATUSES = ['pending', 'reading', 'completed', 'archived'] as const;
export type QueueStatus = typeof QUEUE_STATUSES[number];

/**
 * Valid export job statuses
 */
export const EXPORT_STATUSES = ['pending', 'generating', 'encoding', 'complete', 'error'] as const;
export type ExportStatus = typeof EXPORT_STATUSES[number];

/**
 * Valid export quality levels (bitrate in kbps)
 */
export const EXPORT_QUALITIES = ['128', '192', '256'] as const;
export type ExportQuality = typeof EXPORT_QUALITIES[number];

/**
 * Queue settings schema
 */
export const queueSettingsSchema = z.object({
  autoPlayNext: z.boolean().default(true),
  autoArchiveCompleted: z.boolean().default(false),
  archiveAfterDays: z.number().int().min(1).max(365).default(30),
  maxQueueSize: z.number().int().min(10).max(500).default(300),
});

/**
 * Export settings schema
 */
export const exportSettingsSchema = z.object({
  defaultQuality: z.enum(EXPORT_QUALITIES).default('192'),
  includeMetadata: z.boolean().default(true),
});

/**
 * OCR settings schema
 */
export const ocrSettingsSchema = z.object({
  defaultLanguages: z.array(z.string()).default(['eng']),
  autoDetect: z.boolean().default(true),
  showConfidence: z.boolean().default(false),
});

/**
 * AI summarization settings schema
 */
export const aiSettingsSchema = z.object({
  defaultProvider: z.enum(AI_PROVIDERS).default('openai'),
  defaultBulletCount: z.number().int().min(3).max(7).default(5),
  cacheEnabled: z.boolean().default(true),
  cacheTTLMs: z.number().int().default(86400000), // 24 hours
});

/**
 * Storage keys for roadmap features
 */
export const ROADMAP_STORAGE_KEYS = {
  // Queue
  QUEUE_METADATA: 'queue:metadata',
  QUEUE_ITEMS: 'queue:items',
  QUEUE_SETTINGS: 'queue:settings',

  // Export
  EXPORT_HISTORY: 'export:history',
  EXPORT_SETTINGS: 'export:settings',

  // AI Summarization
  SUMMARY_CACHE: 'summary:cache',
  AI_SETTINGS: 'ai:settings',

  // OCR
  OCR_LANGUAGE_PACKS: 'ocr:languagePacks',
  OCR_SETTINGS: 'ocr:settings',
} as const;

export type QueueSettings = z.infer<typeof queueSettingsSchema>;
export type ExportSettings = z.infer<typeof exportSettingsSchema>;
export type OCRSettings = z.infer<typeof ocrSettingsSchema>;
export type AISettings = z.infer<typeof aiSettingsSchema>;
