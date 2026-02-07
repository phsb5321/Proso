// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Message Handlers Index
 * Exports all domain-based message handlers
 *
 * NOTE: Pure stub handlers (playback, audio, content, provider, footer,
 * highlight, language, logging) were removed in 057-background-migration.
 * These domains are now served by hexagonal handlers in src/handlers/.
 *
 * @module utils/messaging/handlers
 */

// Settings handlers
export {
  handleSettingsGet,
  handleSettingsUpdate,
  handleSettingsMigrate,
} from './settings';

// Cache handlers (028-smart-audio-cache)
export {
  handleCacheGetStats,
  handleCacheClear,
  handleCacheClearUrl,
  handleCacheCheck,
  handleCacheGet,
  handleCacheSet,
  handlePrefetchStart,
  handlePrefetchGetStatus,
  handleCostEstimate,
  handleParagraphsGetStatus,
} from './cache-handlers';
