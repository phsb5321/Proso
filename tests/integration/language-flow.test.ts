// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Language Flow Integration Tests
 * 048-multilingual-tts-pillar: Tests the complete language detection and TTS flow
 *
 * @jest-environment jsdom
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  handleLanguageDetect,
  handleLanguageGetState,
  handleLanguageSetOverride,
  handleLanguageClearOverride,
} from '../../src/utils/messaging/handlers/language';

// Mock browser storage API
const mockStorage: Record<string, unknown> = {};
const mockBrowser = {
  storage: {
    local: {
      get: jest.fn(async (keys: string | string[]) => {
        if (typeof keys === 'string') {
          return { [keys]: mockStorage[keys] };
        }
        const result: Record<string, unknown> = {};
        keys.forEach((key) => {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        });
        return result;
      }),
      set: jest.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorage, data);
      }),
    },
  },
};

// Assign mock to global
(global as Record<string, unknown>).browser = mockBrowser;

// Mock franc-min
jest.mock('franc-min', () => ({
  franc: jest.fn((text: string) => {
    // Simple mock: detect based on common words
    if (text.includes('Hola') || text.includes('mundo')) return 'spa';
    if (text.includes('Bonjour') || text.includes('monde')) return 'fra';
    if (text.includes('Hallo') || text.includes('Welt')) return 'deu';
    return 'eng';
  }),
}));

describe('Language Detection Flow Integration (048-multilingual-tts-pillar)', () => {
  beforeEach(() => {
    // Clear storage before each test
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    jest.clearAllMocks();
  });

  describe('Complete Detection → Override → Clear Flow', () => {
    it('detects language, allows override, and clears override', async () => {
      // Step 1: Initial detection
      const detected = await handleLanguageDetect({
        metadata: 'es',
        textSample: 'Hola mundo, esta es una prueba de texto largo para detección.',
        url: 'https://es.wikipedia.org/wiki/Prueba',
      });

      expect(detected.code).toBe('es');
      expect(detected.source).toBe('metadata');
      expect(detected.isReliable).toBe(true);

      // Step 2: Check initial state
      const initialState = await handleLanguageGetState({ tabId: 123 });
      expect(initialState.detected?.code).toBe('es');
      expect(initialState.override).toBeNull();
      expect(initialState.effective).toBe('es');

      // Step 3: Set override to French
      const overrideResult = await handleLanguageSetOverride({ languageCode: 'fr' });
      expect(overrideResult.success).toBe(true);
      expect(overrideResult.languageCode).toBe('fr');

      // Step 4: Verify effective language is now override
      const overriddenState = await handleLanguageGetState({ tabId: 123 });
      expect(overriddenState.override).toBe('fr');
      expect(overriddenState.effective).toBe('fr'); // Override takes precedence
      expect(overriddenState.detected?.code).toBe('es'); // Detection unchanged

      // Step 5: Clear override
      const clearResult = await handleLanguageClearOverride();
      expect(clearResult.success).toBe(true);

      // Step 6: Verify returns to detected language
      const clearedState = await handleLanguageGetState({ tabId: 123 });
      expect(clearedState.override).toBeNull();
      expect(clearedState.effective).toBe('es'); // Back to detected
    });
  });

  describe('Detection Priority', () => {
    it('uses metadata over text when both available', async () => {
      const result = await handleLanguageDetect({
        metadata: 'fr',
        textSample: 'Hello world this is English text.',
        url: 'https://example.com/page',
      });

      // Metadata wins
      expect(result.code).toBe('fr');
      expect(result.source).toBe('metadata');
    });

    it('falls back to text detection when no metadata', async () => {
      const result = await handleLanguageDetect({
        textSample:
          'Hello world, this is a sample of English text that should be detected correctly by the language detection library.',
        url: 'https://example.com/page',
      });

      expect(result.code).toBe('en');
      expect(result.source).toMatch(/^(text|fallback)$/);
    });

    it('falls back to English for very short text', async () => {
      const result = await handleLanguageDetect({
        textSample: 'Hi',
        url: 'https://example.com/short',
      });

      expect(result.code).toBe('en');
      expect(result.source).toBe('fallback');
    });
  });

  describe('Caching Behavior', () => {
    it('caches detection results by URL', async () => {
      const url = 'https://es.example.com/cached-page';

      // First detection
      const first = await handleLanguageDetect({
        metadata: 'es',
        textSample: 'Hola mundo',
        url,
      });

      expect(first.code).toBe('es');
      expect(mockBrowser.storage.local.set).toHaveBeenCalled();

      // Second detection should use cache (storage.get called)
      const setCallsBeforeSecond = mockBrowser.storage.local.set.mock.calls.length;

      const second = await handleLanguageDetect({
        metadata: 'fr', // Different metadata - should be ignored due to cache
        textSample: 'Bonjour monde',
        url, // Same URL
      });

      // Should return cached result
      expect(second.code).toBe('es');
    });
  });

  describe('Multilingual Page Support', () => {
    it('handles pages with multiple languages via override', async () => {
      // Detect initial language
      await handleLanguageDetect({
        metadata: 'en',
        textSample: 'Hello world',
        url: 'https://example.com/mixed-content',
      });

      // User reads Spanish section and overrides
      await handleLanguageSetOverride({ languageCode: 'es' });

      const stateSpanish = await handleLanguageGetState({ tabId: 1 });
      expect(stateSpanish.effective).toBe('es');

      // User reads French section and overrides again
      await handleLanguageSetOverride({ languageCode: 'fr' });

      const stateFrench = await handleLanguageGetState({ tabId: 1 });
      expect(stateFrench.effective).toBe('fr');

      // Clear to go back to auto-detect
      await handleLanguageClearOverride();

      const stateAuto = await handleLanguageGetState({ tabId: 1 });
      expect(stateAuto.override).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('handles missing text sample gracefully', async () => {
      const result = await handleLanguageDetect({
        url: 'https://example.com/no-text',
      });

      // Should fall back to English
      expect(result.code).toBe('en');
      expect(result.source).toBe('fallback');
    });

    it('validates language code length for override', async () => {
      await expect(
        handleLanguageSetOverride({ languageCode: 'english' }),
      ).rejects.toThrow();
    });
  });
});
