/**
 * ElevenLabs Language Codes API Contract Tests
 * Verifies the expected format of language codes for ElevenLabs API
 *
 * @feature 020-code-quality-fix
 */

import { getProviderLanguageCode, LANGUAGE_MAPPINGS } from '../../background/language-mappings.js';

describe('ElevenLabs API Language Code Contract', () => {
  describe('Language code format requirements', () => {
    test('ElevenLabs language codes are 2-5 characters', () => {
      Object.values(LANGUAGE_MAPPINGS).forEach(mapping => {
        const code = mapping.providers.elevenlabs;
        if (code !== null) {
          expect(code.length).toBeGreaterThanOrEqual(2);
          expect(code.length).toBeLessThanOrEqual(5);
        }
      });
    });

    test('ElevenLabs codes are lowercase', () => {
      Object.values(LANGUAGE_MAPPINGS).forEach(mapping => {
        const code = mapping.providers.elevenlabs;
        if (code !== null) {
          expect(code).toBe(code.toLowerCase());
        }
      });
    });

    test('Chinese uses zh-cn format (not just zh)', () => {
      const zhCode = getProviderLanguageCode('zh', 'elevenlabs');
      expect(zhCode).toBe('zh-cn');
    });

    test('null means use English default (no language_code parameter)', () => {
      const enCode = getProviderLanguageCode('en', 'elevenlabs');
      expect(enCode).toBeNull();
    });
  });

  describe('BCP 47 to ElevenLabs conversion', () => {
    const testCases = [
      { input: 'es-ES', expected: 'es' },
      { input: 'es-MX', expected: 'es' },
      { input: 'fr-FR', expected: 'fr' },
      { input: 'fr-CA', expected: 'fr' },
      { input: 'de-DE', expected: 'de' },
      { input: 'de-AT', expected: 'de' },
      { input: 'pt-BR', expected: 'pt' },
      { input: 'pt-PT', expected: 'pt' },
      { input: 'zh-CN', expected: 'zh-cn' },
      { input: 'zh-Hans', expected: 'zh-cn' },
      { input: 'ja-JP', expected: 'ja' },
      { input: 'ko-KR', expected: 'ko' },
      { input: 'en-US', expected: null },
      { input: 'en-GB', expected: null }
    ];

    testCases.forEach(({ input, expected }) => {
      test(`${input} converts to ${expected === null ? 'null' : expected}`, () => {
        expect(getProviderLanguageCode(input, 'elevenlabs')).toBe(expected);
      });
    });
  });

  describe('Edge cases', () => {
    test('unsupported language returns null', () => {
      // Languages not in our mapping should return null
      expect(getProviderLanguageCode('xyz', 'elevenlabs')).toBeNull();
      expect(getProviderLanguageCode('foo-BAR', 'elevenlabs')).toBeNull();
    });

    test('empty string returns null', () => {
      expect(getProviderLanguageCode('', 'elevenlabs')).toBeNull();
    });
  });
});
