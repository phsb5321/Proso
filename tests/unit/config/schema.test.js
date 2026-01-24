/**
 * Unit tests for TypeScript config/schema.ts
 * Verifies Zod-based validation behavior
 *
 * Note: TypeScript version uses Zod schemas directly for validation
 * instead of the legacy validateSettings/validateSetting/getDefaultForKey functions
 */

import { describe, test, expect } from '@jest/globals';
import {
  settingsSchema,
  MODES,
  PROVIDERS,
} from '../../../src/utils/config/schema';
import { defaults } from '../../../src/utils/config/defaults';

describe('Configuration Schema (TypeScript/Zod)', () => {
  describe('settingsSchema.parse', () => {
    test('validates complete valid settings', () => {
      const settings = {
        mode: 'article',
        provider: 'elevenlabs',
        voice: null,
        speed: 1.0,
        showCostEstimate: true,
        cacheEnabled: true,
        maxCacheSize: 50,
        wordSyncEnabled: true,
        autoDetectLanguage: true,
      };

      const result = settingsSchema.parse(settings);
      expect(result).toMatchObject(settings);
    });

    test('applies defaults for missing keys', () => {
      const result = settingsSchema.parse({});
      expect(result.mode).toBe('article');
      expect(result.provider).toBe('elevenlabs');
      expect(result.speed).toBe(1.0);
    });

    test('validates valid modes', () => {
      expect(settingsSchema.parse({ mode: 'selection' }).mode).toBe('selection');
      expect(settingsSchema.parse({ mode: 'article' }).mode).toBe('article');
      expect(settingsSchema.parse({ mode: 'full' }).mode).toBe('full');
    });

    test('throws for invalid modes', () => {
      expect(() => settingsSchema.parse({ mode: 'invalid' })).toThrow();
      expect(() => settingsSchema.parse({ mode: '' })).toThrow();
      expect(() => settingsSchema.parse({ mode: 123 })).toThrow();
    });

    test('validates valid providers', () => {
      // ElevenLabs and Browser TTS are supported
      expect(settingsSchema.parse({ provider: 'elevenlabs' }).provider).toBe('elevenlabs');
      expect(settingsSchema.parse({ provider: 'browser' }).provider).toBe('browser');
    });

    test('throws for invalid providers', () => {
      // 049-tts-provider-consolidation: OpenAI removed
      // Groq removed
      expect(() => settingsSchema.parse({ provider: 'google' })).toThrow();
      expect(() => settingsSchema.parse({ provider: 'openai' })).toThrow();
      expect(() => settingsSchema.parse({ provider: 'groq' })).toThrow();
      expect(() => settingsSchema.parse({ provider: '' })).toThrow();
      // Valid providers should not throw
      expect(settingsSchema.parse({ provider: 'browser' }).provider).toBe('browser');
    });

    test('validates speed constraints', () => {
      expect(settingsSchema.parse({ speed: 0.5 }).speed).toBe(0.5);
      expect(settingsSchema.parse({ speed: 2.0 }).speed).toBe(2.0);
      expect(settingsSchema.parse({ speed: 1.5 }).speed).toBe(1.5);
    });

    test('throws for invalid speed', () => {
      expect(() => settingsSchema.parse({ speed: 0.4 })).toThrow();
      expect(() => settingsSchema.parse({ speed: 2.1 })).toThrow();
      expect(() => settingsSchema.parse({ speed: -1 })).toThrow();
      expect(() => settingsSchema.parse({ speed: 'fast' })).toThrow();
    });

    test('validates maxCacheSize constraints', () => {
      expect(settingsSchema.parse({ maxCacheSize: 10 }).maxCacheSize).toBe(10);
      expect(settingsSchema.parse({ maxCacheSize: 200 }).maxCacheSize).toBe(200);
      expect(settingsSchema.parse({ maxCacheSize: 100 }).maxCacheSize).toBe(100);
    });

    test('throws for invalid maxCacheSize', () => {
      expect(() => settingsSchema.parse({ maxCacheSize: 9 })).toThrow();
      expect(() => settingsSchema.parse({ maxCacheSize: 201 })).toThrow();
    });

    test('validates boolean fields', () => {
      expect(settingsSchema.parse({ showCostEstimate: true }).showCostEstimate).toBe(true);
      expect(settingsSchema.parse({ showCostEstimate: false }).showCostEstimate).toBe(false);
      expect(settingsSchema.parse({ cacheEnabled: true }).cacheEnabled).toBe(true);
      expect(settingsSchema.parse({ wordSyncEnabled: false }).wordSyncEnabled).toBe(false);
    });

    test('validates voice as nullable string', () => {
      expect(settingsSchema.parse({ voice: null }).voice).toBeNull();
      expect(settingsSchema.parse({ voice: 'voice-id-123' }).voice).toBe('voice-id-123');
    });
  });

  describe('MODES constant', () => {
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

  describe('PROVIDERS constant', () => {
    test('contains all TTS providers', () => {
      // 049-tts-provider-consolidation: ElevenLabs and Browser TTS (OpenAI removed)
      // Groq removed - only ElevenLabs and Browser TTS remain
      expect(PROVIDERS).toContain('elevenlabs');
      expect(PROVIDERS).toContain('browser');
      expect(PROVIDERS).toHaveLength(2);
    });

    test('does not contain removed providers', () => {
      // 049-tts-provider-consolidation: OpenAI, Cartesia removed
      // Groq removed
      expect(PROVIDERS).not.toContain('openai');
      expect(PROVIDERS).not.toContain('cartesia');
      expect(PROVIDERS).not.toContain('groq');
    });

    test('default provider is in PROVIDERS', () => {
      expect(PROVIDERS).toContain(defaults.provider);
    });
  });

  describe('defaults object', () => {
    test('returns default for known keys', () => {
      expect(defaults.mode).toBe('article');
      // ElevenLabs is now the default provider
      expect(defaults.provider).toBe('elevenlabs');
      expect(defaults.speed).toBe(1.0);
      expect(defaults.voice).toBeNull();
    });
  });
});
