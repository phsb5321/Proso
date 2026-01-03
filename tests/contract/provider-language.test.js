/**
 * Contract tests for provider language support (T020)
 * Tests supportedLanguages and supportsLanguage() for each provider
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock browser API for storage
global.browser = {
  storage: {
    local: {
      get: jest.fn(() => Promise.resolve({})),
      set: jest.fn(() => Promise.resolve())
    }
  }
};

// Mock speechSynthesis for browser provider
global.speechSynthesis = {
  getVoices: jest.fn(() => [
    { voiceURI: 'en-voice', lang: 'en-US', name: 'English' },
    { voiceURI: 'es-voice', lang: 'es-ES', name: 'Spanish' },
    { voiceURI: 'fr-voice', lang: 'fr-FR', name: 'French' }
  ])
};

global.SpeechSynthesisUtterance = jest.fn();

describe('Provider Language Support Contracts', () => {
  describe('TTSProvider Base Class', () => {
    let TTSProvider;

    beforeEach(async () => {
      const module = await import('../../background/providers/base-provider.js');
      TTSProvider = module.TTSProvider;
    });

    test('has static supportedLanguages getter', () => {
      expect(TTSProvider.supportedLanguages).toBeDefined();
      expect(Array.isArray(TTSProvider.supportedLanguages)).toBe(true);
    });

    test('default supportedLanguages is English only', () => {
      expect(TTSProvider.supportedLanguages).toEqual(['en']);
    });
  });

  describe('ElevenLabsProvider', () => {
    let ElevenLabsProvider;

    beforeEach(async () => {
      const module = await import('../../background/providers/elevenlabs-provider.js');
      ElevenLabsProvider = module.ElevenLabsProvider;
    });

    test('supports 29+ languages', () => {
      expect(ElevenLabsProvider.supportedLanguages.length).toBeGreaterThanOrEqual(29);
    });

    test('supportedLanguages includes common languages', () => {
      const supported = ElevenLabsProvider.supportedLanguages;
      expect(supported).toContain('en');
      expect(supported).toContain('es');
      expect(supported).toContain('fr');
      expect(supported).toContain('de');
      expect(supported).toContain('ja');
      expect(supported).toContain('zh');
      expect(supported).toContain('ar');
    });

    test('supportsLanguage returns true for supported languages', () => {
      const provider = new ElevenLabsProvider('test-key');
      expect(provider.supportsLanguage('es')).toBe(true);
      expect(provider.supportsLanguage('fr')).toBe(true);
      expect(provider.supportsLanguage('ja')).toBe(true);
    });

    test('supportsLanguage handles BCP 47 codes', () => {
      const provider = new ElevenLabsProvider('test-key');
      expect(provider.supportsLanguage('en-US')).toBe(true);
      expect(provider.supportsLanguage('es-ES')).toBe(true);
      expect(provider.supportsLanguage('zh-CN')).toBe(true);
    });
  });

  describe('OpenAIProvider', () => {
    let OpenAIProvider;

    beforeEach(async () => {
      const module = await import('../../background/providers/openai-provider.js');
      OpenAIProvider = module.OpenAIProvider;
    });

    test('supportedLanguages returns ["*"] for auto-detect', () => {
      expect(OpenAIProvider.supportedLanguages).toEqual(['*']);
    });

    test('supportsLanguage returns true for any language', () => {
      const provider = new OpenAIProvider('test-key');
      expect(provider.supportsLanguage('es')).toBe(true);
      expect(provider.supportsLanguage('zh')).toBe(true);
      expect(provider.supportsLanguage('ar')).toBe(true);
      expect(provider.supportsLanguage('unknown')).toBe(true);
    });
  });

  describe('BrowserProvider', () => {
    let BrowserProvider;

    beforeEach(async () => {
      const module = await import('../../background/providers/browser-provider.js');
      BrowserProvider = module.BrowserProvider;
    });

    test('supportedLanguages includes common languages', () => {
      const supported = BrowserProvider.supportedLanguages;
      expect(supported).toContain('en');
      expect(supported).toContain('es');
      expect(supported).toContain('fr');
      expect(supported).toContain('de');
    });

    test('supportsLanguage returns true for listed languages', () => {
      const provider = new BrowserProvider();
      expect(provider.supportsLanguage('en')).toBe(true);
      expect(provider.supportsLanguage('es')).toBe(true);
    });
  });

  describe('GroqProvider', () => {
    let GroqProvider;

    beforeEach(async () => {
      const module = await import('../../background/providers/groq-provider.js');
      GroqProvider = module.GroqProvider;
    });

    test('supportedLanguages is English only', () => {
      expect(GroqProvider.supportedLanguages).toEqual(['en']);
    });

    test('supportsLanguage returns true only for English', () => {
      const provider = new GroqProvider('test-key');
      expect(provider.supportsLanguage('en')).toBe(true);
      expect(provider.supportsLanguage('en-US')).toBe(true);
      expect(provider.supportsLanguage('en-GB')).toBe(true);
    });

    test('supportsLanguage returns false for non-English', () => {
      const provider = new GroqProvider('test-key');
      expect(provider.supportsLanguage('es')).toBe(false);
      expect(provider.supportsLanguage('fr')).toBe(false);
      expect(provider.supportsLanguage('de')).toBe(false);
    });
  });

  describe('CartesiaProvider', () => {
    let CartesiaProvider;

    beforeEach(async () => {
      const module = await import('../../background/providers/cartesia-provider.js');
      CartesiaProvider = module.CartesiaProvider;
    });

    test('supportedLanguages is English only', () => {
      expect(CartesiaProvider.supportedLanguages).toEqual(['en']);
    });

    test('supportsLanguage returns true only for English', () => {
      const provider = new CartesiaProvider('test-key');
      expect(provider.supportsLanguage('en')).toBe(true);
    });

    test('supportsLanguage returns false for non-English', () => {
      const provider = new CartesiaProvider('test-key');
      expect(provider.supportsLanguage('ja')).toBe(false);
      expect(provider.supportsLanguage('zh')).toBe(false);
    });
  });

  describe('LanguageNotSupportedError', () => {
    let LanguageNotSupportedError;

    beforeEach(async () => {
      const module = await import('../../shared/errors/language-errors.js');
      LanguageNotSupportedError = module.LanguageNotSupportedError;
    });

    test('creates error with correct properties', () => {
      const error = new LanguageNotSupportedError('es', 'groq', ['elevenlabs', 'openai']);

      expect(error.name).toBe('LanguageNotSupportedError');
      expect(error.languageCode).toBe('es');
      expect(error.providerId).toBe('groq');
      expect(error.compatibleProviders).toEqual(['elevenlabs', 'openai']);
      expect(error.message).toContain('es');
      expect(error.message).toContain('groq');
    });
  });

  describe('Provider generateAudio language check', () => {
    test('GroqProvider throws LanguageNotSupportedError for non-English', async () => {
      const { GroqProvider } = await import('../../background/providers/groq-provider.js');
      const { LanguageNotSupportedError } = await import('../../shared/errors/language-errors.js');

      const provider = new GroqProvider('test-key');

      await expect(
        provider.generateAudio('Hola mundo', 'hannah', { languageCode: 'es' })
      ).rejects.toThrow(LanguageNotSupportedError);
    });

    test('CartesiaProvider throws LanguageNotSupportedError for non-English', async () => {
      const { CartesiaProvider } = await import('../../background/providers/cartesia-provider.js');
      const { LanguageNotSupportedError } = await import('../../shared/errors/language-errors.js');

      const provider = new CartesiaProvider('test-key');

      await expect(
        provider.generateAudio('Bonjour', 'voice-id', { languageCode: 'fr' })
      ).rejects.toThrow(LanguageNotSupportedError);
    });

    test('GroqProvider allows English', async () => {
      const { GroqProvider } = await import('../../background/providers/groq-provider.js');
      const { LanguageNotSupportedError } = await import('../../shared/errors/language-errors.js');

      const provider = new GroqProvider('test-key');

      // Should not throw LanguageNotSupportedError for English (may throw other errors like fetch)
      await expect(
        provider.generateAudio('Hello world', 'hannah', { languageCode: 'en' })
      ).rejects.not.toBeInstanceOf(LanguageNotSupportedError);
    });
  });
});
