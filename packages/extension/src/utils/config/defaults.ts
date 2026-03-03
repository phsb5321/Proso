// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Configuration Defaults
 * SINGLE SOURCE OF TRUTH for all default configuration values
 *
 * @module utils/config/defaults
 * @description All components MUST import defaults from this file.
 * No hardcoded default values should exist elsewhere in the codebase.
 */

import type { FooterState, Mode, Provider, Settings, ThemeMode } from './schema';

/**
 * Default configuration values
 * These are applied when:
 * 1. Fresh extension install (no stored values)
 * 2. Invalid stored value (reset to default)
 * 3. Missing key in stored settings (merged with defaults)
 */
export const defaults: Readonly<Settings> = Object.freeze({
  mode: 'article' as Mode,
  provider: 'elevenlabs' as Provider,
  voice: null,
  voiceId: 'EXAVITQu4vr4xnSDxMaL', // Rachel voice (045-pdf-removal-page-reader)
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
  // 045-pdf-removal-page-reader
  defaultHighlightColor: 'yellow' as const,
  maxCacheSizeMb: 500,
  telemetryEnabled: false,
  // 064-monorepo-nestjs-dokku
  serverUrl: null,
  licenseKey: null,
});

/**
 * Default voice settings per provider
 * Separate from main defaults as these are provider-specific
 * null means use the first available voice from the provider
 */
export const defaultVoices: Readonly<Record<Provider, string | null>> = Object.freeze({
  elevenlabs: null,
  openai: null,
  groq: null,
  cartesia: null,
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
  AIProvider,
  AISettings,
  ExportQuality,
  ExportSettings,
  QueueSettings,
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

// ========== Audio Cache Defaults (028-smart-audio-cache) ==========

import type { CacheConfig } from '../cache/types';

/**
 * Audio cache configuration defaults
 * IndexedDB-based persistent cache for TTS audio
 */
export const cacheDefaults: Readonly<CacheConfig> = Object.freeze({
  // Size limits
  maxSizeBytes: 500 * 1024 * 1024, // 500 MB
  maxEntries: 1000,

  // Age limits
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days

  // Eviction thresholds - evict to 70% when at 90%
  evictionThresholdPercent: 90,
  evictionTargetPercent: 70,

  // IndexedDB settings
  persistToIndexedDB: true,
  dbName: 'proso-audio-cache',
  storeName: 'audio-entries',
});

/**
 * Cache constraints for validation
 */
export const cacheConstraints = Object.freeze({
  maxSizeBytes: { min: 50 * 1024 * 1024, max: 2 * 1024 * 1024 * 1024 }, // 50MB - 2GB
  maxEntries: { min: 100, max: 10000 },
  maxAgeDays: { min: 1, max: 365 },
  prefetchAhead: { min: 1, max: 10 },
});
