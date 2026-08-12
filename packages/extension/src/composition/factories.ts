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
import { browser } from 'wxt/browser';
import { originCoveredByGrantedPatterns } from '../utils/permissions/match-pattern';
import {
  AudioUrlAdapter,
  FallbackAudioAdapter,
  LocalHostAudioAdapter,
  NoOpAudioGeneratorAdapter,
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
/** ProviderId -> server TTSProvider mapping (single definition). */
const SERVER_PROVIDER_MAP: Record<string, TTSProvider> = {
  openai: TTSProvider.OpenAI,
  elevenlabs: TTSProvider.ElevenLabs,
  groq: TTSProvider.Groq,
  cartesia: TTSProvider.Cartesia,
};

/**
 * Secondary for the local provider: the existing server route when
 * configured, otherwise a no-op with the reason (today's behaviour when
 * nothing is configured).
 */
function createServerOrNoOpSecondary(apiClient?: IApiClient): IAudioGenerator {
  if (apiClient?.isConfigured) {
    return new ServerTtsAudioAdapter(
      apiClient,
      SERVER_PROVIDER_MAP.elevenlabs ?? TTSProvider.ElevenLabs,
      undefined,
    );
  }
  return new NoOpAudioGeneratorAdapter(
    'Proso server is required for TTS. Configure server URL in settings.',
  );
}

export function createAudioGeneratorAdapter(
  provider: ProviderId,
  apiKey: string | null,
  apiClient?: IApiClient,
): IAudioGenerator {
  // PROSO-110: the local synthesis host is the reader's own route. The
  // adapter is constructed lazily inside the gate, so a build with no user
  // configuration never builds it and issues no request (FR-2). The gate
  // enforces: enabled flag set, URL configured, and the runtime host
  // permission granted for the entered origin (constitution 2.1.0).
  if (provider === 'local') {
    const gate = async (): Promise<{ ok: boolean; reason?: string }> => {
      const stored = await browser.storage.local.get(['localHostUrl', 'localHostEnabled']);
      if (stored.localHostEnabled !== true) {
        return { ok: false, reason: 'Local synthesis host is disabled' };
      }
      const url = stored.localHostUrl as string | undefined;
      if (!url) {
        return { ok: false, reason: 'Local synthesis host URL is not configured' };
      }
      let origin: string;
      try {
        origin = new URL(url).origin;
      } catch {
        return { ok: false, reason: `Local synthesis host URL is invalid: ${url}` };
      }
      // Effective access, not the optional-grant proxy (PROSO-114):
      // permissions.contains() only consults the optional-grant table, so on
      // a build whose manifest grants <all_urls> at install (the reading
      // journey's host access) it returns false for an origin the extension
      // ALREADY has access to — the gate could never pass. getAll() returns
      // every granted pattern, install-time and optional alike; the gate
      // passes when any of them covers the configured origin. The
      // constitutional condition (runtime permission for the exact origin)
      // still holds on builds without <all_urls>: nothing is granted until
      // the settings flow calls permissions.request().
      const granted = await browser.permissions.getAll();
      if (!originCoveredByGrantedPatterns(origin, granted.origins ?? [])) {
        return {
          ok: false,
          reason:
            'The extension has no access to the configured host origin — enable it in settings to grant it',
        };
      }
      return { ok: true };
    };

    return new FallbackAudioAdapter({
      // PROSO-114: a reader who chose their own host and has no account gets
      // a 402 from the server route that points them at tiers and API keys —
      // the wrong diagnosis. On gate failure the local route fails closed
      // with the gate's own reason instead of falling back to a route that
      // cannot succeed.
      failClosedOnGate: true,
      primaryFactory: async () => {
        const stored = await browser.storage.local.get(['localHostUrl']);
        const url = stored.localHostUrl as string;
        // Voice selection flows through the request (`voice` setting), which
        // the adapter resolves against the host's published voices.
        return new LocalHostAudioAdapter({ baseUrl: url });
      },
      secondary: createServerOrNoOpSecondary(apiClient),
      gate,
    });
  }

  // All providers route through the server
  if (apiClient?.isConfigured) {
    // Pass BYOK key (if any) to server adapter for forwarding
    return new ServerTtsAudioAdapter(
      apiClient,
      SERVER_PROVIDER_MAP[provider] ?? TTSProvider.ElevenLabs,
      apiKey ?? undefined,
    );
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
    case 'local':
      // The local synthesis host takes no key (PROSO-110).
      return null;
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
