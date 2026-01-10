/**
 * Port Interfaces
 *
 * Exports all port interfaces that define contracts between
 * the domain layer and infrastructure adapters.
 *
 * @module ports
 */

// Audio Generator Port
export type {
  IAudioGenerator,
  AudioRequest,
  AudioResponse,
  WordTiming,
  Voice,
} from './audio-generator.port';

// Audio URL Provider Port
export type { IAudioUrlProvider } from './audio-url.port';

// Cache Store Port
export type {
  ICacheStore,
  CacheKey,
  CacheEntry,
  CacheStats,
} from './cache-store.port';

// Highlight Synchronizer Port
export type {
  IHighlightSynchronizer,
  FooterState,
  PlaybackStatus,
} from './highlight-sync.port';

// Text Extractor Port
export type {
  ITextExtractor,
  ExtractedContent,
  Paragraph,
} from './text-extractor.port';

// Content Scorer Port
export type {
  IContentScorer,
  ContentScore,
} from './content-scorer.port';

// Settings Store Port
export type {
  ISettingsStore,
  Settings,
} from './settings-store.port';
