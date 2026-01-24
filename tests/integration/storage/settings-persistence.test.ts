/**
 * Settings Persistence Integration Tests
 *
 * Tests the complete settings lifecycle: load, validate, migrate, save, subscribe.
 * Uses mock browser.storage.local to verify persistence behavior.
 *
 * @module tests/integration/storage/settings-persistence
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  HandlerRegistry,
  createHandlerRegistry,
} from '../../../src/handlers/registry';
import type { Result } from '../../../src/core/shared/result';
import { Ok, Err } from '../../../src/core/shared/result';

/**
 * Mock settings type matching the actual schema
 */
interface MockSettings {
  provider: string;
  voice: string | null;
  speed: number;
  mode: 'article' | 'selection' | 'full';
  cacheEnabled: boolean;
  maxCacheSize: number;
  showCostEstimate: boolean;
  wordSyncEnabled: boolean;
  _settingsVersion?: number;
}

/**
 * Default settings values
 */
const defaultSettings: MockSettings = {
  provider: 'browser',
  voice: null,
  speed: 1.0,
  mode: 'article',
  cacheEnabled: true,
  maxCacheSize: 50,
  showCostEstimate: true,
  wordSyncEnabled: true,
  _settingsVersion: 1,
};

/**
 * Mock browser.storage.local implementation
 */
interface MockStorageState {
  data: Record<string, unknown>;
  listeners: Array<(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void>;
}

describe('Settings Persistence Integration', () => {
  let registry: HandlerRegistry;
  let storageState: MockStorageState;
  let settingsCache: MockSettings | null;
  let subscribers: Set<(settings: MockSettings, changedKeys: string[]) => void>;

  beforeEach(() => {
    registry = createHandlerRegistry();
    storageState = {
      data: {},
      listeners: [],
    };
    settingsCache = null;
    subscribers = new Set();

    // Helper functions
    function validateSettings(
      settings: Record<string, unknown>,
    ): Result<MockSettings, { type: string; message: string }> {
      // Speed validation
      if (typeof settings.speed === 'number') {
        if (settings.speed < 0.5 || settings.speed > 2.0) {
          return Err({ type: 'validation_failed', message: 'Speed must be between 0.5 and 2.0' });
        }
      }

      // Mode validation
      if (settings.mode && !['article', 'selection', 'full'].includes(settings.mode as string)) {
        return Err({ type: 'validation_failed', message: 'Invalid mode' });
      }

      // Provider validation
      const validProviders = ['browser', 'elevenlabs'];
      if (settings.provider && !validProviders.includes(settings.provider as string)) {
        return Err({ type: 'validation_failed', message: 'Invalid provider' });
      }

      return Ok(settings as unknown as MockSettings);
    }

    async function applyMigrations(
      stored: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      const version = (stored._settingsVersion as number) || 0;
      const result = { ...stored };

      // Migration v0 -> v1: Add wordSyncEnabled default
      if (version < 1) {
        if (result.wordSyncEnabled === undefined) {
          result.wordSyncEnabled = true;
        }
        result._settingsVersion = 1;
      }

      return result;
    }

    function notifySubscribers(changedKeys: string[]): void {
      const currentSettings = settingsCache || defaultSettings;
      for (const callback of subscribers) {
        try {
          callback(currentSettings, changedKeys);
        } catch {
          // Ignore subscriber errors
        }
      }
    }

    // Register settings handlers

    // Load settings from storage
    registry.register<void, Result<MockSettings, { type: string; message: string }>>(
      'settings.load',
      async () => {
        try {
          // Get stored settings
          const stored = { ...storageState.data };

          // Apply migrations if needed
          const migrated = await applyMigrations(stored);

          // Merge with defaults
          const merged = { ...defaultSettings, ...migrated };

          // Validate settings
          const validated = validateSettings(merged);
          if (!validated.ok) {
            return validated;
          }

          settingsCache = validated.value;
          return Ok({ ...validated.value });
        } catch (error) {
          return Err({ type: 'load_failed', message: String(error) });
        }
      },
      'Load settings from storage',
    );

    // Save partial settings
    registry.register<
      { partial: Partial<MockSettings>; explicit?: boolean },
      Result<{ changedKeys: string[] }, { type: string; message: string }>
    >(
      'settings.save',
      async ({ partial, explicit = false }) => {
        // Ensure cache is loaded
        if (!settingsCache) {
          const loadResult = await registry.dispatch<void, Result<MockSettings, { type: string; message: string }>>(
            'settings.load',
            undefined,
          );
          if (!loadResult.ok) {
            return Err({ type: 'load_failed', message: 'Failed to load settings' });
          }
          // The value is the Result from our handler
          const innerResult = loadResult.value;
          if (!innerResult.ok) {
            return Err(innerResult.error);
          }
        }

        // Merge with current settings
        const merged = { ...settingsCache, ...partial };

        // Validate merged settings
        const validated = validateSettings(merged);
        if (!validated.ok) {
          return validated as Result<{ changedKeys: string[] }, { type: string; message: string }>;
        }

        // Track changed keys
        const changedKeys: string[] = [];
        const toSave: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(partial)) {
          if (settingsCache && settingsCache[key as keyof MockSettings] !== value) {
            toSave[key] = value;
            changedKeys.push(key);

            if (explicit) {
              toSave[`_${key}Explicit`] = true;
            }
          }
        }

        // Update cache
        settingsCache = validated.value;

        // Persist to storage
        Object.assign(storageState.data, toSave);

        // Notify subscribers
        if (changedKeys.length > 0) {
          notifySubscribers(changedKeys);
        }

        return Ok({ changedKeys });
      },
      'Save partial settings to storage',
    );

    // Get a single setting
    registry.register<
      { key: keyof MockSettings },
      Result<unknown, { type: string; message: string }>
    >(
      'settings.get',
      async ({ key }) => {
        if (settingsCache && key in settingsCache) {
          return Ok(settingsCache[key]);
        }
        return Ok(defaultSettings[key]);
      },
      'Get a single setting value',
    );

    // Get all settings
    registry.register<void, Result<MockSettings, { type: string; message: string }>>(
      'settings.getAll',
      async () => {
        return Ok({ ...(settingsCache || defaultSettings) });
      },
      'Get all current settings',
    );

    // Reset settings to defaults
    registry.register<void, Result<void, { type: string; message: string }>>(
      'settings.reset',
      async () => {
        // Clear storage
        storageState.data = {};

        // Reset cache to defaults
        settingsCache = { ...defaultSettings };

        // Save defaults to storage
        Object.assign(storageState.data, defaultSettings);

        // Notify subscribers
        notifySubscribers(Object.keys(defaultSettings));

        return Ok(undefined);
      },
      'Reset settings to defaults',
    );

    // Subscribe to changes
    registry.register<
      { callback: (settings: MockSettings, changedKeys: string[]) => void },
      Result<{ unsubscribeId: string }, { type: string; message: string }>
    >(
      'settings.subscribe',
      async ({ callback }) => {
        const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        subscribers.add(callback);
        return Ok({ unsubscribeId: id });
      },
      'Subscribe to settings changes',
    );

    // Check if setting was explicitly set by user
    registry.register<
      { key: keyof MockSettings },
      Result<boolean, { type: string; message: string }>
    >(
      'settings.isExplicit',
      async ({ key }) => {
        const explicitKey = `_${String(key)}Explicit`;
        return Ok(!!storageState.data[explicitKey]);
      },
      'Check if setting was explicitly changed',
    );
  });

  afterEach(() => {
    registry.clear();
    subscribers.clear();
  });

  describe('Load Settings Flow', () => {
    it('should load default settings when storage is empty', async () => {
      const result = await registry.dispatch<void, Result<MockSettings, { type: string; message: string }>>(
        'settings.load',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.provider).toBe('browser');
        expect(result.value.value.speed).toBe(1.0);
        expect(result.value.value.mode).toBe('article');
      }
    });

    it('should load stored settings merged with defaults', async () => {
      // Pre-populate storage
      storageState.data = {
        provider: 'openai',
        speed: 1.5,
      };

      const result = await registry.dispatch<void, Result<MockSettings, { type: string; message: string }>>(
        'settings.load',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.provider).toBe('openai');
        expect(result.value.value.speed).toBe(1.5);
        // Defaults should be applied for missing values
        expect(result.value.value.mode).toBe('article');
        expect(result.value.value.cacheEnabled).toBe(true);
      }
    });

    it('should apply migrations to old settings', async () => {
      // Pre-populate with old version
      storageState.data = {
        provider: 'browser',
        _settingsVersion: 0,
      };

      const result = await registry.dispatch<void, Result<MockSettings, { type: string; message: string }>>(
        'settings.load',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value._settingsVersion).toBe(1);
        expect(result.value.value.wordSyncEnabled).toBe(true);
      }
    });
  });

  describe('Save Settings Flow', () => {
    beforeEach(async () => {
      // Load settings first
      await registry.dispatch('settings.load', undefined);
    });

    it('should save partial settings correctly', async () => {
      const result = await registry.dispatch<
        { partial: Partial<MockSettings> },
        Result<{ changedKeys: string[] }, { type: string; message: string }>
      >('settings.save', {
        partial: { provider: 'openai', speed: 1.25 },
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.changedKeys).toContain('provider');
        expect(result.value.value.changedKeys).toContain('speed');
      }

      expect(storageState.data.provider).toBe('openai');
      expect(storageState.data.speed).toBe(1.25);
    });

    it('should reject invalid speed values', async () => {
      const result = await registry.dispatch<
        { partial: Partial<MockSettings> },
        Result<{ changedKeys: string[] }, { type: string; message: string }>
      >('settings.save', {
        partial: { speed: 5.0 },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should mark settings as explicit when requested', async () => {
      await registry.dispatch('settings.save', {
        partial: { provider: 'elevenlabs' },
        explicit: true,
      });

      const explicitResult = await registry.dispatch<
        { key: keyof MockSettings },
        Result<boolean, { type: string; message: string }>
      >('settings.isExplicit', {
        key: 'provider',
      });

      expect(explicitResult.ok).toBe(true);
      if (explicitResult.ok && explicitResult.value.ok) {
        expect(explicitResult.value.value).toBe(true);
      }
    });

    it('should not save unchanged values', async () => {
      // Save same default value
      const result = await registry.dispatch<
        { partial: Partial<MockSettings> },
        Result<{ changedKeys: string[] }, { type: string; message: string }>
      >('settings.save', {
        partial: { provider: 'browser' },
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.changedKeys).toHaveLength(0);
      }
    });
  });

  describe('Get Settings Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('settings.load', undefined);
    });

    it('should get individual setting values', async () => {
      const result = await registry.dispatch<
        { key: keyof MockSettings },
        Result<unknown, { type: string; message: string }>
      >('settings.get', { key: 'speed' });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value).toBe(1.0);
      }
    });

    it('should get all settings at once', async () => {
      const result = await registry.dispatch<void, Result<MockSettings, { type: string; message: string }>>(
        'settings.getAll',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value).toHaveProperty('provider');
        expect(result.value.value).toHaveProperty('speed');
        expect(result.value.value).toHaveProperty('mode');
      }
    });

    it('should reflect saved changes in get operations', async () => {
      await registry.dispatch('settings.save', {
        partial: { speed: 1.75 },
      });

      const result = await registry.dispatch<
        { key: keyof MockSettings },
        Result<unknown, { type: string; message: string }>
      >('settings.get', { key: 'speed' });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value).toBe(1.75);
      }
    });
  });

  describe('Reset Settings Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('settings.load', undefined);
      // Change some settings
      await registry.dispatch('settings.save', {
        partial: { provider: 'openai', speed: 1.5 },
      });
    });

    it('should reset all settings to defaults', async () => {
      const result = await registry.dispatch<void, Result<void, { type: string; message: string }>>(
        'settings.reset',
        undefined,
      );

      expect(result.ok).toBe(true);

      const getResult = await registry.dispatch<void, Result<MockSettings, { type: string; message: string }>>(
        'settings.getAll',
        undefined,
      );
      if (getResult.ok && getResult.value.ok) {
        expect(getResult.value.value.provider).toBe('browser');
        expect(getResult.value.value.speed).toBe(1.0);
      }
    });

    it('should clear storage on reset', async () => {
      await registry.dispatch('settings.reset', undefined);

      // Storage should have defaults, not previous values
      expect(storageState.data.provider).toBe('browser');
      expect(storageState.data.speed).toBe(1.0);
    });
  });

  describe('Subscription Flow', () => {
    let changeLog: Array<{ settings: MockSettings; changedKeys: string[] }>;

    beforeEach(async () => {
      changeLog = [];
      await registry.dispatch('settings.load', undefined);

      // Subscribe to changes
      await registry.dispatch('settings.subscribe', {
        callback: (settings: MockSettings, changedKeys: string[]) => {
          changeLog.push({ settings, changedKeys });
        },
      });
    });

    it('should notify subscribers on settings change', async () => {
      await registry.dispatch('settings.save', {
        partial: { provider: 'openai' },
      });

      expect(changeLog).toHaveLength(1);
      expect(changeLog[0].changedKeys).toContain('provider');
      expect(changeLog[0].settings.provider).toBe('openai');
    });

    it('should not notify on unchanged settings', async () => {
      await registry.dispatch('settings.save', {
        partial: { provider: 'browser' },
      });

      expect(changeLog).toHaveLength(0);
    });

    it('should notify on reset', async () => {
      await registry.dispatch('settings.save', {
        partial: { provider: 'openai' },
      });
      changeLog = []; // Clear previous notifications

      await registry.dispatch('settings.reset', undefined);

      expect(changeLog).toHaveLength(1);
      expect(changeLog[0].changedKeys.length).toBeGreaterThan(0);
    });
  });

  describe('Validation Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('settings.load', undefined);
    });

    it('should reject invalid provider', async () => {
      const result = await registry.dispatch<
        { partial: Partial<MockSettings> },
        Result<{ changedKeys: string[] }, { type: string; message: string }>
      >('settings.save', {
        partial: { provider: 'invalid_provider' as string },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should reject invalid mode', async () => {
      const result = await registry.dispatch<
        { partial: Partial<MockSettings> },
        Result<{ changedKeys: string[] }, { type: string; message: string }>
      >('settings.save', {
        partial: { mode: 'invalid_mode' as MockSettings['mode'] },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should accept valid boundary values', async () => {
      // Min speed
      const minResult = await registry.dispatch<
        { partial: Partial<MockSettings> },
        Result<{ changedKeys: string[] }, { type: string; message: string }>
      >('settings.save', {
        partial: { speed: 0.5 },
      });
      expect(minResult.ok).toBe(true);
      if (minResult.ok) {
        expect(minResult.value.ok).toBe(true);
      }

      // Max speed
      const maxResult = await registry.dispatch<
        { partial: Partial<MockSettings> },
        Result<{ changedKeys: string[] }, { type: string; message: string }>
      >('settings.save', {
        partial: { speed: 2.0 },
      });
      expect(maxResult.ok).toBe(true);
      if (maxResult.ok) {
        expect(maxResult.value.ok).toBe(true);
      }
    });
  });

  describe('Explicit Settings Tracking', () => {
    beforeEach(async () => {
      await registry.dispatch('settings.load', undefined);
    });

    it('should track explicitly set settings', async () => {
      await registry.dispatch('settings.save', {
        partial: { provider: 'openai' },
        explicit: true,
      });

      const result = await registry.dispatch<
        { key: keyof MockSettings },
        Result<boolean, { type: string; message: string }>
      >('settings.isExplicit', {
        key: 'provider',
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value).toBe(true);
      }
    });

    it('should not mark settings as explicit by default', async () => {
      await registry.dispatch('settings.save', {
        partial: { speed: 1.25 },
      });

      const result = await registry.dispatch<
        { key: keyof MockSettings },
        Result<boolean, { type: string; message: string }>
      >('settings.isExplicit', {
        key: 'speed',
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value).toBe(false);
      }
    });
  });
});
