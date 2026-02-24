/**
 * Adapter Factories
 *
 * Factory functions for creating adapters based on configuration.
 * Each factory returns an adapter implementing the appropriate port interface.
 *
 * @module composition/factories
 */

import type { ProviderId } from '../core/shared/errors';
import type { IAudioGenerator } from '../ports/audio-generator.port';
import type { IAudioUrlProvider } from '../ports/audio-url.port';
import type { ICacheStore } from '../ports/cache-store.port';
import type { IContentScorer } from '../ports/content-scorer.port';
import type { IHighlightSynchronizer } from '../ports/highlight-sync.port';
import type { ISettingsStore } from '../ports/settings-store.port';
import type { ITextExtractor } from '../ports/text-extractor.port';
import type { IApiClient } from '../ports/api-client.port';
import type { ApiKeys } from './types';
import { TTSProvider } from '@proso/shared';

// Audio adapters
import {
  AudioUrlAdapter,
  BrowserTtsAudioAdapter,
  CartesiaAudioAdapter,
  ElevenLabsAudioAdapter,
  GroqAudioAdapter,
  OpenAiAudioAdapter,
  ServerTtsAudioAdapter,
} from '../adapters/audio';

// Messaging adapters
import { HighlightSyncAdapter, NoOpHighlightSyncAdapter } from '../adapters/messaging';

// Cache adapters
import { InMemoryCacheAdapter, IndexedDBCacheAdapter } from '../adapters/cache';

// Storage adapters
import { BrowserSettingsAdapter } from '../adapters/storage';

// Content adapters
import { ReadabilityExtractorAdapter, TrafilaturaScorerAdapter } from '../adapters/content';

// API adapters
import { ProsoApiAdapter, NoOpApiClientAdapter } from '../adapters/api';

/**
 * Create an audio generator adapter based on provider.
 *
 * INV-002: BYOK is always available. If apiClient is configured and provider
 * is not 'browser' (INV-005: browser TTS always client-side) and no BYOK
 * API key is set, routes through server proxy for managed credits.
 *
 * @param provider - Provider to create adapter for
 * @param apiKey - API key for the provider (null for browser)
 * @param apiClient - Optional API client for server proxy routing
 * @returns IAudioGenerator adapter
 *
 * @throws Error if provider is unknown or API key is missing (for non-browser providers without server)
 */
export function createAudioGeneratorAdapter(
  provider: ProviderId,
  apiKey: string | null,
  apiClient?: IApiClient,
): IAudioGenerator {
  // INV-005: Browser TTS is always client-side, unlimited
  if (provider === 'browser') {
    return new BrowserTtsAudioAdapter();
  }

  // INV-002: If user has a BYOK API key, use direct provider adapter
  if (apiKey) {
    return createDirectProviderAdapter(provider, apiKey);
  }

  // If server is configured, route through server proxy (managed credits)
  if (apiClient?.isConfigured) {
    const providerMap: Record<string, TTSProvider> = {
      openai: TTSProvider.OpenAI,
      elevenlabs: TTSProvider.ElevenLabs,
      groq: TTSProvider.Groq,
    };
    return new ServerTtsAudioAdapter(apiClient, providerMap[provider]);
  }

  // No API key and no server — error
  throw new Error(`${provider} API key is required (or configure Proso server for managed credits)`);
}

/**
 * Create a direct (BYOK) provider adapter.
 */
function createDirectProviderAdapter(provider: ProviderId, apiKey: string): IAudioGenerator {
  switch (provider) {
    case 'elevenlabs':
      return new ElevenLabsAudioAdapter(apiKey);

    case 'openai':
      return new OpenAiAudioAdapter(apiKey);

    case 'groq':
      return new GroqAudioAdapter(apiKey);

    case 'cartesia':
      return new CartesiaAudioAdapter(apiKey);

    default:
      throw new Error(`Unknown audio provider: ${provider as string}`);
  }
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
