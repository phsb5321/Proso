/**
 * Shared Core Utilities
 *
 * Exports Result types and domain error types for use throughout
 * the hexagonal architecture.
 *
 * @module core/shared
 */

// Result type utilities
export {
  type Result,
  Ok,
  Err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
} from './result';

// Domain error types
export {
  type ProviderId,
  type ExtractionMode,
  type PlaybackError,
  type ContentExtractionError,
  type CacheError,
  type AudioError,
  type HighlightError,
  type SettingsError,
  playbackError,
  contentError,
  cacheError,
  audioError,
  highlightError,
} from './errors';
