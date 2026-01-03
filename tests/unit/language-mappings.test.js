/**
 * Unit tests for background/language-mappings.js
 * Tests BCP 47 parsing and provider code mapping (T018)
 */

import { describe, test, expect } from '@jest/globals';
import {
  LANGUAGE_MAPPINGS,
  getLanguageMapping,
  getProviderLanguageCode,
  getLanguageDisplayName,
  providerSupportsLanguage,
  getProvidersForLanguage,
  getAllLanguages,
  getVoicesForLanguage
} from '../../background/language-mappings.js';
import {
  parseBCP47,
  normalizeLanguageCode,
  isLanguageSupported,
  SUPPORTED_LANGUAGES
} from '../../shared/language-codes.js';

describe('Language Mappings', () => {
  describe('LANGUAGE_MAPPINGS', () => {
    test('contains 20+ languages', () => {
      const languages = Object.keys(LANGUAGE_MAPPINGS);
      expect(languages.length).toBeGreaterThanOrEqual(20);
    });

    test('all entries have required fields', () => {
      Object.entries(LANGUAGE_MAPPINGS).forEach(([code, mapping]) => {
        expect(mapping.bcp47).toBeDefined();
        expect(mapping.providers).toBeDefined();
        expect(mapping.displayName).toBeDefined();
        expect(mapping.iso639_1).toBe(code);
      });
    });

    test('all entries have provider mappings', () => {
      Object.values(LANGUAGE_MAPPINGS).forEach(mapping => {
        expect(mapping.providers).toHaveProperty('elevenlabs');
        expect(mapping.providers).toHaveProperty('openai');
        expect(mapping.providers).toHaveProperty('browser');
        expect(mapping.providers).toHaveProperty('groq');
        expect(mapping.providers).toHaveProperty('cartesia');
      });
    });

    test('Groq and Cartesia are null for non-English languages', () => {
      Object.entries(LANGUAGE_MAPPINGS)
        .filter(([code]) => code !== 'en')
        .forEach(([code, mapping]) => {
          expect(mapping.providers.groq).toBeNull();
          expect(mapping.providers.cartesia).toBeNull();
        });
    });

    test('Groq and Cartesia support English', () => {
      const enMapping = LANGUAGE_MAPPINGS.en;
      expect(enMapping.providers.groq).toBe('en');
      expect(enMapping.providers.cartesia).toBe('en');
    });
  });

  describe('getLanguageMapping', () => {
    test('returns mapping for valid language code', () => {
      const mapping = getLanguageMapping('es');
      expect(mapping).toBeDefined();
      expect(mapping.displayName).toBe('Spanish');
    });

    test('returns mapping for BCP 47 code', () => {
      const mapping = getLanguageMapping('en-US');
      expect(mapping).toBeDefined();
      expect(mapping.displayName).toBe('English');
    });

    test('returns null for invalid language code', () => {
      const mapping = getLanguageMapping('xyz');
      expect(mapping).toBeNull();
    });
  });

  describe('getProviderLanguageCode', () => {
    test('returns ElevenLabs code for Spanish', () => {
      const code = getProviderLanguageCode('es', 'elevenlabs');
      expect(code).toBe('es');
    });

    test('returns zh-cn for Chinese on ElevenLabs', () => {
      const code = getProviderLanguageCode('zh', 'elevenlabs');
      expect(code).toBe('zh-cn');
    });

    test('returns null for OpenAI (auto-detect)', () => {
      const code = getProviderLanguageCode('de', 'openai');
      expect(code).toBeNull();
    });

    test('returns Browser TTS lang for Spanish', () => {
      const code = getProviderLanguageCode('es', 'browser');
      expect(code).toBe('es-ES');
    });
  });

  describe('getLanguageDisplayName', () => {
    test('returns display name for valid code', () => {
      expect(getLanguageDisplayName('es')).toBe('Spanish');
      expect(getLanguageDisplayName('fr')).toBe('French');
      expect(getLanguageDisplayName('de')).toBe('German');
      expect(getLanguageDisplayName('ja')).toBe('Japanese');
    });

    test('returns uppercase code for unknown language', () => {
      expect(getLanguageDisplayName('xyz')).toBe('XYZ');
    });
  });

  describe('providerSupportsLanguage', () => {
    test('OpenAI supports all languages (auto-detect)', () => {
      expect(providerSupportsLanguage('openai', 'es')).toBe(true);
      expect(providerSupportsLanguage('openai', 'zh')).toBe(true);
      expect(providerSupportsLanguage('openai', 'ja')).toBe(true);
      expect(providerSupportsLanguage('openai', 'ar')).toBe(true);
    });

    test('ElevenLabs supports mapped languages', () => {
      expect(providerSupportsLanguage('elevenlabs', 'es')).toBe(true);
      expect(providerSupportsLanguage('elevenlabs', 'fr')).toBe(true);
      expect(providerSupportsLanguage('elevenlabs', 'ja')).toBe(true);
    });

    test('Browser TTS supports mapped languages', () => {
      expect(providerSupportsLanguage('browser', 'es')).toBe(true);
      expect(providerSupportsLanguage('browser', 'de')).toBe(true);
    });

    test('Groq only supports English', () => {
      expect(providerSupportsLanguage('groq', 'en')).toBe(true);
      expect(providerSupportsLanguage('groq', 'es')).toBe(false);
      expect(providerSupportsLanguage('groq', 'fr')).toBe(false);
    });

    test('Cartesia only supports English', () => {
      expect(providerSupportsLanguage('cartesia', 'en')).toBe(true);
      expect(providerSupportsLanguage('cartesia', 'de')).toBe(false);
      expect(providerSupportsLanguage('cartesia', 'ja')).toBe(false);
    });
  });

  describe('getProvidersForLanguage', () => {
    test('returns all providers for English', () => {
      const providers = getProvidersForLanguage('en');
      expect(providers).toContain('openai');
      expect(providers).toContain('elevenlabs');
      expect(providers).toContain('browser');
      expect(providers).toContain('groq');
      expect(providers).toContain('cartesia');
    });

    test('returns multilingual providers for Spanish', () => {
      const providers = getProvidersForLanguage('es');
      expect(providers).toContain('openai');
      expect(providers).toContain('elevenlabs');
      expect(providers).toContain('browser');
      expect(providers).not.toContain('groq');
      expect(providers).not.toContain('cartesia');
    });

    test('returns multilingual providers for Japanese', () => {
      const providers = getProvidersForLanguage('ja');
      expect(providers).toContain('openai');
      expect(providers).toContain('elevenlabs');
      expect(providers).toContain('browser');
      expect(providers).not.toContain('groq');
    });
  });

  describe('getAllLanguages', () => {
    test('returns array of language objects', () => {
      const languages = getAllLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThanOrEqual(20);
    });

    test('each language has code and displayName', () => {
      const languages = getAllLanguages();
      languages.forEach(lang => {
        expect(lang.code).toBeDefined();
        expect(lang.displayName).toBeDefined();
        expect(typeof lang.code).toBe('string');
        expect(typeof lang.displayName).toBe('string');
      });
    });
  });

  // T035: Tests for getVoicesForLanguage (019-multilingual-tts)
  describe('getVoicesForLanguage', () => {
    const mockVoices = [
      { id: 'en-voice-1', name: 'English Voice 1', lang: 'en-US' },
      { id: 'en-voice-2', name: 'English Voice 2', lang: 'en-GB' },
      { id: 'es-voice', name: 'Spanish Voice', lang: 'es-ES' },
      { id: 'fr-voice', name: 'French Voice', lang: 'fr-FR' },
      { id: 'ja-voice', name: 'Japanese Voice', lang: 'ja-JP' }
    ];

    const mockApiVoices = [
      { id: 'alloy', name: 'Alloy' },
      { id: 'echo', name: 'Echo' },
      { id: 'nova', name: 'Nova' }
    ];

    test('returns empty array for null/empty voices', () => {
      expect(getVoicesForLanguage(null, 'en', 'browser')).toEqual([]);
      expect(getVoicesForLanguage([], 'en', 'browser')).toEqual([]);
    });

    test('returns all voices when languageCode is null', () => {
      const result = getVoicesForLanguage(mockVoices, null, 'browser');
      expect(result).toEqual(mockVoices);
    });

    test('OpenAI returns all voices for any language (auto-detect)', () => {
      expect(getVoicesForLanguage(mockApiVoices, 'es', 'openai')).toEqual(mockApiVoices);
      expect(getVoicesForLanguage(mockApiVoices, 'ja', 'openai')).toEqual(mockApiVoices);
      expect(getVoicesForLanguage(mockApiVoices, 'zh', 'openai')).toEqual(mockApiVoices);
    });

    test('Groq returns all voices for English', () => {
      expect(getVoicesForLanguage(mockApiVoices, 'en', 'groq')).toEqual(mockApiVoices);
    });

    test('Groq returns empty for non-English', () => {
      expect(getVoicesForLanguage(mockApiVoices, 'es', 'groq')).toEqual([]);
      expect(getVoicesForLanguage(mockApiVoices, 'ja', 'groq')).toEqual([]);
    });

    test('Cartesia returns all voices for English', () => {
      expect(getVoicesForLanguage(mockApiVoices, 'en', 'cartesia')).toEqual(mockApiVoices);
    });

    test('Cartesia returns empty for non-English', () => {
      expect(getVoicesForLanguage(mockApiVoices, 'de', 'cartesia')).toEqual([]);
    });

    test('ElevenLabs returns all voices for supported languages', () => {
      expect(getVoicesForLanguage(mockApiVoices, 'es', 'elevenlabs')).toEqual(mockApiVoices);
      expect(getVoicesForLanguage(mockApiVoices, 'ja', 'elevenlabs')).toEqual(mockApiVoices);
      expect(getVoicesForLanguage(mockApiVoices, 'zh', 'elevenlabs')).toEqual(mockApiVoices);
    });

    test('ElevenLabs returns empty for unsupported languages', () => {
      expect(getVoicesForLanguage(mockApiVoices, 'xyz', 'elevenlabs')).toEqual([]);
    });

    test('Browser TTS filters by voice.lang', () => {
      const result = getVoicesForLanguage(mockVoices, 'en', 'browser');
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('en-voice-1');
      expect(result[1].id).toBe('en-voice-2');
    });

    test('Browser TTS filters for Spanish', () => {
      const result = getVoicesForLanguage(mockVoices, 'es', 'browser');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('es-voice');
    });

    test('Browser TTS filters for Japanese', () => {
      const result = getVoicesForLanguage(mockVoices, 'ja', 'browser');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('ja-voice');
    });

    test('Browser TTS returns empty when no matching voices', () => {
      const result = getVoicesForLanguage(mockVoices, 'zh', 'browser');
      expect(result).toEqual([]);
    });

    test('Browser TTS matches description fallback', () => {
      const voicesWithDesc = [
        { id: 'voice1', name: 'Voice 1', description: 'es-ES' },
        { id: 'voice2', name: 'Voice 2', description: 'en-US' }
      ];
      const result = getVoicesForLanguage(voicesWithDesc, 'es', 'browser');
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('voice1');
    });
  });
});

describe('BCP 47 Utilities', () => {
  describe('parseBCP47', () => {
    test('parses simple language code', () => {
      const result = parseBCP47('en');
      expect(result.primary).toBe('en');
      expect(result.region).toBeNull();
      expect(result.script).toBeNull();
    });

    test('parses language with region', () => {
      const result = parseBCP47('en-US');
      expect(result.primary).toBe('en');
      expect(result.region).toBe('us');
    });

    test('parses language with script', () => {
      const result = parseBCP47('zh-Hans');
      expect(result.primary).toBe('zh');
      expect(result.script).toBe('hans');
    });

    test('parses language with script and region', () => {
      const result = parseBCP47('zh-Hans-CN');
      expect(result.primary).toBe('zh');
      expect(result.script).toBe('hans');
      expect(result.region).toBe('cn');
    });

    test('handles null/undefined input', () => {
      expect(parseBCP47(null).primary).toBe('en');
      expect(parseBCP47(undefined).primary).toBe('en');
      expect(parseBCP47('').primary).toBe('en');
    });
  });

  describe('normalizeLanguageCode', () => {
    test('extracts primary code from BCP 47', () => {
      expect(normalizeLanguageCode('en-US')).toBe('en');
      expect(normalizeLanguageCode('fr-CA')).toBe('fr');
      expect(normalizeLanguageCode('zh-Hans-CN')).toBe('zh');
    });

    test('handles simple codes', () => {
      expect(normalizeLanguageCode('es')).toBe('es');
      expect(normalizeLanguageCode('de')).toBe('de');
    });
  });

  describe('isLanguageSupported', () => {
    test('returns true for supported languages', () => {
      expect(isLanguageSupported('en')).toBe(true);
      expect(isLanguageSupported('es')).toBe(true);
      expect(isLanguageSupported('fr')).toBe(true);
      expect(isLanguageSupported('ja')).toBe(true);
    });

    test('returns true for BCP 47 codes', () => {
      expect(isLanguageSupported('en-US')).toBe(true);
      expect(isLanguageSupported('es-ES')).toBe(true);
    });

    test('returns false for unsupported languages', () => {
      expect(isLanguageSupported('xyz')).toBe(false);
      expect(isLanguageSupported('klingon')).toBe(false);
    });
  });

  describe('SUPPORTED_LANGUAGES', () => {
    test('contains 20+ languages', () => {
      expect(Object.keys(SUPPORTED_LANGUAGES).length).toBeGreaterThanOrEqual(20);
    });

    test('includes common languages', () => {
      expect(SUPPORTED_LANGUAGES.en).toBe('English');
      expect(SUPPORTED_LANGUAGES.es).toBe('Spanish');
      expect(SUPPORTED_LANGUAGES.fr).toBe('French');
      expect(SUPPORTED_LANGUAGES.de).toBe('German');
      expect(SUPPORTED_LANGUAGES.ja).toBe('Japanese');
      expect(SUPPORTED_LANGUAGES.zh).toBe('Chinese');
    });
  });
});
