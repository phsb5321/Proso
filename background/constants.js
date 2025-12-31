/**
 * VoxPage Constants
 * Shared constants for the background service worker
 */

/**
 * Playback status enum
 * Represents the current state of audio playback
 */
export const PlaybackStatus = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ERROR: 'error'
});

/**
 * Message types for communication between components
 */
export const MessageType = Object.freeze({
  // Playback control
  PLAY: 'play',
  PAUSE: 'pause',
  STOP: 'stop',
  PREV: 'prev',
  NEXT: 'next',

  // State queries
  GET_STATE: 'getState',
  TEXT_CONTENT: 'textContent',

  // Settings
  SET_PROVIDER: 'setProvider',
  SET_VOICE: 'setVoice',
  SET_SPEED: 'setSpeed',

  // Content script actions
  EXTRACT_TEXT: 'extractText',
  HIGHLIGHT: 'highlight',
  CLEAR_HIGHLIGHT: 'clearHighlight',

  // Events
  PLAYBACK_STATE: 'playbackState',
  PROGRESS: 'progress',
  ERROR: 'error',
  PARAGRAPH_CHANGED: 'paragraphChanged',
  CACHE_HIT: 'cacheHit',
  PRE_GENERATING: 'preGenerating',

  // Floating controller (004-playback-sync-highlight)
  SHOW_FLOATING_CONTROLLER: 'showFloatingController',
  HIDE_FLOATING_CONTROLLER: 'hideFloatingController',
  UPDATE_PLAYBACK_STATE: 'updatePlaybackState',
  CONTROLLER_ACTION: 'controllerAction',
  CONTROLLER_POSITION_CHANGED: 'controllerPositionChanged',
  SEEK_TO_POSITION: 'seekToPosition',

  // Word-level highlighting (004-playback-sync-highlight)
  HIGHLIGHT_WORD: 'highlightWord',
  SET_WORD_TIMELINE: 'setWordTimeline',
  JUMP_TO_WORD: 'jumpToWord',
  SYNC_STATUS: 'syncStatus',

  // Audio-text sync messages (007-audio-sync-extraction-overhaul)
  REQUEST_EXTRACT_CONTENT: 'requestExtractContent',
  CONTENT_EXTRACTED: 'contentExtracted',
  HIGHLIGHT_PARAGRAPH: 'highlightParagraph',
  CLEAR_HIGHLIGHTS: 'clearHighlights',
  SYNC_STATE_UPDATE: 'syncStateUpdate',
  REQUEST_RESYNC: 'requestResync',
  SYNC_ERROR: 'syncError'
});

/**
 * Provider IDs
 */
export const ProviderId = Object.freeze({
  OPENAI: 'openai',
  ELEVENLABS: 'elevenlabs',
  CARTESIA: 'cartesia',
  GROQ: 'groq',
  BROWSER: 'browser'
});

/**
 * Storage keys
 * NOTE: These must match the keys used in options.js
 */
export const StorageKey = Object.freeze({
  SETTINGS: 'settings',
  API_KEY_OPENAI: 'openaiApiKey',
  API_KEY_ELEVENLABS: 'elevenlabsApiKey',
  API_KEY_CARTESIA: 'cartesiaApiKey',
  API_KEY_GROQ: 'groqApiKey',
  FLOATING_CONTROLLER_POSITION: 'floatingControllerPosition',
  WORD_SYNC_ENABLED: 'wordSyncEnabled',
  // Word timing cache (007-audio-sync-extraction-overhaul)
  WORD_TIMING_CACHE: 'wordTimingCache',
  WORD_TIMING_CACHE_SIZE: 'wordTimingCacheSize'
});

/**
 * Groq Whisper API configuration for word-level timestamps
 * Used by GroqTimestampProvider for audio-text synchronization
 */
export const GroqWhisper = Object.freeze({
  API_ENDPOINT: 'https://api.groq.com/openai/v1/audio/transcriptions',
  MODEL: 'whisper-large-v3-turbo',
  MODEL_ACCURATE: 'whisper-large-v3',
  RESPONSE_FORMAT: 'verbose_json'
});

/**
 * Default settings
 */
export const DefaultSettings = Object.freeze({
  defaultProvider: ProviderId.BROWSER,
  defaultVoice: {},
  defaultSpeed: 1.0,
  showCostEstimate: true,
  cacheEnabled: true,
  maxCacheSize: 50
});

/**
 * Sync configuration (007-audio-sync-extraction-overhaul)
 * Based on research from spec.md
 */
export const SyncConfig = Object.freeze({
  // FR-002: Update sync state at least 4x/second (250ms max interval)
  SYNC_INTERVAL_MS: 250,
  // FR-006: Drift threshold for auto-correction
  DRIFT_THRESHOLD_MS: 200,
  // FR-007: Max time to resync after tab visibility change
  RESYNC_TIMEOUT_MS: 500,
  // SC-001: Word highlighting latency target
  WORD_LATENCY_TARGET_MS: 100,
  // SC-002: Paragraph highlighting latency target
  PARAGRAPH_LATENCY_TARGET_MS: 200,
  // SC-008: Word timing cache size limit (5MB)
  WORD_TIMING_CACHE_MAX_BYTES: 5 * 1024 * 1024,
  // FR-015: Minimum text length for content blocks
  MIN_CONTENT_LENGTH: 30,
  // FR-016: Link density threshold for navigation filtering
  LINK_DENSITY_THRESHOLD: 0.7
});
