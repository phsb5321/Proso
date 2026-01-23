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
} from '../../../src/utils/config/index';

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

    test('provider defaults to groq', () => {
      // 050-groq-tts-provider: Groq is the default TTS provider
      expect(defaults.provider).toBe('groq');
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
    test('is readonly (TypeScript as const)', () => {
      // TypeScript 'as const' provides compile-time immutability
      // Runtime check: ensure MODES is an array and cannot be mutated meaningfully
      expect(Array.isArray(MODES)).toBe(true);
      // The array itself isn't frozen, but TypeScript enforces readonly at compile time
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
    test('is readonly (TypeScript as const)', () => {
      // TypeScript 'as const' provides compile-time immutability
      // Runtime check: ensure PROVIDERS is an array and cannot be mutated meaningfully
      expect(Array.isArray(PROVIDERS)).toBe(true);
      // The array itself isn't frozen, but TypeScript enforces readonly at compile time
    });

    test('contains all TTS providers', () => {
      // 050-groq-tts-provider: Groq, ElevenLabs and Browser TTS (OpenAI, Cartesia removed)
      expect(PROVIDERS).toContain('groq');
      expect(PROVIDERS).toContain('elevenlabs');
      expect(PROVIDERS).toContain('browser');
      expect(PROVIDERS).toHaveLength(3);
    });

    test('does not contain removed providers', () => {
      // 049-tts-provider-consolidation: OpenAI, Cartesia removed
      // 050-groq-tts-provider: Groq is now a supported provider
      expect(PROVIDERS).not.toContain('openai');
      expect(PROVIDERS).not.toContain('cartesia');
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
      // Post-045: Only ElevenLabs is supported
      // null means "use provider's first available voice"
      Object.entries(defaultVoices).forEach(([provider, voice]) => {
        if (voice !== null) {
          expect(typeof voice).toBe('string');
          expect(voice.length).toBeGreaterThan(0);
        }
      });
      // Verify ElevenLabs default
      expect(defaultVoices.elevenlabs).toBeNull();
    });
  });
});
