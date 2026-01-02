/**
 * VoxPage Settings Store
 * Centralized settings management with validation and persistence
 *
 * @module shared/config/store
 * @description Manages configuration lifecycle: load, validate, migrate, save.
 * Uses browser.storage.local for persistence across extension contexts.
 */

import { defaults } from './defaults.js';
import { validateSettings, validateSetting } from './schema.js';
import { applyMigrations } from './migrations.js';

/**
 * Settings store instance for centralized configuration management
 */
class SettingsStore {
  constructor() {
    /** @type {Object|null} Cached current settings */
    this._cache = null;

    /** @type {Set<Function>} Change subscribers */
    this._subscribers = new Set();

    /** @type {boolean} Whether store has been initialized */
    this._initialized = false;
  }

  /**
   * Load settings from storage, applying migrations and validation
   * @returns {Promise<Object>} Validated settings merged with defaults
   */
  async load() {
    try {
      // Get all stored settings
      const stored = await browser.storage.local.get();

      // Apply any pending migrations
      const migrated = await applyMigrations(stored, (partial) =>
        browser.storage.local.set(partial)
      );

      // Merge with defaults (stored values override defaults)
      const merged = { ...defaults, ...migrated };

      // Validate and apply defaults for missing/invalid values
      const result = validateSettings(merged);

      this._cache = result.data;
      this._initialized = true;
      return { ...result.data };
    } catch (error) {
      console.error('VoxPage: Failed to load settings:', error);
      this._cache = { ...defaults };
      return { ...defaults };
    }
  }

  /**
   * Save partial settings to storage
   * @param {Object} partial - Settings to update
   * @param {Object} options - Save options
   * @param {boolean} options.explicit - Mark settings as explicitly changed by user
   * @throws {Error} If validation fails
   */
  async save(partial, options = {}) {
    const { explicit = false } = options;

    // Ensure cache is loaded
    if (!this._cache) {
      await this.load();
    }

    // Validate each setting before saving
    const toSave = {};
    const changedKeys = [];

    for (const [key, value] of Object.entries(partial)) {
      // Skip migration flags
      if (key.startsWith('_')) {
        toSave[key] = value;
        continue;
      }

      const validation = validateSetting(key, value);
      if (!validation.success) {
        throw new Error(`Invalid value for ${key}: ${validation.error.message}`);
      }

      toSave[key] = validation.data;
      changedKeys.push(key);

      // Mark as explicitly changed if requested
      if (explicit) {
        toSave[`_${key}Explicit`] = true;
      }
    }

    // Update cache
    Object.assign(this._cache, toSave);

    // Persist to storage
    await browser.storage.local.set(toSave);

    // Notify subscribers
    if (changedKeys.length > 0) {
      this._notifySubscribers(changedKeys);
    }
  }

  /**
   * Get a single setting value
   * @param {string} key - Setting key
   * @returns {*} Current value or default
   */
  get(key) {
    if (this._cache && key in this._cache) {
      return this._cache[key];
    }
    return defaults[key];
  }

  /**
   * Get all current settings
   * @returns {Object} Copy of current settings
   */
  getAll() {
    return { ...(this._cache || defaults) };
  }

  /**
   * Reset all settings to defaults
   * Clears all migration flags
   */
  async reset() {
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
   * @param {Function} callback - Called with (newSettings, changedKeys)
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this._subscribers.add(callback);

    // Return unsubscribe function
    return () => {
      this._subscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of changes
   * @param {string[]} changedKeys - Keys that changed
   * @private
   */
  _notifySubscribers(changedKeys) {
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
   * @param {string} key - Setting key
   * @returns {Promise<boolean>}
   */
  async isExplicit(key) {
    const flags = await browser.storage.local.get(`_${key}Explicit`);
    return !!flags[`_${key}Explicit`];
  }
}

// Export singleton instance
export const settingsStore = new SettingsStore();

// Also export class for testing
export { SettingsStore };

export default settingsStore;
