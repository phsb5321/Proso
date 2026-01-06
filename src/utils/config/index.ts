// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Configuration Module
 * Centralized exports for all configuration-related functionality
 *
 * @module utils/config
 */

// Export Zod schemas and types
export {
  settingsSchema,
  footerStateSchema,
  footerPositionSchema,
  detectedLanguageSchema,
  languagePreferenceSchema,
  MODES,
  PROVIDERS,
  DETECTION_SOURCES,
  type Settings,
  type FooterState,
  type FooterPosition,
  type DetectedLanguage,
  type LanguagePreference,
  type Mode,
  type Provider,
  type DetectionSource,
} from './schema';

// Export defaults
export { defaults, defaultVoices, constraints, footerStateDefaults, queueDefaults } from './defaults';

// Export store
export { SettingsStore, settingsStore } from './store';

// Export migrations
export { migrations, applyMigrations, getPendingMigrationCount, CURRENT_CONFIG_VERSION } from './migrations';
