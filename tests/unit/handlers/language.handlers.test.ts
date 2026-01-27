// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Language Handler Tests
 * 048-multilingual-tts-pillar: Unit tests for language detection handlers
 *
 * @jest-environment jsdom
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  handleLanguageDetect,
  handleLanguageGetState,
  handleLanguageSetOverride,
  handleLanguageClearOverride,
  registerLanguageHandlers,
} from '../../../src/utils/messaging/handlers/language';

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
  franc: jest.fn(() => 'eng'),
}));

describe('Language Handlers (048-multilingual-tts-pillar)', () => {
  beforeEach(() => {
    // Clear storage before each test
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    jest.clearAllMocks();
  });

  describe('handleLanguageDetect', () => {
    it('detects language from metadata', async () => {
      const result = await handleLanguageDetect({
        metadata: 'en-US',
        textSample: 'Hello world, this is a test.',
        url: 'https://example.com/page',
      });

      expect(result).toMatchObject({
        code: expect.any(String),
        confidence: expect.any(Number),
        source: expect.stringMatching(/^(metadata|text|fallback)$/),
        isReliable: expect.any(Boolean),
      });
    });

    it('falls back to English for short text without metadata', async () => {
      const result = await handleLanguageDetect({
        url: 'https://example.com/short',
        textSample: 'Hi',
      });

      expect(result.code).toBe('en');
      expect(result.source).toBe('fallback');
    });

    it('validates URL parameter', async () => {
      await expect(
        handleLanguageDetect({
          url: 'not-a-valid-url',
        }),
      ).rejects.toThrow();
    });

    it('stores detected language for future reference', async () => {
      await handleLanguageDetect({
        metadata: 'es',
        textSample: 'Hola mundo, esto es una prueba de texto.',
        url: 'https://es.example.com/page',
      });

      expect(mockBrowser.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('handleLanguageGetState', () => {
    it('returns default state for new tab', async () => {
      const result = await handleLanguageGetState({ tabId: 123 });

      expect(result).toMatchObject({
        detected: null,
        override: null,
        effective: 'en',
        autoDetect: true,
      });
    });

    it('returns stored detected language', async () => {
      // Pre-populate storage with detected language
      mockStorage['detectedLanguage'] = {
        code: 'fr',
        confidence: 0.95,
        source: 'text',
        isReliable: true,
        primaryCode: 'fr',
        detectedAt: Date.now(),
      };

      const result = await handleLanguageGetState({ tabId: 456 });

      expect(result.detected).not.toBeNull();
      expect(result.detected?.code).toBe('fr');
    });

    it('returns override when set', async () => {
      mockStorage['languagePreference'] = {
        autoDetect: true,
        currentOverride: 'de',
        voicePreferences: {},
      };

      const result = await handleLanguageGetState({ tabId: 789 });

      expect(result.override).toBe('de');
      expect(result.effective).toBe('de');
    });
  });

  describe('handleLanguageSetOverride', () => {
    it('sets language override', async () => {
      const result = await handleLanguageSetOverride({ languageCode: 'es' });

      expect(result).toEqual({
        success: true,
        languageCode: 'es',
      });
      expect(mockBrowser.storage.local.set).toHaveBeenCalled();
    });

    it('validates language code is 2 characters', async () => {
      await expect(handleLanguageSetOverride({ languageCode: 'spanish' })).rejects.toThrow();
    });
  });

  describe('handleLanguageClearOverride', () => {
    it('clears language override', async () => {
      // Set an override first
      mockStorage['languagePreference'] = {
        autoDetect: true,
        currentOverride: 'fr',
        voicePreferences: {},
      };

      const result = await handleLanguageClearOverride();

      expect(result).toEqual({ success: true });
      expect(mockBrowser.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('registerLanguageHandlers', () => {
    it('registers all language handlers on registry', () => {
      const mockRegistry = {
        register: jest.fn(),
      };

      registerLanguageHandlers(mockRegistry as never);

      expect(mockRegistry.register).toHaveBeenCalledTimes(5);
      expect(mockRegistry.register).toHaveBeenCalledWith(
        'language.detect',
        expect.any(Function),
        expect.any(String),
      );
      expect(mockRegistry.register).toHaveBeenCalledWith(
        'language.getState',
        expect.any(Function),
        expect.any(String),
      );
      expect(mockRegistry.register).toHaveBeenCalledWith(
        'language.setOverride',
        expect.any(Function),
        expect.any(String),
      );
      expect(mockRegistry.register).toHaveBeenCalledWith(
        'language.clearOverride',
        expect.any(Function),
        expect.any(String),
      );
    });
  });
});
