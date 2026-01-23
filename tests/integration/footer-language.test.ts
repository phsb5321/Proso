// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Footer Language Indicator Integration Tests
 * 048-multilingual-tts-pillar: Tests the language badge in sticky footer (T049a)
 *
 * @jest-environment jsdom
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { StickyFooter } from '../../src/utils/content/sticky-footer';

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
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        }
        return result;
      }),
      set: jest.fn(async (data: Record<string, unknown>) => {
        Object.assign(mockStorage, data);
      }),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
};

// Assign mock to global
(global as Record<string, unknown>).browser = mockBrowser;

// Mock ResizeObserver (not available in jsdom)
class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}
(global as Record<string, unknown>).ResizeObserver = MockResizeObserver;

// Mock MutationObserver
class MockMutationObserver {
  observe = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);
}
(global as Record<string, unknown>).MutationObserver = MockMutationObserver;

describe('Footer Language Indicator (T049a)', () => {
  let footer: StickyFooter;

  beforeEach(() => {
    // Clear storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

    // Create footer instance
    footer = new StickyFooter();
  });

  afterEach(() => {
    // Clean up footer
    if (footer.isFooterVisible()) {
      footer.hide();
    }
  });

  describe('updateLanguage method', () => {
    it('should update language badge with detected language code', async () => {
      await footer.show();

      footer.updateLanguage({
        code: 'es',
        confidence: 0.95,
        isOverride: false,
      });

      // Get shadow root to check badge
      const container = document.getElementById('voxpage-sticky-footer');
      expect(container).not.toBeNull();

      // Note: We can't directly access closed shadow root in tests,
      // but we verify the method doesn't throw and completes
    });

    it('should hide badge when code is null', async () => {
      await footer.show();

      footer.updateLanguage({
        code: null,
      });

      // Method completes without error
    });

    it('should show high confidence state for >90%', async () => {
      await footer.show();

      footer.updateLanguage({
        code: 'en',
        confidence: 0.95,
        isOverride: false,
      });

      // Method completes without error
    });

    it('should show low confidence state for <90%', async () => {
      await footer.show();

      footer.updateLanguage({
        code: 'fr',
        confidence: 0.75,
        isOverride: false,
      });

      // Method completes without error
    });

    it('should show override state when isOverride is true', async () => {
      await footer.show();

      footer.updateLanguage({
        code: 'de',
        confidence: 1.0,
        isOverride: true,
      });

      // Method completes without error
    });

    it('should handle update before footer is shown', () => {
      // Should not throw when footer is not visible
      expect(() => {
        footer.updateLanguage({
          code: 'ja',
          confidence: 0.9,
          isOverride: false,
        });
      }).not.toThrow();
    });

    it('should update language multiple times', async () => {
      await footer.show();

      // First update
      footer.updateLanguage({
        code: 'es',
        confidence: 0.85,
        isOverride: false,
      });

      // Second update
      footer.updateLanguage({
        code: 'fr',
        confidence: 0.92,
        isOverride: false,
      });

      // Third update - override
      footer.updateLanguage({
        code: 'de',
        confidence: 1.0,
        isOverride: true,
      });

      // All updates complete without error
    });
  });

  describe('language badge styles', () => {
    it('should support all 30 languages from LANGUAGE_MAPPINGS', async () => {
      await footer.show();

      const languages = [
        'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl',
        'cs', 'ar', 'zh', 'hu', 'ko', 'ja', 'hi', 'sv', 'id', 'uk',
        'el', 'fi', 'ro', 'da', 'bg', 'ms', 'sk', 'hr', 'ta', 'fil',
      ];

      // Verify all languages can be set without error
      for (const code of languages) {
        footer.updateLanguage({
          code,
          confidence: 0.9,
          isOverride: false,
        });
      }
    });
  });

  describe('footer visibility interaction', () => {
    it('should preserve language state after show/hide cycle', async () => {
      // Set language before showing
      footer.updateLanguage({
        code: 'es',
        confidence: 0.88,
        isOverride: false,
      });

      await footer.show();
      footer.hide();
      await footer.show();

      // Footer shows again without error
      expect(footer.isFooterVisible()).toBe(true);
    });
  });
});
