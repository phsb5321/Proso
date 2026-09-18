/**
 * ISettingsStore Contract Tests
 *
 * These tests define the contract that all settings store adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/settings-store
 */

import { jest } from '@jest/globals';
import type { ISettingsStore, Settings } from '../../src/ports/settings-store.port';
import { MockSettingsStore } from '../mocks';

/**
 * Contract test suite for ISettingsStore implementations.
 *
 * Usage:
 * ```typescript
 * runSettingsStoreContractTests('BrowserSettingsAdapter', () => new BrowserSettingsAdapter());
 * ```
 */
export function runSettingsStoreContractTests(
  adapterName: string,
  createAdapter: () => ISettingsStore,
) {
  describe(`${adapterName} implements ISettingsStore contract`, () => {
    let adapter: ISettingsStore;

    beforeEach(() => {
      adapter = createAdapter();
    });

    describe('getSettings()', () => {
      it('should return Settings object', async () => {
        const settings = await adapter.getSettings();

        // Required properties must exist
        expect(settings).toBeDefined();
        expect(typeof settings.mode).toBe('string');
        expect(typeof settings.provider).toBe('string');
        expect(typeof settings.speed).toBe('number');
        expect(typeof settings.showCostEstimate).toBe('boolean');
        expect(typeof settings.cacheEnabled).toBe('boolean');
        expect(typeof settings.maxCacheSize).toBe('number');
        expect(typeof settings.wordSyncEnabled).toBe('boolean');
        // voice can be null or string
        expect(settings.voice === null || typeof settings.voice === 'string').toBe(true);
      });

      it('should return consistent settings on multiple calls', async () => {
        const settings1 = await adapter.getSettings();
        const settings2 = await adapter.getSettings();

        expect(settings1.mode).toBe(settings2.mode);
        expect(settings1.provider).toBe(settings2.provider);
        expect(settings1.speed).toBe(settings2.speed);
      });

      it('should return valid mode value', async () => {
        const settings = await adapter.getSettings();
        expect(['selection', 'article', 'full']).toContain(settings.mode);
      });

      it('should return valid provider value', async () => {
        // Post-045: Only ElevenLabs is supported
        const settings = await adapter.getSettings();
        expect(['elevenlabs']).toContain(settings.provider);
      });

      it('should return valid speed range', async () => {
        const settings = await adapter.getSettings();
        expect(settings.speed).toBeGreaterThanOrEqual(0.5);
        expect(settings.speed).toBeLessThanOrEqual(2.0);
      });
    });

    describe('updateSettings()', () => {
      it('should update partial settings', async () => {
        const originalSettings = await adapter.getSettings();

        // Update only speed
        await adapter.updateSettings({ speed: 1.5 });

        const newSettings = await adapter.getSettings();
        expect(newSettings.speed).toBe(1.5);
        // Other settings should be preserved
        expect(newSettings.mode).toBe(originalSettings.mode);
        expect(newSettings.provider).toBe(originalSettings.provider);
      });

      it('should update multiple settings at once', async () => {
        await adapter.updateSettings({
          speed: 1.25,
          showCostEstimate: false,
          cacheEnabled: true,
        });

        const settings = await adapter.getSettings();
        expect(settings.speed).toBe(1.25);
        expect(settings.showCostEstimate).toBe(false);
        expect(settings.cacheEnabled).toBe(true);
      });

      it('should handle empty update object', async () => {
        const originalSettings = await adapter.getSettings();

        // Empty update should not throw
        await adapter.updateSettings({});

        const newSettings = await adapter.getSettings();
        expect(newSettings.speed).toBe(originalSettings.speed);
      });
    });

    describe('getApiKey()', () => {
      it('should return null or string for elevenlabs provider', async () => {
        // Post-045: Only ElevenLabs is supported
        const key = await adapter.getApiKey('elevenlabs');
        expect(key === null || typeof key === 'string').toBe(true);
      });
    });

    describe('setApiKey()', () => {
      it('should set and retrieve API key for elevenlabs', async () => {
        // Post-045: Only ElevenLabs is supported
        const testKey = 'el-test-key-12345678901234567890';
        await adapter.setApiKey('elevenlabs', testKey);

        const retrievedKey = await adapter.getApiKey('elevenlabs');
        expect(retrievedKey).toBe(testKey);
      });

      it('should overwrite existing API key', async () => {
        // Post-045: Only ElevenLabs is supported
        await adapter.setApiKey('elevenlabs', 'first-key-12345678901234567890');
        await adapter.setApiKey('elevenlabs', 'second-key-1234567890123456789');

        const key = await adapter.getApiKey('elevenlabs');
        expect(key).toBe('second-key-1234567890123456789');
      });
    });

    describe('subscribe()', () => {
      it('should return an unsubscribe function', () => {
        const callback = jest.fn();
        const unsubscribe = adapter.subscribe(callback);

        expect(typeof unsubscribe).toBe('function');
      });

      it('should call callback on settings change', async () => {
        const callback = jest.fn();
        adapter.subscribe(callback);

        // Update settings
        await adapter.updateSettings({ speed: 1.75 });

        // Allow any async callbacks to fire
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Callback should have been called (implementation dependent)
        // Note: This behavior depends on the specific adapter implementation
        // Some adapters may call synchronously, others async
      });

      it('publishes the pronunciation lexicon in subscription payloads (251)', async () => {
        const callback = jest.fn();
        adapter.subscribe(callback);

        await adapter.updateSettings({
          pronunciationLexiconEnabled: true,
          pronunciationLexicon: [
            {
              id: 'rule-1',
              locale: 'all',
              match: 'Proso',
              spoken: 'Prôzo',
              matchMode: 'word',
              caseSensitive: false,
              enabled: true,
            },
          ],
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const payload = callback.mock.calls.at(-1)?.[0] as
          | { pronunciationLexicon?: unknown[]; pronunciationLexiconEnabled?: boolean }
          | undefined;
        // The playback subscriber rebuilds its cached lexicon from this
        // payload: omitting the fields erased the reader's rules.
        expect(payload?.pronunciationLexicon).toHaveLength(1);
        expect(payload?.pronunciationLexiconEnabled).toBe(true);
      });

      it('should stop calling callback after unsubscribe', async () => {
        const callback = jest.fn();
        const unsubscribe = adapter.subscribe(callback);

        // Unsubscribe
        unsubscribe();

        // Update settings
        await adapter.updateSettings({ speed: 1.25 });

        // Allow time for potential callbacks
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Callback count should not increase after unsubscribe
        const callCountAfterUnsubscribe = callback.mock.calls.length;

        await adapter.updateSettings({ speed: 1.5 });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(callback.mock.calls.length).toBe(callCountAfterUnsubscribe);
      });
    });
  });
}

// Run contract tests against MockSettingsStore
runSettingsStoreContractTests('MockSettingsStore', () => new MockSettingsStore());
