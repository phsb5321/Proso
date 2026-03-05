/**
 * Adapter Factories
 *
 * Factory functions for creating adapters based on configuration.
 * Each factory returns an adapter implementing the appropriate port interface.
 *
 * @module composition/factories
 */

import { TTSProvider } from '@proso/shared';
import type { ProviderId } from '../core/shared/errors';
import type { IApiClient } from '../ports/api-client.port';
import type { IAudioGenerator } from '../ports/audio-generator.port';
import type { IAudioUrlProvider } from '../ports/audio-url.port';
import type { ICacheStore } from '../ports/cache-store.port';
import type { IContentScorer } from '../ports/content-scorer.port';
import type { IHighlightSynchronizer } from '../ports/highlight-sync.port';
import type { ISettingsStore } from '../ports/settings-store.port';
import type { ITextExtractor } from '../ports/text-extractor.port';
import type { ApiKeys } from './types';

// Audio adapters
import { AudioUrlAdapter, ServerTtsAudioAdapter } from '../adapters/audio';

// Messaging adapters
import { HighlightSyncAdapter, NoOpHighlightSyncAdapter } from '../adapters/messaging';

// Cache adapters
import { InMemoryCacheAdapter, IndexedDBCacheAdapter } from '../adapters/cache';

// Storage adapters
import { BrowserSettingsAdapter } from '../adapters/storage';

// Content adapters
import { ReadabilityExtractorAdapter, TrafilaturaScorerAdapter } from '../adapters/content';

// API adapters
import { NoOpApiClientAdapter, ProsoApiAdapter } from '../adapters/api';

/**
 * Create an audio generator adapter based on provider.
 *
 * All premium TTS routes through the server (ServerTtsAudioAdapter).
 * BYOK keys are forwarded to the server in the request body.
 *
 * INV-002: BYOK is always available — keys forwarded to server for single-request use.
 *
 * @param provider - Provider to create adapter for
 * @param apiKey - BYOK API key for the provider (null = managed credits)
 * @param apiClient - API client for server proxy routing
 * @returns IAudioGenerator adapter
 *
 * @throws Error if no server is configured
 */
export function createAudioGeneratorAdapter(
  provider: ProviderId,
  apiKey: string | null,
  apiClient?: IApiClient,
): IAudioGenerator {
  // All providers route through the server
  if (apiClient?.isConfigured) {
    const providerMap: Record<string, TTSProvider> = {
      openai: TTSProvider.OpenAI,
      elevenlabs: TTSProvider.ElevenLabs,
      groq: TTSProvider.Groq,
      cartesia: TTSProvider.Cartesia,
    };
    // Pass BYOK key (if any) to server adapter for forwarding
    return new ServerTtsAudioAdapter(apiClient, providerMap[provider], apiKey ?? undefined);
  }

  // No server configured — error
  throw new Error(
    `Proso server is required for ${provider} TTS. Configure server URL in settings.`,
  );
}

/**
 * Create a cache store adapter based on type.
 *
 * @param type - Cache type ('indexeddb' or 'memory')
 * @returns ICacheStore adapter
 */
export function createCacheStoreAdapter(type: 'indexeddb' | 'memory'): ICacheStore {
  switch (type) {
    case 'indexeddb':
      return new IndexedDBCacheAdapter();
    case 'memory':
      return new InMemoryCacheAdapter();
    default:
      throw new Error(`Unknown cache type: ${type as string}`);
  }
}

/**
 * Create a highlight synchronizer adapter.
 *
 * @param useNoOp - If true, returns a no-op adapter that silently succeeds
 * @returns IHighlightSynchronizer adapter
 */
export function createHighlightSyncAdapter(useNoOp = false): IHighlightSynchronizer {
  if (useNoOp) {
    return new NoOpHighlightSyncAdapter();
  }
  return new HighlightSyncAdapter();
}

/**
 * Create a highlight synchronizer adapter with fallback to no-op.
 *
 * Attempts to create real adapter first, falls back to no-op on error.
 *
 * @returns IHighlightSynchronizer adapter
 */
export function createHighlightSyncAdapterWithFallback(): IHighlightSynchronizer {
  try {
    return new HighlightSyncAdapter();
  } catch {
    console.warn('[Factory] HighlightSyncAdapter failed, using NoOp fallback');
    return new NoOpHighlightSyncAdapter();
  }
}

/**
 * Create a text extractor adapter.
 *
 * @returns ITextExtractor adapter
 */
export function createTextExtractorAdapter(): ITextExtractor {
  return new ReadabilityExtractorAdapter();
}

/**
 * Create a content scorer adapter.
 *
 * @returns IContentScorer adapter
 */
export function createContentScorerAdapter(): IContentScorer {
  return new TrafilaturaScorerAdapter();
}

/**
 * Create a settings store adapter.
 *
 * @returns ISettingsStore adapter
 */
export function createSettingsStoreAdapter(): ISettingsStore {
  return new BrowserSettingsAdapter();
}

/**
 * Create an audio URL provider adapter.
 *
 * @returns IAudioUrlProvider adapter
 */
export function createAudioUrlAdapter(): IAudioUrlProvider {
  return new AudioUrlAdapter();
}

/**
 * Get API key from keys object based on provider.
 *
 * @param keys - API keys object
 * @param provider - Provider to get key for
 * @returns API key or null
 */
export function getApiKeyForProvider(keys: ApiKeys, provider: ProviderId): string | null {
  switch (provider) {
    case 'elevenlabs':
      return keys.elevenlabs;
    case 'openai':
      return keys.openai;
    case 'groq':
      return keys.groq;
    case 'cartesia':
      return keys.cartesia;
    default:
      return null;
  }
}

/**
 * Create an API client adapter.
 *
 * Returns ProsoApiAdapter when serverUrl is configured,
 * otherwise returns NoOpApiClientAdapter (BYOK-only mode).
 *
 * @param serverUrl - Proso server URL (null = not configured)
 * @param licenseKey - User's license key (null = not configured)
 * @returns IApiClient adapter
 */
export function createApiClientAdapter(
  serverUrl: string | null,
  licenseKey: string | null,
): IApiClient {
  if (serverUrl) {
    return new ProsoApiAdapter(serverUrl, licenseKey);
  }
  return new NoOpApiClientAdapter();
}
