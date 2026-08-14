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
import type { IApiClient } from '../ports/api-client.port';
import type { ISettingsStore, Settings } from '../ports/settings-store.port';
import { createLogger } from '../utils/logging/logger';
import type { HandlerRegistry } from './registry';

const log = createLogger('handler');

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
  failure?: 'invalid' | 'unavailable';
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
let settingsApiClient: IApiClient | null = null;

/**
 * Set the settings store instance for handlers.
 * Called during container initialization.
 */
export function setSettingsStore(store: ISettingsStore): void {
  settingsStore = store;
}

/**
 * Set the API client instance for settings handlers.
 * Used to route TTS API key validation through the server.
 */
export function setSettingsApiClient(client: IApiClient): void {
  settingsApiClient = client;
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
  return ['elevenlabs', 'openai', 'groq', 'cartesia', 'local'].includes(provider);
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
 * TTS providers that are validated via the Proso server's test-key endpoint.
 * These providers no longer make direct API calls from the extension.
 */
const SERVER_VALIDATED_TTS_PROVIDERS = new Set(['elevenlabs', 'openai', 'groq', 'cartesia']);
// The local provider takes no key and is never server-validated (PROSO-110).

/**
 * API test endpoints for non-TTS providers (tested directly from extension).
 * TTS providers are validated via the server's POST /api/v1/tts/test-key endpoint.
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
  log.debug('[Settings] handleTestApiKey called with params', {
    hasData: !!params.data,
    dataProvider: params.data?.provider,
    directProvider: params.provider,
    hasApiKey: !!params.data?.apiKey || !!params.apiKey || !!params.key,
  });

  // Handle both direct params and wrapped data format
  const provider = params.data?.provider || params.provider;
  const apiKey = params.data?.apiKey || params.apiKey || params.key;

  log.debug('[Settings] Resolved provider', {
    provider,
    hasApiKey: !!apiKey,
    keyLength: apiKey?.length,
  });

  // Validate provider — TTS providers route through server, anthropic uses direct fetch
  const validProviders = [...SERVER_VALIDATED_TTS_PROVIDERS, 'anthropic'];
  if (!validProviders.includes(provider)) {
    log.error('[Settings] Invalid provider', { provider });
    return { success: false, error: `Invalid provider: ${provider}`, failure: 'invalid' };
  }

  // If no API key provided, try to get from storage
  let keyToTest: string | null | undefined = apiKey;
  if (!keyToTest || keyToTest.trim().length === 0) {
    log.debug('[Settings] No key in params, checking storage...');
    try {
      const store = getSettingsStore();
      keyToTest = await store.getApiKey(provider as ProviderId);
      log.debug('[Settings] Key from storage via store', {
        found: keyToTest ? 'found' : 'not found',
      });
    } catch (_storeError) {
      log.warn('[Settings] Settings store not available, falling back to direct storage access');
      const storageKeyMap: Record<string, string> = {
        elevenlabs: 'elevenlabsApiKey',
        openai: 'openaiApiKey',
        groq: 'groqApiKey',
        cartesia: 'cartesiaApiKey',
        anthropic: 'anthropic:apiKey',
      };
      const storageKey = storageKeyMap[provider];
      if (storageKey) {
        try {
          const result = await browser.storage.local.get(storageKey);
          keyToTest = (result[storageKey] as string) || null;
          log.debug('[Settings] Key from direct storage', {
            found: keyToTest ? 'found' : 'not found',
          });
        } catch (storageError) {
          log.error('[Settings] Failed to access storage', { error: storageError });
        }
      }
    }
  }

  if (!keyToTest || keyToTest.trim().length === 0) {
    log.error('[Settings] No API key available for testing');
    return { success: false, error: 'No API key provided', failure: 'invalid' };
  }

  const trimmedKey = keyToTest.trim();

  // TTS providers: validate via the Proso server's test-key endpoint
  if (SERVER_VALIDATED_TTS_PROVIDERS.has(provider)) {
    if (!settingsApiClient || !settingsApiClient.isConfigured) {
      return {
        success: false,
        error: 'Proso server not configured. Cannot validate TTS API keys.',
        failure: 'unavailable',
      };
    }
    try {
      log.info('[Settings] Testing TTS key via server', { provider });
      const result = await settingsApiClient.testApiKey(provider, trimmedKey);
      if (result.ok) {
        if (result.value.success) {
          return { success: true, message: 'API key is valid' };
        }
        return {
          success: false,
          error: result.value.error ?? 'Key validation failed',
          // A successful test-key round trip reached the selected provider;
          // its negative answer is credential evidence, not a transport guess.
          failure: 'invalid',
        };
      }
      // API client error (network, timeout, etc.) never proves rejection.
      const err = result.error;
      return {
        success: false,
        error: 'message' in err ? err.message : 'Server request failed',
        failure: 'unavailable',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      log.error('[Settings] Server test-key error', { provider, error: message });
      return { success: false, error: message, failure: 'unavailable' };
    }
  }

  // Non-TTS providers (anthropic): validate via direct fetch
  const endpoint = API_TEST_ENDPOINTS[provider];
  if (!endpoint) {
    log.error('[Settings] No test endpoint for provider', { provider });
    return {
      success: false,
      error: `No test endpoint for provider: ${provider}`,
      failure: 'unavailable',
    };
  }

  try {
    log.info('[Settings] Testing API key', {
      provider,
      url: endpoint.url,
      keyLength: trimmedKey.length,
    });
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: endpoint.headers(trimmedKey),
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });

    log.debug('[Settings] API response status', {
      status: response.status,
      statusText: response.statusText,
    });

    if (response.ok) {
      log.info('[Settings] API key validated successfully', { provider });
      return { success: true, message: 'API key is valid' };
    }

    // Try to get error details from response body
    let errorDetail = '';
    try {
      const errorBody = await response.text();
      log.debug('[Settings] API error response body', { errorBody });
      errorDetail = errorBody.substring(0, 200);
    } catch {
      // Ignore if we can't read the body
    }

    if (response.status === 401 || response.status === 403) {
      log.error('[Settings] Authentication failed', {
        provider,
        status: response.status,
        errorDetail,
      });
      return { success: false, error: 'Invalid API key', failure: 'invalid' };
    }

    if (response.status === 429) {
      log.warn('[Settings] Rate limited', { provider });
      return {
        success: false,
        error: 'Rate limited - key may be valid but quota exceeded',
        failure: 'unavailable',
      };
    }

    log.error('[Settings] Unexpected status', { provider, status: response.status });
    return {
      success: false,
      error: `API returned status ${response.status}`,
      failure: 'unavailable',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    log.error('[Settings] Network error testing', { provider, error: message });
    return { success: false, error: message, failure: 'unavailable' };
  }
}

// ============================================
// Theme Management (T068)
// ============================================

/**
 * Theme mode type.
 */
type ThemeModeType = 'light' | 'dark' | 'system';

/**
 * Settings section type for reset operations.
 */
type SettingsSectionType = 'quick-settings' | 'appearance' | 'reading-queue' | 'developer' | 'all';

/**
 * Response for settings.getTheme handler.
 */
export interface ThemeGetResponse {
  mode: ThemeModeType;
  resolvedTheme: 'light' | 'dark';
}

/**
 * Response for settings.setTheme handler.
 */
export interface ThemeSetResponse {
  success: boolean;
  mode: ThemeModeType;
  resolvedTheme: 'light' | 'dark';
}

/**
 * Response for settings.resetSection handler.
 */
export interface SettingsResetResponse {
  success: boolean;
  section: string;
  resetKeys: string[];
}

/**
 * Section-to-keys mapping for reset operations.
 */
const SECTION_KEYS: Record<SettingsSectionType, string[]> = {
  'quick-settings': ['provider', 'voice', 'speed'],
  appearance: ['themeMode', 'highlightEnabled', 'autoScroll'],
  'reading-queue': ['queue:settings'],
  developer: ['loggingConfig'],
  all: [
    'provider',
    'voice',
    'speed',
    'themeMode',
    'highlightEnabled',
    'autoScroll',
    'queue:settings',
    'loggingConfig',
  ],
};

/**
 * Default values for each key used in reset operations.
 */
const RESET_DEFAULTS: Record<string, unknown> = {
  provider: 'elevenlabs',
  voice: null,
  speed: 1.0,
  themeMode: 'system',
  highlightEnabled: true,
  autoScroll: true,
  'queue:settings': {
    autoPlayNext: true,
    autoArchiveCompleted: false,
    archiveAfterDays: 30,
    maxQueueSize: 300,
  },
  loggingConfig: {
    enabled: false,
    endpoint: null,
    authType: 'none',
    logLevel: 'warn',
    batchIntervalMs: 10000,
    maxBatchSize: 100,
    maxBufferBytes: 1048576,
  },
};

/**
 * Get current theme preference.
 */
async function handleGetTheme(): Promise<ThemeGetResponse> {
  const result = await browser.storage.local.get('themeMode');
  const mode = (result.themeMode as ThemeModeType) || 'system';

  // Resolve system theme — in background context, default to light
  let resolvedTheme: 'light' | 'dark' = 'light';
  if (mode !== 'system') {
    resolvedTheme = mode;
  }

  return { mode, resolvedTheme };
}

/**
 * Set theme preference.
 */
async function handleSetTheme(params: { mode?: ThemeModeType }): Promise<ThemeSetResponse> {
  const mode = params.mode ?? 'system';

  await browser.storage.local.set({ themeMode: mode });

  let resolvedTheme: 'light' | 'dark' = 'light';
  if (mode !== 'system') {
    resolvedTheme = mode;
  }

  return { success: true, mode, resolvedTheme };
}

/**
 * Reset a settings section to defaults.
 * API keys are excluded from reset operations.
 */
async function handleResetSection(params: {
  section?: SettingsSectionType;
}): Promise<SettingsResetResponse> {
  const section = params.section ?? 'all';

  const keysToReset = SECTION_KEYS[section];
  if (!keysToReset) {
    return { success: false, section, resetKeys: [] };
  }

  // Build the reset object
  const resetValues: Record<string, unknown> = {};
  for (const key of keysToReset) {
    if (RESET_DEFAULTS[key] !== undefined) {
      resetValues[key] = RESET_DEFAULTS[key];
    }
  }

  await browser.storage.local.set(resetValues);

  return { success: true, section, resetKeys: keysToReset };
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
  registry.register('settings.getTheme', handleGetTheme, 'Get current theme preference');
  registry.register('settings.setTheme', handleSetTheme, 'Set theme preference');
  registry.register(
    'settings.resetSection',
    handleResetSection,
    'Reset settings section to defaults',
  );
}
