/**
 * Browser Settings Adapter
 *
 * Adapter implementing ISettingsStore port using browser.storage.local.
 * Wraps the existing SettingsStore class from utils/config/store.
 *
 * @module adapters/storage/browser-settings
 */

import type { ProviderId } from '../../core/shared/errors';
import type { ISettingsStore, Settings } from '../../ports/settings-store.port';
import { defaults } from '../../utils/config/defaults';
import { settingsStore } from '../../utils/config/store';

/**
 * API key storage keys for each provider.
 * 050-groq-tts-provider: Added 'groq' for Groq TTS
 */
const API_KEY_STORAGE: Record<ProviderId, string> = {
  groq: 'groqApiKey',
  elevenlabs: 'elevenlabsApiKey',
  browser: '', // Browser TTS doesn't need API key
};

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
    // 050-groq-tts-provider: Added providerOverride, groqModel, groqVoice
    return {
      mode: all.mode,
      provider: all.provider,
      voice: all.voice,
      speed: all.speed,
      showCostEstimate: all.showCostEstimate,
      cacheEnabled: all.cacheEnabled,
      maxCacheSize: all.maxCacheSize,
      wordSyncEnabled: all.wordSyncEnabled,
      providerOverride: all.providerOverride,
      groqModel: all.groqModel,
      groqVoice: all.groqVoice,
    };
  }

  async updateSettings(updates: Partial<Settings>): Promise<void> {
    await this.ensureInitialized();
    await settingsStore.save(updates);
  }

  async getApiKey(provider: ProviderId): Promise<string | null> {
    if (provider === 'browser') {
      return null; // Browser TTS doesn't need API key
    }

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
    if (provider === 'browser') {
      return; // Browser TTS doesn't need API key
    }

    const storageKey = API_KEY_STORAGE[provider];
    if (!storageKey) {
      return;
    }

    await browser.storage.local.set({ [storageKey]: key });
  }

  subscribe(callback: (settings: Settings) => void): () => void {
    // Wrap the callback to map full Settings to port Settings
    // 050-groq-tts-provider: Added providerOverride, groqModel, groqVoice
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
        providerOverride: all.providerOverride,
        groqModel: all.groqModel,
        groqVoice: all.groqVoice,
      });
    };

    return settingsStore.subscribe(wrappedCallback);
  }

  /**
   * Get default settings (useful for testing).
   * 050-groq-tts-provider: Added providerOverride, groqModel, groqVoice
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
      providerOverride: defaults.providerOverride,
      groqModel: defaults.groqModel,
      groqVoice: defaults.groqVoice,
    };
  }
}
