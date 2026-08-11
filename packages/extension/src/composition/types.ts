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
import type { IApiClient } from '../ports/api-client.port';
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
  readonly serverUrl: string | null;
  readonly licenseKey: string | null;
  // PROSO-110: user-operated synthesis host. Off by default; the address is
  // the reader's own entry, never a shipped constant.
  readonly localHostUrl: string | null;
  readonly localHostEnabled: boolean;
  readonly localHostVoice: string | null;
}

/**
 * API keys for providers (retrieved from settings store).
 */
export interface ApiKeys {
  readonly elevenlabs: string | null;
  readonly openai: string | null;
  readonly groq: string | null;
  readonly cartesia: string | null;
}

/**
 * Dependencies required by PlaybackService.
 *
 * Re-exported from the service that consumes it, so the contract has one
 * definition. It used to be declared here as well, and the two copies had to be
 * kept in step by hand.
 */
export type { PlaybackServiceDependencies } from '../core/playback/playback-service';

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
  readonly apiClient: IApiClient;
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
