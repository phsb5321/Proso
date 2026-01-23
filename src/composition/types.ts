/**
 * Composition Types
 *
 * Type definitions for the dependency injection container.
 *
 * @module composition/types
 */

import type { ContentExtractionService } from '../core/content-extraction/extraction-service';
import type { PlaybackService } from '../core/playback/playback-service';
import type { ProviderId } from '../core/shared/errors';
import type { IAudioGenerator } from '../ports/audio-generator.port';
import type { IAudioUrlProvider } from '../ports/audio-url.port';
import type { ICacheStore } from '../ports/cache-store.port';
import type { IContentScorer } from '../ports/content-scorer.port';
import type { IHighlightSynchronizer } from '../ports/highlight-sync.port';
import type { ISettingsStore } from '../ports/settings-store.port';
import type { ITextExtractor } from '../ports/text-extractor.port';

/**
 * Application configuration for container initialization.
 */
export interface AppConfig {
  readonly provider: ProviderId;
  readonly cacheType: 'indexeddb' | 'memory';
}

/**
 * API keys for providers (retrieved from settings store).
 * 049-tts-provider-consolidation: Removed openai (browser has no API key)
 * 050-groq-tts-provider: Added groq
 */
export interface ApiKeys {
  readonly groq: string | null;
  readonly elevenlabs: string | null;
  readonly browser: null; // Browser TTS has no API key
}

/**
 * Dependencies required by PlaybackService.
 */
export interface PlaybackServiceDependencies {
  readonly audioGenerator: IAudioGenerator;
  readonly audioUrlProvider: IAudioUrlProvider;
  readonly cacheStore: ICacheStore;
  readonly highlightSync: IHighlightSynchronizer;
  readonly settingsStore: ISettingsStore;
}

/**
 * Dependencies required by ContentExtractionService.
 */
export interface ContentExtractionServiceDependencies {
  readonly textExtractor: ITextExtractor;
  readonly contentScorer: IContentScorer;
}

/**
 * All adapters available in the container.
 */
export interface ContainerAdapters {
  readonly audioGenerator: IAudioGenerator;
  readonly audioUrlProvider: IAudioUrlProvider;
  readonly cacheStore: ICacheStore;
  readonly highlightSync: IHighlightSynchronizer;
  readonly textExtractor: ITextExtractor;
  readonly contentScorer: IContentScorer;
  readonly settingsStore: ISettingsStore;
}

/**
 * Services created by the container.
 *
 * T015: Services are now always available (non-optional) since all
 * adapters have fallbacks. PlaybackService uses NoOpHighlightSyncAdapter
 * and InMemoryCacheAdapter if primary adapters fail.
 */
export interface ContainerServices {
  /** Playback orchestration service - always available via fallback adapters. */
  readonly playback: PlaybackService;

  /** Content extraction service - always available. */
  readonly contentExtraction: ContentExtractionService;
}

/**
 * Complete container with adapters and services.
 */
export interface Container {
  readonly adapters: ContainerAdapters;
  readonly services: ContainerServices;
  readonly config: AppConfig;
}
