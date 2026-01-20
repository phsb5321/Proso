/**
 * Unit tests for utils/language/mappings.ts
 * Tests BCP 47 parsing and provider code mapping (T018)
 * Post-045: Only ElevenLabs provider is supported
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
} from '../../src/utils/language/mappings';
import {
  parseBCP47,
  normalizeLanguageCode,
  isLanguageSupported,
  SUPPORTED_LANGUAGES
} from '../../src/utils/language/codes';

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

    test('all entries have elevenlabs provider mapping', () => {
      // Post-045: Only ElevenLabs is supported
      Object.values(LANGUAGE_MAPPINGS).forEach(mapping => {
        expect(mapping.providers).toHaveProperty('elevenlabs');
      });
    });

    test('ElevenLabs supports multiple languages', () => {
      // Post-045: ElevenLabs supports all mapped languages
      expect(LANGUAGE_MAPPINGS.es.providers.elevenlabs).toBe('es');
      expect(LANGUAGE_MAPPINGS.fr.providers.elevenlabs).toBe('fr');
      expect(LANGUAGE_MAPPINGS.de.providers.elevenlabs).toBe('de');
      expect(LANGUAGE_MAPPINGS.ja.providers.elevenlabs).toBe('ja');
    });

    test('English uses null for elevenlabs (default)', () => {
      const enMapping = LANGUAGE_MAPPINGS.en;
      expect(enMapping.providers.elevenlabs).toBeNull();
    });

    test('Chinese uses zh-cn for elevenlabs', () => {
      expect(LANGUAGE_MAPPINGS.zh.providers.elevenlabs).toBe('zh-cn');
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

    test('returns null for English on ElevenLabs (uses default)', () => {
      const code = getProviderLanguageCode('en', 'elevenlabs');
      expect(code).toBeNull();
    });

    test('returns null for unknown language', () => {
      const code = getProviderLanguageCode('xyz', 'elevenlabs');
      expect(code).toBeNull();
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
    test('ElevenLabs supports mapped languages', () => {
      // Post-045: Only ElevenLabs is supported
      expect(providerSupportsLanguage('elevenlabs', 'es')).toBe(true);
      expect(providerSupportsLanguage('elevenlabs', 'fr')).toBe(true);
      expect(providerSupportsLanguage('elevenlabs', 'ja')).toBe(true);
      expect(providerSupportsLanguage('elevenlabs', 'en')).toBe(true);
    });

    test('ElevenLabs returns false for unsupported languages', () => {
      expect(providerSupportsLanguage('elevenlabs', 'xyz')).toBe(false);
      expect(providerSupportsLanguage('elevenlabs', 'klingon')).toBe(false);
    });
  });

  describe('getProvidersForLanguage', () => {
    test('returns elevenlabs for English', () => {
      // Post-045: Only ElevenLabs is supported
      const providers = getProvidersForLanguage('en');
      expect(providers).toContain('elevenlabs');
      expect(providers).toHaveLength(1);
    });

    test('returns elevenlabs for Spanish', () => {
      // Post-045: Only ElevenLabs is supported
      const providers = getProvidersForLanguage('es');
      expect(providers).toContain('elevenlabs');
      expect(providers).toHaveLength(1);
    });

    test('returns elevenlabs for Japanese', () => {
      // Post-045: Only ElevenLabs is supported
      const providers = getProvidersForLanguage('ja');
      expect(providers).toContain('elevenlabs');
      expect(providers).toHaveLength(1);
    });

    test('returns empty array for unsupported language', () => {
      const providers = getProvidersForLanguage('xyz');
      expect(providers).toEqual([]);
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
  // Post-045: Only ElevenLabs provider, simplified voice filtering
  describe('getVoicesForLanguage', () => {
    const mockApiVoices = [
      { id: 'alloy', name: 'Alloy' },
      { id: 'echo', name: 'Echo' },
      { id: 'nova', name: 'Nova' }
    ];

    test('returns empty array for null/empty voices', () => {
      expect(getVoicesForLanguage(null, 'en', 'elevenlabs')).toEqual([]);
      expect(getVoicesForLanguage([], 'en', 'elevenlabs')).toEqual([]);
    });

    test('returns all voices when languageCode is null', () => {
      const result = getVoicesForLanguage(mockApiVoices, null, 'elevenlabs');
      expect(result).toEqual(mockApiVoices);
    });

    test('ElevenLabs returns all voices for supported languages', () => {
      // Post-045: ElevenLabs supports all mapped languages
      expect(getVoicesForLanguage(mockApiVoices, 'es', 'elevenlabs')).toEqual(mockApiVoices);
      expect(getVoicesForLanguage(mockApiVoices, 'ja', 'elevenlabs')).toEqual(mockApiVoices);
      expect(getVoicesForLanguage(mockApiVoices, 'zh', 'elevenlabs')).toEqual(mockApiVoices);
      expect(getVoicesForLanguage(mockApiVoices, 'en', 'elevenlabs')).toEqual(mockApiVoices);
    });

    test('ElevenLabs returns empty for unsupported languages', () => {
      expect(getVoicesForLanguage(mockApiVoices, 'xyz', 'elevenlabs')).toEqual([]);
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
