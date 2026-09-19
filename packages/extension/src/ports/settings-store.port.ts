/**
 * Settings Store Port Interface
 *
 * Defines the contract for settings persistence.
 * Adapters: BrowserSettingsAdapter (browser.storage.local)
 *
 * @module ports/settings-store
 */

import type { PronunciationEntry } from '../core/speech/pronunciation-lexicon';
import type { ExtractionMode, ProviderId } from '../core/shared/errors';

/**
 * Application settings (matches existing config schema).
 */
export interface Settings {
  mode: ExtractionMode;
  provider: ProviderId;
  voice: string | null;
  speed: number;
  showCostEstimate: boolean;
  cacheEnabled: boolean;
  maxCacheSize: number;
  wordSyncEnabled: boolean;
  /** Reader-owned pronunciation entries (251); optional for older fixtures. */
  pronunciationLexiconEnabled?: boolean;
  pronunciationLexicon?: readonly PronunciationEntry[];
}

/**
 * Port interface for settings persistence.
 *
 * Implementations:
 * - BrowserSettingsAdapter - browser.storage.local
 */
export interface ISettingsStore {
  /**
   * Get all settings.
   * @returns Current settings
   */
  getSettings(): Promise<Settings>;

  /**
   * Update settings (partial update).
   * @param updates - Partial settings to update
   */
  updateSettings(updates: Partial<Settings>): Promise<void>;

  /**
   * Get API key for provider.
   * @param provider - Provider to get key for
   * @returns API key or null if not set
   */
  getApiKey(provider: ProviderId): Promise<string | null>;

  /**
   * Set API key for provider.
   * @param provider - Provider to set key for
   * @param key - API key
   */
  setApiKey(provider: ProviderId, key: string): Promise<void>;

  /**
   * Subscribe to settings changes.
   * @param callback - Callback for changes
   * @returns Unsubscribe function
   */
  subscribe(callback: (settings: Settings) => void): () => void;
}
