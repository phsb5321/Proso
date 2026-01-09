/**
 * Settings Message Handlers
 *
 * Hexagonal handlers for settings operations.
 * Delegates to ISettingsStore port for persistence.
 *
 * @module handlers/settings
 */

import { browser } from 'wxt/browser';
import type { ProviderId } from '../core/shared/errors';
import type { ISettingsStore, Settings } from '../ports/settings-store.port';
import type { HandlerRegistry } from './registry';

// ============================================
// Response Types
// ============================================

/**
 * Settings handler error type.
 */
export type SettingsHandlerError =
  | { type: 'invalid_settings'; message: string }
  | { type: 'storage_error'; message: string }
  | { type: 'invalid_provider'; provider: string };

/**
 * Response for settings.get handler.
 */
export interface SettingsGetResponse {
  success: true;
  settings: Settings;
}

/**
 * Response for settings.update handler.
 */
export interface SettingsUpdateResponse {
  success: true;
}

/**
 * Response for settings.getApiKey handler.
 */
export interface ApiKeyGetResponse {
  success: true;
  hasKey: boolean;
}

/**
 * Response for settings.setApiKey handler.
 */
export interface ApiKeySetResponse {
  success: true;
}

/**
 * Response for settings.testApiKey handler.
 */
export interface ApiKeyTestResponse {
  success: boolean;
  error?: string;
  message?: string;
}

// ============================================
// Handler Parameters
// ============================================

interface UpdateSettingsParams {
  settings?: Partial<Settings>;
  // Support individual setting updates for backward compatibility
  mode?: Settings['mode'];
  provider?: Settings['provider'];
  voice?: Settings['voice'];
  speed?: Settings['speed'];
  showCostEstimate?: Settings['showCostEstimate'];
  cacheEnabled?: Settings['cacheEnabled'];
  maxCacheSize?: Settings['maxCacheSize'];
  wordSyncEnabled?: Settings['wordSyncEnabled'];
}

interface ApiKeyParams {
  provider: string;
  key?: string;
}

// ============================================
// Handler Factory
// ============================================

let settingsStore: ISettingsStore | null = null;

/**
 * Set the settings store instance for handlers.
 * Called during container initialization.
 */
export function setSettingsStore(store: ISettingsStore): void {
  settingsStore = store;
}

/**
 * Get the settings store instance.
 */
function getSettingsStore(): ISettingsStore {
  if (!settingsStore) {
    throw new Error('Settings store not initialized. Call setSettingsStore() first.');
  }
  return settingsStore;
}

/**
 * Validate provider ID.
 */
function isValidProvider(provider: string): provider is ProviderId {
  return ['openai', 'elevenlabs', 'cartesia', 'groq', 'browser'].includes(provider);
}

// ============================================
// Handlers
// ============================================

/**
 * Get all settings.
 */
async function handleGetSettings(): Promise<SettingsGetResponse> {
  const store = getSettingsStore();
  const settings = await store.getSettings();
  return { success: true, settings };
}

/**
 * Update settings (partial).
 */
async function handleUpdateSettings(params: UpdateSettingsParams): Promise<SettingsUpdateResponse> {
  const store = getSettingsStore();

  // Build updates from either settings object or individual fields
  const updates: Partial<Settings> = params.settings || {};

  // Merge individual field updates for backward compatibility
  if (params.mode !== undefined) updates.mode = params.mode;
  if (params.provider !== undefined) updates.provider = params.provider;
  if (params.voice !== undefined) updates.voice = params.voice;
  if (params.speed !== undefined) updates.speed = params.speed;
  if (params.showCostEstimate !== undefined) updates.showCostEstimate = params.showCostEstimate;
  if (params.cacheEnabled !== undefined) updates.cacheEnabled = params.cacheEnabled;
  if (params.maxCacheSize !== undefined) updates.maxCacheSize = params.maxCacheSize;
  if (params.wordSyncEnabled !== undefined) updates.wordSyncEnabled = params.wordSyncEnabled;

  await store.updateSettings(updates);
  return { success: true };
}

/**
 * Check if API key is configured for provider.
 */
async function handleGetApiKey(params: ApiKeyParams): Promise<ApiKeyGetResponse> {
  const store = getSettingsStore();

  if (!isValidProvider(params.provider)) {
    return { success: true, hasKey: false };
  }

  const key = await store.getApiKey(params.provider);
  return { success: true, hasKey: !!key };
}

/**
 * Set API key for provider.
 */
async function handleSetApiKey(params: ApiKeyParams): Promise<ApiKeySetResponse> {
  const store = getSettingsStore();

  if (!isValidProvider(params.provider)) {
    throw new Error(`Invalid provider: ${params.provider}`);
  }

  if (!params.key) {
    throw new Error('API key is required');
  }

  await store.setApiKey(params.provider, params.key);
  return { success: true };
}

/**
 * API test endpoints for each provider.
 * Uses minimal API calls to validate credentials.
 */
const API_TEST_ENDPOINTS: Record<
  string,
  {
    url: string;
    method: string;
    headers: (apiKey: string) => Record<string, string>;
    body?: unknown;
  }
> = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    method: 'GET',
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
  elevenlabs: {
    url: 'https://api.elevenlabs.io/v1/user',
    method: 'GET',
    headers: (apiKey) => ({
      'xi-api-key': apiKey,
    }),
  },
  cartesia: {
    url: 'https://api.cartesia.ai/voices',
    method: 'GET',
    headers: (apiKey) => ({
      'X-API-Key': apiKey,
      'Cartesia-Version': '2024-06-10',
    }),
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/models',
    method: 'GET',
    headers: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }),
    body: {
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    },
  },
};

/**
 * Test API key for provider.
 * Makes actual API calls to validate credentials.
 */
async function handleTestApiKey(
  params: ApiKeyParams & { apiKey?: string; data?: { provider: string; apiKey: string } },
): Promise<ApiKeyTestResponse> {
  console.log('[Settings] handleTestApiKey called with params:', {
    hasData: !!params.data,
    dataProvider: params.data?.provider,
    directProvider: params.provider,
    hasApiKey: !!params.data?.apiKey || !!params.apiKey || !!params.key,
  });

  // Handle both direct params and wrapped data format
  const provider = params.data?.provider || params.provider;
  const apiKey = params.data?.apiKey || params.apiKey || params.key;

  console.log(
    '[Settings] Resolved provider:',
    provider,
    'hasApiKey:',
    !!apiKey,
    'keyLength:',
    apiKey?.length,
  );

  // Validate provider - also allow 'anthropic' for summarization
  const validProviders = ['openai', 'elevenlabs', 'cartesia', 'groq', 'browser', 'anthropic'];
  if (!validProviders.includes(provider)) {
    console.error('[Settings] Invalid provider:', provider);
    return { success: false, error: `Invalid provider: ${provider}` };
  }

  // Browser provider doesn't need API key
  if (provider === 'browser') {
    return { success: true, message: 'Browser TTS does not require an API key' };
  }

  // If no API key provided, try to get from storage
  let keyToTest: string | null | undefined = apiKey;
  if (!keyToTest || keyToTest.trim().length === 0) {
    console.log('[Settings] No key in params, checking storage...');
    try {
      // Try using the settings store first
      const store = getSettingsStore();
      keyToTest = await store.getApiKey(provider as ProviderId);
      console.log('[Settings] Key from storage via store:', keyToTest ? 'found' : 'not found');
    } catch (storeError) {
      // Fallback: access browser.storage.local directly if store isn't initialized
      console.warn(
        '[Settings] Settings store not available, falling back to direct storage access',
      );
      const storageKeyMap: Record<string, string> = {
        openai: 'openaiApiKey',
        elevenlabs: 'elevenlabsApiKey',
        cartesia: 'cartesiaApiKey',
        groq: 'groqApiKey',
        anthropic: 'anthropic:apiKey',
      };
      const storageKey = storageKeyMap[provider];
      if (storageKey) {
        try {
          const result = await browser.storage.local.get(storageKey);
          keyToTest = (result[storageKey] as string) || null;
          console.log('[Settings] Key from direct storage:', keyToTest ? 'found' : 'not found');
        } catch (storageError) {
          console.error('[Settings] Failed to access storage:', storageError);
        }
      }
    }
  }

  if (!keyToTest || keyToTest.trim().length === 0) {
    console.error('[Settings] No API key available for testing');
    return { success: false, error: 'No API key provided' };
  }

  const endpoint = API_TEST_ENDPOINTS[provider];
  if (!endpoint) {
    console.error('[Settings] No test endpoint for provider:', provider);
    return { success: false, error: `No test endpoint for provider: ${provider}` };
  }

  try {
    const trimmedKey = keyToTest.trim();
    console.log(
      '[Settings] Testing API key for',
      provider,
      'at',
      endpoint.url,
      'keyLength:',
      trimmedKey.length,
    );
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: endpoint.headers(trimmedKey),
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });

    console.log('[Settings] API response status:', response.status, response.statusText);

    if (response.ok) {
      console.log('[Settings] API key validated successfully for', provider);
      return { success: true, message: 'API key is valid' };
    }

    // Try to get error details from response body
    let errorDetail = '';
    try {
      const errorBody = await response.text();
      console.log('[Settings] API error response body:', errorBody);
      errorDetail = errorBody.substring(0, 200); // Limit to first 200 chars
    } catch {
      // Ignore if we can't read the body
    }

    // Handle specific error codes
    if (response.status === 401 || response.status === 403) {
      console.error(
        '[Settings] Authentication failed for',
        provider,
        '- status:',
        response.status,
        errorDetail,
      );
      return { success: false, error: 'Invalid API key' };
    }

    if (response.status === 429) {
      console.warn('[Settings] Rate limited for', provider);
      return { success: false, error: 'Rate limited - key may be valid but quota exceeded' };
    }

    console.error('[Settings] Unexpected status for', provider, ':', response.status);
    return { success: false, error: `API returned status ${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    console.error('[Settings] Network error testing', provider, ':', message);
    return { success: false, error: message };
  }
}

// ============================================
// Registration
// ============================================

/**
 * Register all settings handlers on the given registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerSettingsHandlers(registry: HandlerRegistry): void {
  registry.register('settings.get', handleGetSettings, 'Get all settings');
  registry.register('settings.update', handleUpdateSettings, 'Update settings');
  registry.register('settings.getApiKey', handleGetApiKey, 'Check if API key exists');
  registry.register('settings.setApiKey', handleSetApiKey, 'Set API key for provider');
  registry.register('settings.testApiKey', handleTestApiKey, 'Test API key validation');
}
