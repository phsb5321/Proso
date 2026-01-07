// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Message Handlers Index
 * Exports all domain-based message handlers
 *
 * @module utils/messaging/handlers
 */

// Playback handlers
export {
  handlePlaybackStart,
  handlePlaybackPause,
  handlePlaybackStop,
  handlePlaybackNext,
  handlePlaybackPrev,
  handlePlaybackSeek,
  handlePlaybackGetState,
  handlePlaybackSetSpeed,
} from './playback';

// Audio handlers
export {
  handleAudioGenerate,
  handleAudioCache,
  handleAudioClearCache,
  handleAudioGetCacheState,
} from './audio';

// Provider handlers
export {
  handleProviderSelect,
  handleProviderGetList,
  handleProviderValidateLanguageSupport,
} from './provider';

// Content handlers
export {
  handleContentExtract,
  handleContentScore,
  handleContentFindDOMElements,
} from './content';

// Highlight handlers
export {
  handleHighlightParagraph,
  handleHighlightWord,
  handleHighlightClear,
  handleHighlightGetState,
} from './highlight';

// Language handlers
export {
  handleLanguageDetect,
  handleLanguageGetState,
  handleLanguageSetOverride,
  handleLanguageClearOverride,
} from './language';

// Settings handlers
export {
  handleSettingsGet,
  handleSettingsUpdate,
  handleSettingsMigrate,
} from './settings';

// Footer handlers
export {
  handleFooterShow,
  handleFooterHide,
  handleFooterUpdateState,
  handleFooterGetState,
  handleFooterAction,
} from './footer';

// Logging handlers
export {
  handleLoggingLogRemote,
  handleLoggingFlushBuffer,
  handleLoggingGetState,
} from './logging';

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
