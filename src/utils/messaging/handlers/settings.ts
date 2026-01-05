/**
 * Settings Message Handlers
 * Handles settings management messages
 *
 * @module utils/messaging/handlers/settings
 * @description FR-023: API key testing, FR-008: Theme management, FR-026: Reset functionality
 */

import type { VoxPageProtocol, ApiProviderType, ThemeModeType, SettingsSectionType } from '../protocol';
import type { SettingsUpdateParams, SettingsMigrateParams } from '../types';
import { settingsUpdateParamsSchema, settingsMigrateParamsSchema } from '../schemas';
import { defaults } from '../../config';

/**
 * Get settings handler
 */
export async function handleSettingsGet(): Promise<VoxPageProtocol['settings.get']['response']> {
  // TODO Phase 4: Delegate to SettingsStore.load()

  return {
    mode: 'article',
    provider: 'browser',
    voice: null,
    speed: 1.0,
    showCostEstimate: true,
    cacheEnabled: true,
    maxCacheSize: 50,
    wordSyncEnabled: true,
  };
}

/**
 * Update settings handler
 */
export async function handleSettingsUpdate(
  params: SettingsUpdateParams
): Promise<VoxPageProtocol['settings.update']['response']> {
  const validated = settingsUpdateParamsSchema.parse(params);

  // TODO Phase 4: Delegate to SettingsStore.save()

  return {
    success: true,
    settings: {
      mode: validated.mode ?? 'article',
      provider: validated.provider ?? 'browser',
      voice: validated.voice ?? null,
      speed: validated.speed ?? 1.0,
      showCostEstimate: validated.showCostEstimate ?? true,
      cacheEnabled: validated.cacheEnabled ?? true,
      maxCacheSize: validated.maxCacheSize ?? 50,
      wordSyncEnabled: validated.wordSyncEnabled ?? true,
    },
  };
}

/**
 * Migrate settings handler
 */
export async function handleSettingsMigrate(
  params: SettingsMigrateParams
): Promise<VoxPageProtocol['settings.migrate']['response']> {
  const validated = settingsMigrateParamsSchema.parse(params);

  // TODO Phase 4: Delegate to SettingsStore.migrate()

  return {
    success: true,
    migratedKeys: [],
  };
}

// ========================================
// API KEY TESTING (027-settings-ux-overhaul T028)
// ========================================

/**
 * API endpoint configurations for testing
 */
const API_TEST_ENDPOINTS: Record<ApiProviderType, {
  url: string;
  method: string;
  headers: (apiKey: string) => Record<string, string>;
  body?: unknown;
}> = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    method: 'GET',
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
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
      'Authorization': `Bearer ${apiKey}`,
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
 * Test API key handler
 * FR-023: API key testing with feedback
 */
export async function handleSettingsTestApiKey(
  params: { provider: ApiProviderType; apiKey: string }
): Promise<VoxPageProtocol['settings.testApiKey']['response']> {
  const { provider, apiKey } = params;
  const startTime = performance.now();

  // Validate inputs
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      success: false,
      provider,
      error: 'API key is required',
    };
  }

  const endpoint = API_TEST_ENDPOINTS[provider];
  if (!endpoint) {
    return {
      success: false,
      provider,
      error: `Unknown provider: ${provider}`,
    };
  }

  try {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: endpoint.headers(apiKey.trim()),
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (response.ok) {
      return {
        success: true,
        provider,
        latencyMs,
      };
    }

    // Handle specific error codes
    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        provider,
        error: 'Invalid API key',
        latencyMs,
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        provider,
        error: 'Rate limited - try again later',
        latencyMs,
      };
    }

    return {
      success: false,
      provider,
      error: `API error: ${response.status} ${response.statusText}`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    const message = error instanceof Error ? error.message : 'Network error';

    return {
      success: false,
      provider,
      error: message,
      latencyMs,
    };
  }
}

// ========================================
// THEME MANAGEMENT (027-settings-ux-overhaul T059)
// ========================================

/**
 * Get current theme preference
 * FR-008: Theme switching
 */
export async function handleSettingsGetTheme(): Promise<VoxPageProtocol['settings.getTheme']['response']> {
  const result = await browser.storage.local.get('themeMode');
  const mode = (result.themeMode as ThemeModeType) || 'system';

  // Resolve system theme
  let resolvedTheme: 'light' | 'dark' = 'light';
  if (mode === 'system') {
    // In background context, we can't access matchMedia, so default to light
    // The content script/options page will handle system preference
    resolvedTheme = 'light';
  } else {
    resolvedTheme = mode;
  }

  return {
    mode,
    resolvedTheme,
  };
}

/**
 * Set theme preference
 * FR-008: Theme switching with instant apply
 */
export async function handleSettingsSetTheme(
  params: { mode: ThemeModeType }
): Promise<VoxPageProtocol['settings.setTheme']['response']> {
  const { mode } = params;

  await browser.storage.local.set({ themeMode: mode });

  // Resolve theme for response
  let resolvedTheme: 'light' | 'dark' = 'light';
  if (mode !== 'system') {
    resolvedTheme = mode;
  }

  return {
    success: true,
    mode,
    resolvedTheme,
  };
}

// ========================================
// RESET FUNCTIONALITY (027-settings-ux-overhaul T062)
// ========================================

/**
 * Section-to-keys mapping for reset operations
 */
const SECTION_KEYS: Record<SettingsSectionType, string[]> = {
  'quick-settings': ['provider', 'voice', 'speed'],
  'appearance': ['themeMode', 'highlightEnabled', 'autoScroll'],
  'reading-queue': ['queue:settings'],
  'developer': ['loggingConfig'],
  'all': ['provider', 'voice', 'speed', 'themeMode', 'highlightEnabled', 'autoScroll', 'queue:settings', 'loggingConfig'],
};

/**
 * Default values for each key
 */
const RESET_DEFAULTS: Record<string, unknown> = {
  provider: defaults.provider,
  voice: defaults.voice,
  speed: defaults.speed,
  themeMode: defaults.themeMode,
  highlightEnabled: defaults.highlightEnabled,
  autoScroll: defaults.autoScroll,
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
 * Reset settings section handler
 * FR-026: Reset with API key exclusion
 */
export async function handleSettingsResetSection(
  params: { section: SettingsSectionType }
): Promise<VoxPageProtocol['settings.resetSection']['response']> {
  const { section } = params;

  const keysToReset = SECTION_KEYS[section];
  if (!keysToReset) {
    return {
      success: false,
      section,
      resetKeys: [],
    };
  }

  // Build the reset object
  const resetValues: Record<string, unknown> = {};
  for (const key of keysToReset) {
    if (RESET_DEFAULTS[key] !== undefined) {
      resetValues[key] = RESET_DEFAULTS[key];
    }
  }

  // Apply the reset
  await browser.storage.local.set(resetValues);

  return {
    success: true,
    section,
    resetKeys: keysToReset,
  };
}
