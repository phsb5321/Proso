/**
 * Browser Settings Adapter
 *
 * Adapter implementing ISettingsStore port using browser.storage.local.
 * Wraps the existing SettingsStore class from utils/config/store.
 *
 * @module adapters/storage/browser-settings
 */

import { browser } from 'wxt/browser';
import type { ProviderId } from '../../core/shared/errors';
import type { ISettingsStore, Settings } from '../../ports/settings-store.port';
import { defaults } from '../../utils/config/defaults';
import { settingsStore } from '../../utils/config/store';

/**
 * API key storage keys for each provider.
 *
 * `local` (the user-configured local appliance) has no entry: it is
 * credential-free, and `getApiKey` already answers null for a provider with no
 * storage key. `satisfies` keeps the key-bearing providers exhaustive.
 */
const API_KEY_STORAGE: Partial<Record<ProviderId, string>> = {
  elevenlabs: 'elevenlabsApiKey',
  openai: 'openaiApiKey',
  groq: 'groqApiKey',
  cartesia: 'cartesiaApiKey',
} satisfies Record<Exclude<ProviderId, 'local'>, string>;

/**
 * Browser settings adapter wrapping browser.storage.local via SettingsStore.
 *
 * This adapter:
 * - Delegates to the existing SettingsStore for settings management
 * - Manages API keys separately (not part of Settings schema)
 * - Provides subscription mechanism for reactive updates
 */
export class BrowserSettingsAdapter implements ISettingsStore {
  /**
   * Ensure settings store is initialized.
   */
  private async ensureInitialized(): Promise<void> {
    await settingsStore.load();
  }

  async getSettings(): Promise<Settings> {
    await this.ensureInitialized();
    const all = settingsStore.getAll();

    // Map to port interface (ISettingsStore.Settings)
    return {
      mode: all.mode,
      provider: all.provider,
      voice: all.voice,
      speed: all.speed,
      showCostEstimate: all.showCostEstimate,
      cacheEnabled: all.cacheEnabled,
      maxCacheSize: all.maxCacheSize,
      wordSyncEnabled: all.wordSyncEnabled,
    };
  }

  async updateSettings(updates: Partial<Settings>): Promise<void> {
    await this.ensureInitialized();
    // The persisted settings schema's provider enum is PROVIDERS, which does not
    // include `local` yet — specs/100-local-appliance-tts slice C adds it with
    // the opt-in setting. Until then settingsStore validates with Zod and
    // rejects any provider it does not know, so the widened port type is cast
    // rather than silently narrowed here.
    await settingsStore.save(updates as Parameters<typeof settingsStore.save>[0]);
  }

  async getApiKey(provider: ProviderId): Promise<string | null> {
    const storageKey = API_KEY_STORAGE[provider];
    if (!storageKey) {
      return null;
    }

    try {
      const result = await browser.storage.local.get(storageKey);
      return (result[storageKey] as string) || null;
    } catch {
      return null;
    }
  }

  async setApiKey(provider: ProviderId, key: string): Promise<void> {
    const storageKey = API_KEY_STORAGE[provider];
    if (!storageKey) {
      return;
    }

    await browser.storage.local.set({ [storageKey]: key });
  }

  subscribe(callback: (settings: Settings) => void): () => void {
    // Wrap the callback to map full Settings to port Settings
    const wrappedCallback = () => {
      const all = settingsStore.getAll();
      callback({
        mode: all.mode,
        provider: all.provider,
        voice: all.voice,
        speed: all.speed,
        showCostEstimate: all.showCostEstimate,
        cacheEnabled: all.cacheEnabled,
        maxCacheSize: all.maxCacheSize,
        wordSyncEnabled: all.wordSyncEnabled,
      });
    };

    return settingsStore.subscribe(wrappedCallback);
  }

  /**
   * Get default settings (useful for testing).
   */
  getDefaults(): Settings {
    return {
      mode: defaults.mode,
      provider: defaults.provider,
      voice: defaults.voice,
      speed: defaults.speed,
      showCostEstimate: defaults.showCostEstimate,
      cacheEnabled: defaults.cacheEnabled,
      maxCacheSize: defaults.maxCacheSize,
      wordSyncEnabled: defaults.wordSyncEnabled,
    };
  }
}
