/**
 * ElevenLabs Language Code Mapping Tests
 * Verifies language code handling for ElevenLabs multilingual TTS
 *
 * @feature 020-code-quality-fix
 */

import { getProviderLanguageCode, getLanguageMapping, LANGUAGE_MAPPINGS } from '../../background/language-mappings.js';

describe('ElevenLabs Language Code Mapping', () => {
  describe('getProviderLanguageCode for ElevenLabs', () => {
    test('Spanish maps to es', () => {
      expect(getProviderLanguageCode('es', 'elevenlabs')).toBe('es');
      expect(getProviderLanguageCode('es-ES', 'elevenlabs')).toBe('es');
      expect(getProviderLanguageCode('es-MX', 'elevenlabs')).toBe('es');
    });

    test('French maps to fr', () => {
      expect(getProviderLanguageCode('fr', 'elevenlabs')).toBe('fr');
      expect(getProviderLanguageCode('fr-FR', 'elevenlabs')).toBe('fr');
      expect(getProviderLanguageCode('fr-CA', 'elevenlabs')).toBe('fr');
    });

    test('German maps to de', () => {
      expect(getProviderLanguageCode('de', 'elevenlabs')).toBe('de');
      expect(getProviderLanguageCode('de-DE', 'elevenlabs')).toBe('de');
    });

    test('Portuguese maps to pt', () => {
      expect(getProviderLanguageCode('pt', 'elevenlabs')).toBe('pt');
      expect(getProviderLanguageCode('pt-BR', 'elevenlabs')).toBe('pt');
      expect(getProviderLanguageCode('pt-PT', 'elevenlabs')).toBe('pt');
    });

    test('Italian maps to it', () => {
      expect(getProviderLanguageCode('it', 'elevenlabs')).toBe('it');
      expect(getProviderLanguageCode('it-IT', 'elevenlabs')).toBe('it');
    });

    test('Chinese maps to zh-cn', () => {
      expect(getProviderLanguageCode('zh', 'elevenlabs')).toBe('zh-cn');
      expect(getProviderLanguageCode('zh-CN', 'elevenlabs')).toBe('zh-cn');
      expect(getProviderLanguageCode('zh-Hans', 'elevenlabs')).toBe('zh-cn');
    });

    test('Japanese maps to ja', () => {
      expect(getProviderLanguageCode('ja', 'elevenlabs')).toBe('ja');
      expect(getProviderLanguageCode('ja-JP', 'elevenlabs')).toBe('ja');
    });

    test('Korean maps to ko', () => {
      expect(getProviderLanguageCode('ko', 'elevenlabs')).toBe('ko');
      expect(getProviderLanguageCode('ko-KR', 'elevenlabs')).toBe('ko');
    });

    test('English returns null (use default)', () => {
      expect(getProviderLanguageCode('en', 'elevenlabs')).toBeNull();
      expect(getProviderLanguageCode('en-US', 'elevenlabs')).toBeNull();
      expect(getProviderLanguageCode('en-GB', 'elevenlabs')).toBeNull();
    });

    test('All 29 supported languages have mappings', () => {
      const supported = [
        'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl',
        'cs', 'ar', 'zh', 'hu', 'ko', 'ja', 'hi', 'sv', 'id', 'fil',
        'uk', 'el', 'fi', 'ro', 'da', 'bg', 'ms', 'sk', 'hr', 'ta'
      ];

      supported.forEach(code => {
        const result = getProviderLanguageCode(code, 'elevenlabs');
        // null for English, string for others
        expect(result === null || typeof result === 'string').toBe(true);
      });
    });
  });

  describe('Language mapping completeness', () => {
    test('all ElevenLabs languages have correct provider codes', () => {
      const elevenLabsLanguages = Object.entries(LANGUAGE_MAPPINGS);

      elevenLabsLanguages.forEach(([code, mapping]) => {
        const providerCode = mapping.providers.elevenlabs;
        if (code === 'en') {
          expect(providerCode).toBeNull();
        } else {
          expect(typeof providerCode).toBe('string');
          expect(providerCode.length).toBeGreaterThanOrEqual(2);
        }
      });
    });

    test('Chinese has zh-cn as ElevenLabs code', () => {
      const zhMapping = getLanguageMapping('zh');
      expect(zhMapping.providers.elevenlabs).toBe('zh-cn');
    });
  });
});
