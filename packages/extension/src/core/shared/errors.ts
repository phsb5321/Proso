/**
 * Domain Error Types for Hexagonal Architecture
 *
 * Typed discriminated unions for all domain-layer errors.
 * Each error type contains context needed for handling and logging.
 *
 * @module core/shared/errors
 */

/**
 * Provider identifier type (matches existing schema).
 */
export type ProviderId = 'elevenlabs' | 'openai' | 'groq' | 'cartesia' | 'local';

/**
 * Text extraction mode (matches existing schema).
 */
export type ExtractionMode = 'selection' | 'article' | 'full';

/**
 * Playback-related errors.
 */
export type PlaybackError =
  | { type: 'audio_generation'; provider: ProviderId; message: string }
  | { type: 'no_content'; mode: ExtractionMode }
  | { type: 'invalid_paragraph_index'; index: number; max: number }
  | { type: 'tab_not_found'; tabId: number }
  | { type: 'provider_unavailable'; provider: ProviderId }
  | { type: 'playback_failed'; reason: string };

/**
 * Content extraction errors.
 */
export type ContentExtractionError =
  | { type: 'no_readable_content' }
  | { type: 'extraction_failed'; message: string }
  | { type: 'invalid_selection' }
  | { type: 'dom_access_denied' };

/**
 * Cache storage errors.
 */
export type CacheError =
  | { type: 'storage_full'; currentSize: number; maxSize: number }
  | { type: 'entry_not_found'; key: string }
  | { type: 'serialization_failed'; message: string }
  | { type: 'database_error'; message: string };

/**
 * Audio generation errors.
 */
export type AudioError =
  | { type: 'network'; message: string }
  | { type: 'rate_limit'; retryAfterMs: number }
  | { type: 'invalid_credentials' }
  | { type: 'unsupported_language'; language: string }
  | { type: 'text_too_long'; maxLength: number }
  | { type: 'provider_error'; code: string; message: string }
  // The server refused on entitlement grounds (HTTP 402). It is distinct from
  // `network` so the reader sees the server's actionable message without a
  // false transport-failure prefix.
  | { type: 'payment_required'; message: string };

/**
 * Highlight synchronization errors.
 */
export type HighlightError =
  | { type: 'tab_not_found'; tabId: number }
  | { type: 'content_script_not_loaded' }
  | { type: 'message_failed'; message: string };

/**
 * Settings store errors.
 */
export type SettingsError =
  | { type: 'storage_read_failed'; message: string }
  | { type: 'storage_write_failed'; message: string }
  | { type: 'validation_failed'; field: string; message: string };

/**
 * Create a playback error helper.
 */
export const playbackError = {
  audioGeneration: (provider: ProviderId, message: string): PlaybackError => ({
    type: 'audio_generation',
    provider,
    message,
  }),
  noContent: (mode: ExtractionMode): PlaybackError => ({
    type: 'no_content',
    mode,
  }),
  invalidParagraphIndex: (index: number, max: number): PlaybackError => ({
    type: 'invalid_paragraph_index',
    index,
    max,
  }),
  tabNotFound: (tabId: number): PlaybackError => ({
    type: 'tab_not_found',
    tabId,
  }),
  providerUnavailable: (provider: ProviderId): PlaybackError => ({
    type: 'provider_unavailable',
    provider,
  }),
  playbackFailed: (reason: string): PlaybackError => ({
    type: 'playback_failed',
    reason,
  }),
};

/**
 * Create a content extraction error helper.
 */
export const contentError = {
  noReadableContent: (): ContentExtractionError => ({
    type: 'no_readable_content',
  }),
  extractionFailed: (message: string): ContentExtractionError => ({
    type: 'extraction_failed',
    message,
  }),
  invalidSelection: (): ContentExtractionError => ({
    type: 'invalid_selection',
  }),
  domAccessDenied: (): ContentExtractionError => ({
    type: 'dom_access_denied',
  }),
};

/**
 * Create a cache error helper.
 */
export const cacheError = {
  storageFull: (currentSize: number, maxSize: number): CacheError => ({
    type: 'storage_full',
    currentSize,
    maxSize,
  }),
  entryNotFound: (key: string): CacheError => ({
    type: 'entry_not_found',
    key,
  }),
  serializationFailed: (message: string): CacheError => ({
    type: 'serialization_failed',
    message,
  }),
  databaseError: (message: string): CacheError => ({
    type: 'database_error',
    message,
  }),
};

/**
 * Create an audio error helper.
 */
export const audioError = {
  network: (message: string): AudioError => ({
    type: 'network',
    message,
  }),
  rateLimit: (retryAfterMs: number): AudioError => ({
    type: 'rate_limit',
    retryAfterMs,
  }),
  invalidCredentials: (): AudioError => ({
    type: 'invalid_credentials',
  }),
  unsupportedLanguage: (language: string): AudioError => ({
    type: 'unsupported_language',
    language,
  }),
  textTooLong: (maxLength: number): AudioError => ({
    type: 'text_too_long',
    maxLength,
  }),
  providerError: (code: string, message: string): AudioError => ({
    type: 'provider_error',
    code,
    message,
  }),
  paymentRequired: (message: string): AudioError => ({
    type: 'payment_required',
    message,
  }),
};

/**
 * Create a highlight error helper.
 */
export const highlightError = {
  tabNotFound: (tabId: number): HighlightError => ({
    type: 'tab_not_found',
    tabId,
  }),
  contentScriptNotLoaded: (): HighlightError => ({
    type: 'content_script_not_loaded',
  }),
  messageFailed: (message: string): HighlightError => ({
    type: 'message_failed',
    message,
  }),
};
