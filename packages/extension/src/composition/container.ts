/**
 * Service Container
 *
 * Composition root that creates and wires all adapters and services.
 * This is the only place where concrete adapter implementations are used.
 *
 * @module composition/container
 */

import { NoOpAudioGeneratorAdapter } from '../adapters/audio';
import { InMemoryCacheAdapter } from '../adapters/cache';
import { NoOpHighlightSyncAdapter } from '../adapters/messaging';
import { ContentExtractionService } from '../core/content-extraction/extraction-service';
import { PlaybackService } from '../core/playback/playback-service';
import type { IAudioGenerator } from '../ports/audio-generator.port';
import { createLogger } from '../utils/logging/logger';
import { playbackQueue, prefetchService } from '../utils/playback';
import {
  createApiClientAdapter,
  createAudioGeneratorAdapter,
  createAudioUrlAdapter,
  createCacheStoreAdapter,
  createContentScorerAdapter,
  createHighlightSyncAdapter,
  createSettingsStoreAdapter,
  createTextExtractorAdapter,
  getApiKeyForProvider,
} from './factories';
import type { ApiKeys, AppConfig, Container, ContainerAdapters, ContainerServices } from './types';

const log = createLogger('background');

/**
 * Container instance (singleton).
 */
let containerInstance: Container | null = null;

/**
 * Create all adapters based on configuration.
 *
 * T013-T014: Fixed initialization order and added fallback adapters.
 * All adapters are now always available (using fallbacks if primary fails).
 * This ensures PlaybackService is always available per AC-09.
 */
function createAdapters(config: AppConfig, apiKeys: ApiKeys): ContainerAdapters {
  const apiKey = getApiKeyForProvider(apiKeys, config.provider);

  // API client (064-monorepo-nestjs-dokku)
  const apiClient = createApiClientAdapter(config.serverUrl ?? null, config.licenseKey ?? null);

  // Audio generator — routes through server proxy for managed credits (INV-002)
  // Falls back to NoOp if server is not configured, preventing cascade failure
  let audioGenerator: ContainerAdapters['audioGenerator'];
  try {
    audioGenerator = createAudioGeneratorAdapter(config.provider, apiKey, apiClient);
    log.info('[Container] Audio generator', {
      generator: audioGenerator.constructor.name,
      apiClientConfigured: apiClient.isConfigured,
      serverUrl: config.serverUrl,
    });
  } catch (error) {
    log.warn('[Container] Audio generator failed, using no-op fallback', { error });
    audioGenerator = new NoOpAudioGeneratorAdapter(
      error instanceof Error ? error.message : 'Server not configured',
    );
  }

  // Audio URL provider (no fallback needed - always works)
  const audioUrlProvider = createAudioUrlAdapter();

  // Create content adapters (always available)
  const textExtractor = createTextExtractorAdapter();
  const contentScorer = createContentScorerAdapter();

  // T014: Cache store with in-memory fallback (IndexedDB may fail on init)
  let cacheStore: ContainerAdapters['cacheStore'];
  try {
    cacheStore = createCacheStoreAdapter(config.cacheType);
  } catch (error) {
    log.warn('[Container] IndexedDB cache failed, using in-memory fallback', { error });
    cacheStore = new InMemoryCacheAdapter();
  }

  // T011: Highlight sync with no-op fallback (always succeeds)
  let highlightSync: ContainerAdapters['highlightSync'];
  try {
    highlightSync = createHighlightSyncAdapter();
  } catch (error) {
    log.warn('[Container] HighlightSync failed, using no-op fallback', { error });
    highlightSync = new NoOpHighlightSyncAdapter();
  }

  // Settings store (should always succeed - wraps browser.storage.local)
  let settingsStore: ContainerAdapters['settingsStore'];
  try {
    settingsStore = createSettingsStoreAdapter();
  } catch (error) {
    // This should not happen, but log if it does
    log.error('[Container] SettingsStore failed', { error });
    throw error; // Re-throw - settings store is critical
  }

  return {
    audioGenerator,
    audioUrlProvider,
    cacheStore,
    highlightSync,
    textExtractor,
    contentScorer,
    settingsStore,
    apiClient,
  };
}

/**
 * Create all services with injected dependencies.
 *
 * T015: Removed conditional service creation - adapters now always available
 * due to fallback adapters, so services should always be created.
 */
function createServices(adapters: ContainerAdapters): ContainerServices {
  // T015: PlaybackService is always created now that adapters have fallbacks
  // All required adapters are guaranteed to exist (see createAdapters)
  const playback = new PlaybackService({
    audioGenerator: adapters.audioGenerator,
    audioUrlProvider: adapters.audioUrlProvider,
    cacheStore: adapters.cacheStore,
    highlightSync: adapters.highlightSync,
    settingsStore: adapters.settingsStore,
    // S3/T012: lookahead prefetch pipeline. Bound to `playback` itself so the
    // producer/checkCache callbacks reuse the exact same cache-key + network
    // path as live playback (see PlaybackService.generatePrefetchAudio /
    // isParagraphCached).
    prefetch: { service: prefetchService, queue: playbackQueue },
  });
  prefetchService.configure(
    playbackQueue,
    (text, index, signal) => playback.generatePrefetchAudio(text, index, signal),
    (index) => playback.isParagraphCached(index),
  );

  // ContentExtractionService is always created (adapters always available)
  const contentExtraction = new ContentExtractionService({
    textExtractor: adapters.textExtractor,
    contentScorer: adapters.contentScorer,
  });

  return {
    playback,
    contentExtraction,
  };
}

/**
 * Create and initialize the container.
 *
 * @param config - Application configuration
 * @param apiKeys - API keys for providers
 * @returns Initialized container
 */
export function createContainer(config: AppConfig, apiKeys: ApiKeys): Container {
  const adapters = createAdapters(config, apiKeys);
  const services = createServices(adapters);

  const container: Container = {
    adapters,
    services,
    config,
  };

  containerInstance = container;
  return container;
}

/**
 * Get the current container instance.
 *
 * T016: This function now returns the container directly without throwing.
 * If container is not initialized, callers should handle the null case
 * or use ensureContainerInitialized() for auto-init on service worker wake-up.
 *
 * @throws Error if container not initialized
 */
export function getContainer(): Container {
  if (!containerInstance) {
    throw new Error('Container not initialized. Call createContainer() first.');
  }
  return containerInstance;
}

/**
 * T016: Lazy re-initialization check for service worker wake-up.
 *
 * Service workers can be terminated after 5-30 seconds of inactivity.
 * When they wake up, the container may need to be re-initialized.
 * This function provides a way to ensure the container is ready.
 *
 * @param config - App configuration for lazy init
 * @param apiKeys - API keys for lazy init
 * @returns The container (existing or newly created)
 */
export async function ensureContainerInitialized(
  config: AppConfig,
  apiKeys: ApiKeys,
): Promise<Container> {
  if (containerInstance) {
    return containerInstance;
  }

  log.info('[Container] Re-initializing after service worker wake-up');
  return createContainer(config, apiKeys);
}

/**
 * Check if container is initialized.
 */
export function isContainerInitialized(): boolean {
  return containerInstance !== null;
}

/**
 * Reset container (primarily for testing).
 */
export function resetContainer(): void {
  containerInstance = null;
}

/**
 * Reconfigure the audio generator with a different provider.
 *
 * @param provider - New provider
 * @param apiKey - API key for the provider
 */
export function reconfigureAudioGenerator(
  provider: AppConfig['provider'],
  apiKey: string | null,
): void {
  if (!containerInstance) {
    throw new Error('Container not initialized');
  }

  let newAudioGenerator: IAudioGenerator;
  try {
    newAudioGenerator = createAudioGeneratorAdapter(
      provider,
      apiKey,
      containerInstance.adapters.apiClient,
    );
  } catch (error) {
    log.warn('[Container] Audio generator reconfigure failed, using no-op fallback', { error });
    newAudioGenerator = new NoOpAudioGeneratorAdapter(
      error instanceof Error ? error.message : 'Server not configured',
    );
  }

  // Create new container with updated audio generator
  containerInstance = {
    ...containerInstance,
    adapters: {
      ...containerInstance.adapters,
      audioGenerator: newAudioGenerator,
    },
    config: {
      ...containerInstance.config,
      provider,
    },
  };

  // T016: Also update the PlaybackService's audio generator reference
  // Without this, PlaybackService holds a stale reference to the old generator
  if (containerInstance.services.playback) {
    containerInstance.services.playback.setAudioGenerator(newAudioGenerator);
  }
}

/**
 * Get the PlaybackService from the container.
 *
 * @throws Error if container not initialized or PlaybackService not available
 */
export function getPlaybackService(): PlaybackService {
  const container = getContainer();
  if (!container.services.playback) {
    throw new Error(
      'PlaybackService not available. ' + 'Ensure cache adapter is implemented (Phase 5).',
    );
  }
  return container.services.playback;
}

/**
 * Check if PlaybackService is available.
 */
export function isPlaybackServiceAvailable(): boolean {
  if (!containerInstance) {
    return false;
  }
  return !!containerInstance.services.playback;
}

/**
 * Get the ContentExtractionService from the container.
 *
 * @throws Error if container not initialized or ContentExtractionService not available
 */
export function getContentExtractionService(): ContentExtractionService {
  const container = getContainer();
  if (!container.services.contentExtraction) {
    throw new Error(
      'ContentExtractionService not available. ' + 'Ensure content adapters are implemented.',
    );
  }
  return container.services.contentExtraction;
}

/**
 * Check if ContentExtractionService is available.
 */
export function isContentExtractionServiceAvailable(): boolean {
  if (!containerInstance) {
    return false;
  }
  return !!containerInstance.services.contentExtraction;
}
