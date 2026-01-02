/**
 * Unit tests for shared/config/schema.js
 * Verifies plain JavaScript validation behavior
 */

import { describe, test, expect } from '@jest/globals';
import {
  validateSettings,
  validateSetting,
  getDefaultForKey,
} from '../../../shared/config/schema.js';
import { defaults } from '../../../shared/config/defaults.js';

describe('Configuration Schema', () => {
  describe('validateSettings', () => {
    test('validates complete valid settings', () => {
      const settings = {
        mode: 'article',
        provider: 'browser',
        voice: null,
        speed: 1.0,
        showCostEstimate: true,
        cacheEnabled: true,
        maxCacheSize: 50,
        wordSyncEnabled: true,
      };

      const result = validateSettings(settings);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(settings);
    });

    test('applies defaults for missing keys', () => {
      const result = validateSettings({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual(defaults);
    });

    test('applies defaults for null/undefined input', () => {
      const result1 = validateSettings(null);
      expect(result1.success).toBe(true);
      expect(result1.data.mode).toBe('article');

      const result2 = validateSettings(undefined);
      expect(result2.success).toBe(true);
      expect(result2.data.mode).toBe('article');
    });

    test('validates valid modes', () => {
      expect(validateSettings({ mode: 'selection' }).data.mode).toBe('selection');
      expect(validateSettings({ mode: 'article' }).data.mode).toBe('article');
      expect(validateSettings({ mode: 'full' }).data.mode).toBe('full');
    });

    test('falls back to default for invalid modes', () => {
      expect(validateSettings({ mode: 'invalid' }).data.mode).toBe('article');
      expect(validateSettings({ mode: '' }).data.mode).toBe('article');
      expect(validateSettings({ mode: 123 }).data.mode).toBe('article');
    });

    test('validates valid providers', () => {
      expect(validateSettings({ provider: 'openai' }).data.provider).toBe('openai');
      expect(validateSettings({ provider: 'elevenlabs' }).data.provider).toBe('elevenlabs');
      expect(validateSettings({ provider: 'cartesia' }).data.provider).toBe('cartesia');
      expect(validateSettings({ provider: 'groq' }).data.provider).toBe('groq');
      expect(validateSettings({ provider: 'browser' }).data.provider).toBe('browser');
    });

    test('falls back to default for invalid providers', () => {
      expect(validateSettings({ provider: 'google' }).data.provider).toBe('browser');
      expect(validateSettings({ provider: '' }).data.provider).toBe('browser');
    });

    test('validates speed constraints', () => {
      expect(validateSettings({ speed: 0.5 }).data.speed).toBe(0.5);
      expect(validateSettings({ speed: 2.0 }).data.speed).toBe(2.0);
      expect(validateSettings({ speed: 1.5 }).data.speed).toBe(1.5);
    });

    test('falls back to default for invalid speed', () => {
      expect(validateSettings({ speed: 0.4 }).data.speed).toBe(1.0);
      expect(validateSettings({ speed: 2.1 }).data.speed).toBe(1.0);
      expect(validateSettings({ speed: -1 }).data.speed).toBe(1.0);
      expect(validateSettings({ speed: 'fast' }).data.speed).toBe(1.0);
    });

    test('validates maxCacheSize constraints', () => {
      expect(validateSettings({ maxCacheSize: 10 }).data.maxCacheSize).toBe(10);
      expect(validateSettings({ maxCacheSize: 200 }).data.maxCacheSize).toBe(200);
      expect(validateSettings({ maxCacheSize: 100 }).data.maxCacheSize).toBe(100);
    });

    test('falls back to default for invalid maxCacheSize', () => {
      expect(validateSettings({ maxCacheSize: 9 }).data.maxCacheSize).toBe(50);
      expect(validateSettings({ maxCacheSize: 201 }).data.maxCacheSize).toBe(50);
    });

    test('validates boolean fields', () => {
      expect(validateSettings({ showCostEstimate: true }).data.showCostEstimate).toBe(true);
      expect(validateSettings({ showCostEstimate: false }).data.showCostEstimate).toBe(false);
      expect(validateSettings({ cacheEnabled: true }).data.cacheEnabled).toBe(true);
      expect(validateSettings({ wordSyncEnabled: false }).data.wordSyncEnabled).toBe(false);
    });

    test('falls back to default for invalid booleans', () => {
      // Non-boolean values fall back to default
      expect(validateSettings({ showCostEstimate: 'true' }).data.showCostEstimate).toBe(true);
      expect(validateSettings({ cacheEnabled: 1 }).data.cacheEnabled).toBe(true);
    });

    test('validates voice as nullable string', () => {
      expect(validateSettings({ voice: null }).data.voice).toBeNull();
      expect(validateSettings({ voice: 'voice-id-123' }).data.voice).toBe('voice-id-123');
    });

    test('falls back to default for invalid voice', () => {
      expect(validateSettings({ voice: 123 }).data.voice).toBeNull();
    });
  });

  describe('validateSetting function', () => {
    test('validates individual mode settings', () => {
      expect(validateSetting('mode', 'article').success).toBe(true);
      expect(validateSetting('mode', 'article').data).toBe('article');
    });

    test('validates individual speed settings', () => {
      expect(validateSetting('speed', 1.5).success).toBe(true);
      expect(validateSetting('speed', 1.5).data).toBe(1.5);
    });

    test('returns error for unknown keys', () => {
      const result = validateSetting('unknownKey', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getDefaultForKey function', () => {
    test('returns default for known keys', () => {
      expect(getDefaultForKey('mode')).toBe('article');
      expect(getDefaultForKey('provider')).toBe('browser');
      expect(getDefaultForKey('speed')).toBe(1.0);
      expect(getDefaultForKey('voice')).toBeNull();
    });

    test('returns undefined for unknown keys', () => {
      expect(getDefaultForKey('unknownKey')).toBeUndefined();
    });
  });
});
