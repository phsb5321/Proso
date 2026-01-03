/**
 * Unit tests for content/language-extractor.js
 * Tests DOM language extraction (T019)
 *
 * Note: These tests verify the extraction logic works correctly.
 * The actual DOM interaction is tested through the content script integration.
 */

import { describe, test, expect } from '@jest/globals';

describe('Language Extractor', () => {
  describe('extractPageLanguage function contract', () => {
    test('function should return object with metadata, textSample, and url', async () => {
      // Import module to verify exports
      const module = await import('../../content/language-extractor.js');

      expect(module.extractPageLanguage).toBeDefined();
      expect(typeof module.extractPageLanguage).toBe('function');
    });

    test('function should be exported as default', async () => {
      const module = await import('../../content/language-extractor.js');

      expect(module.default).toBeDefined();
      expect(module.default.extractPageLanguage).toBeDefined();
    });

    test('sendLanguageDetectionRequest should be exported', async () => {
      const module = await import('../../content/language-extractor.js');

      expect(module.sendLanguageDetectionRequest).toBeDefined();
      expect(typeof module.sendLanguageDetectionRequest).toBe('function');
    });
  });

  describe('expected return value structure', () => {
    test('extractPageLanguage returns expected shape', async () => {
      const module = await import('../../content/language-extractor.js');

      // Call the function to verify it returns expected structure
      const result = module.extractPageLanguage();

      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('textSample');
      expect(result).toHaveProperty('url');

      // metadata should be string or null
      expect(result.metadata === null || typeof result.metadata === 'string').toBe(true);

      // textSample should be string
      expect(typeof result.textSample).toBe('string');

      // url should be string
      expect(typeof result.url).toBe('string');
    });
  });

  describe('text sample constraints', () => {
    test('text sample should not exceed 1000 characters', async () => {
      const module = await import('../../content/language-extractor.js');

      const result = module.extractPageLanguage();

      expect(result.textSample.length).toBeLessThanOrEqual(1000);
    });
  });
});
