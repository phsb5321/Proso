/**
 * Unit tests for background/language-detector.js
 * Tests language detection from text and metadata (T017)
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock browser API
const mockStorage = {};
global.browser = {
  storage: {
    local: {
      get: jest.fn((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: mockStorage[keys] });
        }
        const result = {};
        keys.forEach(k => { result[k] = mockStorage[k]; });
        return Promise.resolve(result);
      }),
      set: jest.fn((obj) => {
        Object.assign(mockStorage, obj);
        return Promise.resolve();
      })
    }
  }
};

// Mock CLD3 module
jest.unstable_mockModule('cld3-asm', () => ({
  CLD3: {
    create: jest.fn(() => Promise.resolve({
      findLanguage: jest.fn((text) => {
        // Simulate language detection based on text content
        if (text.includes('Hola') || text.includes('español')) {
          return { language: 'es', probability: 0.95, is_reliable: true };
        }
        if (text.includes('Bonjour') || text.includes('français')) {
          return { language: 'fr', probability: 0.92, is_reliable: true };
        }
        if (text.includes('Guten') || text.includes('deutschen')) {
          return { language: 'de', probability: 0.88, is_reliable: true };
        }
        if (text.includes('Hello') || text.includes('English')) {
          return { language: 'en', probability: 0.98, is_reliable: true };
        }
        // Low confidence fallback
        return { language: 'und', probability: 0.3, is_reliable: false };
      })
    }))
  }
}));

describe('Language Detector', () => {
  let languageDetector;

  beforeEach(async () => {
    // Clear storage mock
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    jest.clearAllMocks();

    // Dynamic import after mocking
    languageDetector = await import('../../background/language-detector.js');
  });

  describe('initCLD', () => {
    test('initializes CLD3 instance', async () => {
      const cld = await languageDetector.initCLD();
      expect(cld).toBeDefined();
      expect(cld.findLanguage).toBeDefined();
    });

    test('returns same instance on subsequent calls', async () => {
      const cld1 = await languageDetector.initCLD();
      const cld2 = await languageDetector.initCLD();
      expect(cld1).toBe(cld2);
    });
  });

  describe('detectLanguageFromText', () => {
    test('detects Spanish text', async () => {
      const result = await languageDetector.detectLanguageFromText(
        'Hola, esto es un texto en español para probar la detección.'
      );
      expect(result).toBeDefined();
      expect(result.code).toBe('es');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.isReliable).toBe(true);
    });

    test('detects French text', async () => {
      const result = await languageDetector.detectLanguageFromText(
        'Bonjour, ceci est un texte en français pour tester la détection.'
      );
      expect(result).toBeDefined();
      expect(result.code).toBe('fr');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('detects English text', async () => {
      const result = await languageDetector.detectLanguageFromText(
        'Hello, this is an English text for testing the language detection system.'
      );
      expect(result).toBeDefined();
      expect(result.code).toBe('en');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('returns null for empty text', async () => {
      const result = await languageDetector.detectLanguageFromText('');
      expect(result).toBeNull();
    });

    test('returns null for very short text', async () => {
      const result = await languageDetector.detectLanguageFromText('Hi');
      expect(result).toBeNull();
    });
  });

  describe('detectLanguage (combined detection)', () => {
    test('prefers text detection when confidence > 90%', async () => {
      const result = await languageDetector.detectLanguage({
        metadata: 'en',
        textSample: 'Hola, esto es un texto en español para probar la detección automática.',
        url: 'https://example.com/page1'
      });

      // Should detect Spanish from text despite English metadata
      expect(result.code).toBe('es');
      expect(result.source).toBe('text');
    });

    test('uses metadata when text detection not confident', async () => {
      const result = await languageDetector.detectLanguage({
        metadata: 'de',
        textSample: 'abc def', // Too short/unclear for confident detection
        url: 'https://example.com/page2'
      });

      // Should use metadata
      expect(result.code).toBe('de');
      expect(result.source).toBe('metadata');
    });

    test('falls back to English when detection fails', async () => {
      const result = await languageDetector.detectLanguage({
        metadata: null,
        textSample: '', // No text
        url: 'https://example.com/page3'
      });

      // Should fallback to English
      expect(result.primaryCode).toBe('en');
    });

    test('caches detection results', async () => {
      const url = 'https://example.com/cached-page';
      await languageDetector.detectLanguage({
        metadata: 'es',
        textSample: 'Hola mundo',
        url
      });

      // Second call should use cache
      const result = await languageDetector.detectLanguage({
        metadata: 'en', // Different metadata
        textSample: 'Hello world', // Different text
        url // Same URL
      });

      // Should return cached Spanish result
      expect(result.primaryCode).toBe('es');
    });
  });

  describe('getLanguageState', () => {
    test('returns default state when no detection', async () => {
      const state = await languageDetector.getLanguageState(1);
      expect(state.effective).toBe('en');
      expect(state.detected).toBeNull();
      expect(state.override).toBeNull();
    });
  });

  describe('setLanguageOverride and clearLanguageOverride', () => {
    test('sets language override', async () => {
      await languageDetector.setLanguageOverride('de');
      const state = await languageDetector.getLanguageState(1);
      expect(state.override).toBe('de');
      expect(state.effective).toBe('de');
    });

    test('clears language override', async () => {
      await languageDetector.setLanguageOverride('fr');
      await languageDetector.clearLanguageOverride();
      const state = await languageDetector.getLanguageState(1);
      expect(state.override).toBeNull();
    });
  });

  describe('confidence thresholds', () => {
    test('marks detection as reliable when confidence >= 0.9', async () => {
      const result = await languageDetector.detectLanguageFromText(
        'Hello, this is an English text for testing the language detection system.'
      );
      expect(result.isReliable).toBe(true);
    });

    test('marks metadata detection as reliable', async () => {
      const result = await languageDetector.detectLanguage({
        metadata: 'ja',
        textSample: '',
        url: 'https://example.com/japanese'
      });
      expect(result.isReliable).toBe(true);
      expect(result.source).toBe('metadata');
    });
  });
});
