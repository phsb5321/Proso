/**
 * VoxPage Configuration Defaults
 * SINGLE SOURCE OF TRUTH for all default configuration values
 *
 * @module utils/config/defaults
 * @description All components MUST import defaults from this file.
 * No hardcoded default values should exist elsewhere in the codebase.
 */

import type { Settings, FooterState, Mode, Provider, ThemeMode } from './schema';

/**
 * Default configuration values
 * These are applied when:
 * 1. Fresh extension install (no stored values)
 * 2. Invalid stored value (reset to default)
 * 3. Missing key in stored settings (merged with defaults)
 */
export const defaults: Readonly<Settings> = Object.freeze({
  mode: 'article' as Mode,
  provider: 'browser' as Provider,
  voice: null,
  speed: 1.0,
  showCostEstimate: true,
  cacheEnabled: true,
  maxCacheSize: 50,
  wordSyncEnabled: true,
  autoDetectLanguage: true,
  // 027-settings-ux-overhaul
  themeMode: 'system' as ThemeMode,
  highlightEnabled: true,
  autoScroll: true,
});

/**
 * Default voice settings per provider
 * Separate from main defaults as these are provider-specific
 * null means use the first available voice from the provider
 */
export const defaultVoices: Readonly<Record<Provider, string | null>> = Object.freeze({
  openai: 'alloy',
  elevenlabs: null,
  cartesia: null,
  groq: 'hannah',
  browser: null,
});

/**
 * Boundary constraints for numeric settings
 */
export const constraints = Object.freeze({
  speed: { min: 0.5, max: 2.0 },
  maxCacheSize: { min: 10, max: 200 },
});

/**
 * Footer state defaults (018-ui-redesign)
 */
export const footerStateDefaults: Readonly<FooterState> = Object.freeze({
  isVisible: false,
  isMinimized: false,
  position: Object.freeze({
    x: 'center' as const,
    yOffset: 0,
  }),
});

// ========== Roadmap Feature Defaults (023-feature-roadmap) ==========

import type {
  QueueSettings,
  ExportSettings,
  OCRSettings,
  AISettings,
  AIProvider,
  ExportQuality,
} from './schema';

/**
 * Queue settings defaults
 */
export const queueDefaults: Readonly<QueueSettings> = Object.freeze({
  autoPlayNext: true,
  autoArchiveCompleted: false,
  archiveAfterDays: 30,
  maxQueueSize: 300,
});

/**
 * Export settings defaults
 */
export const exportDefaults: Readonly<ExportSettings> = Object.freeze({
  defaultQuality: '192' as ExportQuality,
  includeMetadata: true,
});

/**
 * OCR settings defaults
 */
export const ocrDefaults: Readonly<OCRSettings> = Object.freeze({
  defaultLanguages: ['eng'],
  autoDetect: true,
  showConfidence: false,
});

/**
 * AI summarization settings defaults
 */
export const aiDefaults: Readonly<AISettings> = Object.freeze({
  defaultProvider: 'openai' as AIProvider,
  defaultBulletCount: 5,
  cacheEnabled: true,
  cacheTTLMs: 86400000, // 24 hours
});

/**
 * Extended speed constraints (023-feature-roadmap)
 * Updated from 2.0x max to 4.0x max for extended speed support
 */
export const extendedSpeedConstraints = Object.freeze({
  min: 0.5,
  max: 4.0,
});
