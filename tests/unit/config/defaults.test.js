/**
 * Unit tests for shared/config/defaults.js
 * Verifies default values and constraints
 */

import { describe, test, expect } from '@jest/globals';
import {
  defaults,
  defaultVoices,
  constraints,
  MODES,
  PROVIDERS,
} from '../../../shared/config/defaults.js';

describe('Configuration Defaults', () => {
  describe('defaults object', () => {
    test('is frozen (immutable)', () => {
      expect(Object.isFrozen(defaults)).toBe(true);
    });

    test('has all required keys', () => {
      const requiredKeys = [
        'mode',
        'provider',
        'voice',
        'speed',
        'showCostEstimate',
        'cacheEnabled',
        'maxCacheSize',
        'wordSyncEnabled',
      ];

      requiredKeys.forEach((key) => {
        expect(defaults).toHaveProperty(key);
      });
    });

    test('mode defaults to article', () => {
      expect(defaults.mode).toBe('article');
    });

    test('provider defaults to browser', () => {
      expect(defaults.provider).toBe('browser');
    });

    test('voice defaults to null', () => {
      expect(defaults.voice).toBeNull();
    });

    test('speed defaults to 1.0', () => {
      expect(defaults.speed).toBe(1.0);
    });

    test('showCostEstimate defaults to true', () => {
      expect(defaults.showCostEstimate).toBe(true);
    });

    test('cacheEnabled defaults to true', () => {
      expect(defaults.cacheEnabled).toBe(true);
    });

    test('maxCacheSize defaults to 50', () => {
      expect(defaults.maxCacheSize).toBe(50);
    });

    test('wordSyncEnabled defaults to true', () => {
      expect(defaults.wordSyncEnabled).toBe(true);
    });
  });

  describe('MODES enum', () => {
    test('is frozen', () => {
      expect(Object.isFrozen(MODES)).toBe(true);
    });

    test('contains selection, article, full', () => {
      expect(MODES).toContain('selection');
      expect(MODES).toContain('article');
      expect(MODES).toContain('full');
      expect(MODES).toHaveLength(3);
    });

    test('default mode is in MODES', () => {
      expect(MODES).toContain(defaults.mode);
    });
  });

  describe('PROVIDERS enum', () => {
    test('is frozen', () => {
      expect(Object.isFrozen(PROVIDERS)).toBe(true);
    });

    test('contains all TTS providers', () => {
      expect(PROVIDERS).toContain('openai');
      expect(PROVIDERS).toContain('elevenlabs');
      expect(PROVIDERS).toContain('cartesia');
      expect(PROVIDERS).toContain('groq');
      expect(PROVIDERS).toContain('browser');
      expect(PROVIDERS).toHaveLength(5);
    });

    test('default provider is in PROVIDERS', () => {
      expect(PROVIDERS).toContain(defaults.provider);
    });
  });

  describe('constraints', () => {
    test('is frozen', () => {
      expect(Object.isFrozen(constraints)).toBe(true);
    });

    test('speed has valid range', () => {
      expect(constraints.speed.min).toBe(0.5);
      expect(constraints.speed.max).toBe(2.0);
      expect(defaults.speed).toBeGreaterThanOrEqual(constraints.speed.min);
      expect(defaults.speed).toBeLessThanOrEqual(constraints.speed.max);
    });

    test('maxCacheSize has valid range', () => {
      expect(constraints.maxCacheSize.min).toBe(10);
      expect(constraints.maxCacheSize.max).toBe(200);
      expect(defaults.maxCacheSize).toBeGreaterThanOrEqual(constraints.maxCacheSize.min);
      expect(defaults.maxCacheSize).toBeLessThanOrEqual(constraints.maxCacheSize.max);
    });
  });

  describe('defaultVoices', () => {
    test('is frozen', () => {
      expect(Object.isFrozen(defaultVoices)).toBe(true);
    });

    test('has entry for each provider', () => {
      PROVIDERS.forEach((provider) => {
        expect(defaultVoices).toHaveProperty(provider);
      });
    });

    test('default voices are null or valid strings', () => {
      // Some providers have specific default voices (openai: 'alloy', groq: 'hannah')
      // Others use null to indicate "use provider's first available voice"
      Object.entries(defaultVoices).forEach(([provider, voice]) => {
        if (voice !== null) {
          expect(typeof voice).toBe('string');
          expect(voice.length).toBeGreaterThan(0);
        }
      });
      // Verify specific known defaults
      expect(defaultVoices.openai).toBe('alloy');
      expect(defaultVoices.groq).toBe('hannah');
      expect(defaultVoices.elevenlabs).toBeNull();
      expect(defaultVoices.cartesia).toBeNull();
      expect(defaultVoices.browser).toBeNull();
    });
  });
});
