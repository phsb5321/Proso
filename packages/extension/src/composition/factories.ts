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
import type { ApiKeys } from './types';

// Audio adapters
import {
  AudioUrlAdapter,
  BrowserTtsAudioAdapter,
  CartesiaAudioAdapter,
  ElevenLabsAudioAdapter,
  GroqAudioAdapter,
  OpenAiAudioAdapter,
} from '../adapters/audio';

// Messaging adapters
import { HighlightSyncAdapter, NoOpHighlightSyncAdapter } from '../adapters/messaging';

// Cache adapters
import { InMemoryCacheAdapter, IndexedDBCacheAdapter } from '../adapters/cache';

// Storage adapters
import { BrowserSettingsAdapter } from '../adapters/storage';

// Content adapters
import { ReadabilityExtractorAdapter, TrafilaturaScorerAdapter } from '../adapters/content';

/**
 * Create an audio generator adapter based on provider.
 *
 * @param provider - Provider to create adapter for
 * @param apiKey - API key for the provider (null for browser)
 * @returns IAudioGenerator adapter
 *
 * @throws Error if provider is unknown or API key is missing (for non-browser providers)
 */
export function createAudioGeneratorAdapter(
  provider: ProviderId,
  apiKey: string | null,
): IAudioGenerator {
  switch (provider) {
    case 'browser':
      return new BrowserTtsAudioAdapter();

    case 'elevenlabs':
      if (!apiKey) {
        throw new Error('ElevenLabs API key is required');
      }
      return new ElevenLabsAudioAdapter(apiKey);

    case 'openai':
      if (!apiKey) {
        throw new Error('OpenAI API key is required');
      }
      return new OpenAiAudioAdapter(apiKey);

    case 'groq':
      if (!apiKey) {
        throw new Error('Groq API key is required');
      }
      return new GroqAudioAdapter(apiKey);

    case 'cartesia':
      if (!apiKey) {
        throw new Error('Cartesia API key is required');
      }
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
