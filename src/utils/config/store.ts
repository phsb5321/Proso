/**
 * VoxPage Settings Store
 * Centralized settings management with validation and persistence
 *
 * @module utils/config/store
 * @description Manages configuration lifecycle: load, validate, migrate, save.
 * Uses browser.storage.local for persistence across extension contexts.
 */

import { defaults } from './defaults';
import { settingsSchema, type Settings } from './schema';
import { applyMigrations } from './migrations';

/**
 * Callback function for settings changes
 */
type SettingsChangeCallback = (newSettings: Settings, changedKeys: string[]) => void;

/**
 * Options for save operation
 */
interface SaveOptions {
  /**
   * Mark settings as explicitly changed by user
   */
  explicit?: boolean;
}

/**
 * Settings store instance for centralized configuration management
 */
export class SettingsStore {
  private _cache: Settings | null = null;
  private _subscribers: Set<SettingsChangeCallback> = new Set();
  private _initialized = false;

  /**
   * Load settings from storage, applying migrations and validation
   * @returns Validated settings merged with defaults
   */
  async load(): Promise<Settings> {
    try {
      // Get all stored settings
      const stored = await browser.storage.local.get();

      // Apply any pending migrations
      const migrated = await applyMigrations(stored, (partial) =>
        browser.storage.local.set(partial)
      );

      // Merge with defaults (stored values override defaults)
      const merged = { ...defaults, ...migrated };

      // Validate using Zod schema and apply defaults for missing values
      const validated = settingsSchema.parse(merged);

      this._cache = validated;
      this._initialized = true;
      return { ...validated };
    } catch (error) {
      console.error('VoxPage: Failed to load settings:', error);
      this._cache = { ...defaults };
      return { ...defaults };
    }
  }

  /**
   * Save partial settings to storage
   * @param partial - Settings to update
   * @param options - Save options
   * @throws {Error} If validation fails
   */
  async save(partial: Partial<Settings>, options: SaveOptions = {}): Promise<void> {
    const { explicit = false } = options;

    // Ensure cache is loaded
    if (!this._cache) {
      await this.load();
    }

    // Merge partial with current cache for full validation
    const merged = { ...this._cache, ...partial };

    // Validate full settings object with Zod
    const validated = settingsSchema.parse(merged);

    // Track which keys actually changed
    const changedKeys: string[] = [];
    const toSave: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(partial)) {
      // Skip migration flags
      if (key.startsWith('_')) {
        toSave[key] = value;
        continue;
      }

      // Only save if value changed
      if (this._cache && this._cache[key as keyof Settings] !== value) {
        toSave[key] = validated[key as keyof Settings];
        changedKeys.push(key);

        // Mark as explicitly changed if requested
        if (explicit) {
          toSave[`_${key}Explicit`] = true;
        }
      }
    }

    // Update cache
    this._cache = validated;

    // Persist to storage
    if (Object.keys(toSave).length > 0) {
      await browser.storage.local.set(toSave);
    }

    // Notify subscribers
    if (changedKeys.length > 0) {
      this._notifySubscribers(changedKeys);
    }
  }

  /**
   * Get a single setting value
   * @param key - Setting key
   * @returns Current value or default
   */
  get<K extends keyof Settings>(key: K): Settings[K] {
    if (this._cache && key in this._cache) {
      return this._cache[key];
    }
    return defaults[key];
  }

  /**
   * Get all current settings
   * @returns Copy of current settings
   */
  getAll(): Settings {
    return { ...(this._cache || defaults) };
  }

  /**
   * Reset all settings to defaults
   * Clears all migration flags
   */
  async reset(): Promise<void> {
    // Clear all stored settings
    await browser.storage.local.clear();

    // Reset cache to defaults
    this._cache = { ...defaults };

    // Save defaults
    await browser.storage.local.set(defaults);

    // Notify subscribers
    this._notifySubscribers(Object.keys(defaults));

    console.log('VoxPage: Settings reset to defaults');
  }

  /**
   * Subscribe to settings changes
   * @param callback - Called with (newSettings, changedKeys)
   * @returns Unsubscribe function
   */
  subscribe(callback: SettingsChangeCallback): () => void {
    this._subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this._subscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of changes
   * @param changedKeys - Keys that changed
   * @private
   */
  private _notifySubscribers(changedKeys: string[]): void {
    const currentSettings = this.getAll();
    for (const callback of this._subscribers) {
      try {
        callback(currentSettings, changedKeys);
      } catch (error) {
        console.error('VoxPage: Subscriber callback error:', error);
      }
    }
  }

  /**
   * Check if a setting was explicitly changed by user
   * @param key - Setting key
   * @returns Promise resolving to true if explicitly set
   */
  async isExplicit(key: keyof Settings): Promise<boolean> {
    const flags = await browser.storage.local.get(`_${String(key)}Explicit`);
    return !!flags[`_${String(key)}Explicit`];
  }
}

// Export singleton instance
export const settingsStore = new SettingsStore();

export default settingsStore;
