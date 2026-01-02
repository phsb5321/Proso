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
  FLOATING_CONTROLLER_POSITION: 'floatingControllerPosition', // DEPRECATED: Use FOOTER_STATE
  WORD_SYNC_ENABLED: 'wordSyncEnabled',
  // Word timing cache (007-audio-sync-extraction-overhaul)
  WORD_TIMING_CACHE: 'wordTimingCache',
  WORD_TIMING_CACHE_SIZE: 'wordTimingCacheSize',
  // Remote logging (014-loki-remote-logging)
  LOGGING_CONFIG: 'loggingConfig',
  LOG_BUFFER: 'logBuffer',
  LOG_RETRY_QUEUE: 'logRetryQueue',
  // Footer state (018-ui-redesign)
  FOOTER_STATE: 'footerState'
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
 * @deprecated Use shared/config/defaults.js instead (SSOT pattern)
 * This export is kept temporarily for backwards compatibility.
 * All new code should import from '../shared/config/defaults.js'
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
 * Lifecycle message types (011-highlight-playback-fix)
 * Used for page navigation and playback cleanup
 */
export const LifecycleMessageType = Object.freeze({
  STOP_PLAYBACK: 'stopPlayback',
  FORCE_STOP_PLAYBACK: 'forceStopPlayback',
  REQUEST_RESYNC: 'requestResync'
});

/**
 * Scroll message types (011-highlight-playback-fix)
 * Used for auto-scroll coordination
 */
export const ScrollMessageType = Object.freeze({
  HIGHLIGHT_WITH_SCROLL: 'highlightWithScroll',
  REPORT_SCROLL_STATE: 'reportScrollState'
});

/**
 * Selection message types (011-highlight-playback-fix)
 * Used for paragraph selection mode
 */
export const SelectionMessageType = Object.freeze({
  ENABLE_SELECTION_MODE: 'enableSelectionMode',
  DISABLE_SELECTION_MODE: 'disableSelectionMode',
  PLAY_FROM_PARAGRAPH: 'playFromParagraph'
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

/**
 * Log levels for remote logging (014-loki-remote-logging)
 * Numeric values for comparison (debug < info < warn < error)
 */
export const LogLevel = Object.freeze({
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
});

/**
 * Numeric log level values for filtering comparison
 */
export const LogLevelValue = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
});

/**
 * Log component identifiers (014-loki-remote-logging)
 * Used for stream labels in Loki
 */
export const LogComponent = Object.freeze({
  BACKGROUND: 'background',
  CONTENT: 'content',
  POPUP: 'popup',
  OPTIONS: 'options'
});

/**
 * Authentication types for Loki endpoint (014-loki-remote-logging)
 */
export const LogAuthType = Object.freeze({
  NONE: 'none',
  BASIC: 'basic',
  BEARER: 'bearer',
  CLOUDFLARE: 'cloudflare'
});

/**
 * Logging configuration defaults (014-loki-remote-logging)
 * These are also defined in shared/config/logging-defaults.js for SSOT
 */
export const LoggingConfig = Object.freeze({
  // FR-003: Batch send interval (10 seconds)
  BATCH_INTERVAL_MS: 10000,
  // FR-004: Buffer limit (1MB)
  MAX_BUFFER_BYTES: 1048576,
  // Max entries per batch
  MAX_BATCH_SIZE: 100,
  // Circuit breaker threshold
  MAX_CONSECUTIVE_FAILURES: 10,
  // Retry delays with exponential backoff (ms)
  RETRY_DELAYS: [1000, 2000, 4000, 8000, 16000],
  // Max retry attempts
  MAX_RETRY_ATTEMPTS: 5
});

/**
 * Footer message types (018-ui-redesign)
 * Used for communication between background, content script footer, and popup
 */
export const FooterMessageTypes = Object.freeze({
  // Background → Content
  FOOTER_STATE_UPDATE: 'FOOTER_STATE_UPDATE',
  FOOTER_SHOW: 'FOOTER_SHOW',
  FOOTER_HIDE: 'FOOTER_HIDE',

  // Content → Background
  FOOTER_ACTION: 'FOOTER_ACTION',
  FOOTER_POSITION_CHANGED: 'FOOTER_POSITION_CHANGED',
  FOOTER_VISIBILITY_CHANGED: 'FOOTER_VISIBILITY_CHANGED',

  // Popup → Background
  SHOW_FOOTER: 'SHOW_FOOTER',
  GET_PLAYBACK_STATUS: 'GET_PLAYBACK_STATUS'
});

/**
 * Footer action types (018-ui-redesign)
 * Used in FOOTER_ACTION message payloads
 */
export const FooterActions = Object.freeze({
  PLAY: 'play',
  PAUSE: 'pause',
  STOP: 'stop',
  NEXT: 'next',
  PREV: 'prev',
  SEEK: 'seek',
  SPEED: 'speed',
  CLOSE: 'close',
  MINIMIZE: 'minimize',
  EXPAND: 'expand'
});
