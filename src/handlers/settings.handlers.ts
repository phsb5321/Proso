/**
 * Settings Message Handlers
 *
 * Hexagonal handlers for settings operations.
 * Delegates to ISettingsStore port for persistence.
 *
 * @module handlers/settings
 */

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
 * Test API key for provider.
 * Note: Full validation requires provider-specific adapters.
 * This handler checks if a key is configured.
 */
async function handleTestApiKey(params: ApiKeyParams): Promise<ApiKeyTestResponse> {
  const store = getSettingsStore();

  if (!isValidProvider(params.provider)) {
    return { success: false, error: `Invalid provider: ${params.provider}` };
  }

  const key = await store.getApiKey(params.provider);

  if (!key || key.trim().length === 0) {
    return { success: false, error: 'No API key configured' };
  }

  // For now, just check if key exists
  // Full validation would require calling provider APIs
  return {
    success: true,
    message: 'API key is configured (full validation requires provider-specific test)',
  };
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
