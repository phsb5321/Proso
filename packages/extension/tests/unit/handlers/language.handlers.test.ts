// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.

/**
 * Unit tests for language message handlers.
 *
 * Tests all four language handlers registered via registerLanguageHandlers:
 *   - language.detect
 *   - language.getState
 *   - language.setOverride
 *   - language.clearOverride
 *
 * @module tests/unit/handlers/language.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const {
  registerLanguageHandlers,
  setLanguageDependencies,
  clearLanguageState,
  tabLanguageStates,
} = await import('../../../src/handlers/language.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function dispatchOk(
  registry: InstanceType<typeof HandlerRegistry>,
  name: string,
  params: unknown,
): Promise<unknown> {
  const outer = await registry.dispatch(name, params);
  expect(outer.ok).toBe(true);
  if (!outer.ok) throw new Error('dispatch failed unexpectedly');
  return outer.value;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('language.handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerLanguageHandlers(registry);
    clearLanguageState();
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all four language handlers', () => {
      expect(registry.has('language.detect')).toBe(true);
      expect(registry.has('language.getState')).toBe(true);
      expect(registry.has('language.setOverride')).toBe(true);
      expect(registry.has('language.clearOverride')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // language.detect
  // -----------------------------------------------------------------------

  describe('language.detect', () => {
    it('should detect language from metadata', async () => {
      const result = (await dispatchOk(registry, 'language.detect', {
        metadata: 'fr',
      })) as {
        code: string;
        confidence: number;
        source: string;
        isReliable: boolean;
      };

      expect(result.code).toBe('fr');
      expect(result.confidence).toBe(0.9);
      expect(result.source).toBe('metadata');
      expect(result.isReliable).toBe(true);
    });

    it('should detect language from text sample using franc', async () => {
      setLanguageDependencies({
        detectLanguage: jest.fn<(text: string) => string>().mockReturnValue('spa'),
      });

      const result = (await dispatchOk(registry, 'language.detect', {
        textSample: 'Este es un texto de prueba suficientemente largo para la detección.',
      })) as {
        code: string;
        source: string;
        isReliable: boolean;
      };

      expect(result.code).toBe('spa');
      expect(result.source).toBe('detection');
    });

    it('should default to English when text is too short', async () => {
      const result = (await dispatchOk(registry, 'language.detect', {
        textSample: 'Hi',
      })) as {
        code: string;
        source: string;
        isReliable: boolean;
      };

      expect(result.code).toBe('en');
      expect(result.source).toBe('default');
      expect(result.isReliable).toBe(false);
    });

    it('should default to English when no params provided', async () => {
      const result = (await dispatchOk(registry, 'language.detect', {})) as {
        code: string;
        source: string;
      };

      expect(result.code).toBe('en');
      expect(result.source).toBe('default');
    });

    it('should default to English when franc returns und', async () => {
      setLanguageDependencies({
        detectLanguage: jest.fn<(text: string) => string>().mockReturnValue('und'),
      });

      const result = (await dispatchOk(registry, 'language.detect', {
        textSample: 'Some ambiguous text that is long enough for detection to try.',
      })) as {
        code: string;
        source: string;
      };

      expect(result.code).toBe('en');
      expect(result.source).toBe('default');
    });

    it('should default to English when no dependencies set', async () => {
      // Do NOT call setLanguageDependencies — dependencies stays null
      setLanguageDependencies(null as unknown as { detectLanguage: (text: string) => string });

      const result = (await dispatchOk(registry, 'language.detect', {
        textSample: 'Some text that is long enough for detection to be attempted.',
      })) as {
        code: string;
        source: string;
      };

      // Without franc dependency, falls through to default
      expect(result.code).toBe('en');
      expect(result.source).toBe('default');
    });

    it('should prefer metadata over text sample', async () => {
      setLanguageDependencies({
        detectLanguage: jest.fn<(text: string) => string>().mockReturnValue('deu'),
      });

      const result = (await dispatchOk(registry, 'language.detect', {
        metadata: 'ja',
        textSample: 'Some German text that is long enough for detection to work.',
      })) as {
        code: string;
        source: string;
      };

      expect(result.code).toBe('ja');
      expect(result.source).toBe('metadata');
    });
  });

  // -----------------------------------------------------------------------
  // language.getState
  // -----------------------------------------------------------------------

  describe('language.getState', () => {
    it('should return default state with no override', async () => {
      const result = (await dispatchOk(registry, 'language.getState', {})) as {
        detected: unknown;
        override: string | null;
        effective: string;
        autoDetect: boolean;
      };

      expect(result.detected).toBeNull();
      expect(result.override).toBeNull();
      expect(result.effective).toBe('en');
      expect(result.autoDetect).toBe(true);
    });

    it('should reflect override after setting one', async () => {
      await dispatchOk(registry, 'language.setOverride', {
        languageCode: 'fr',
      });

      const result = (await dispatchOk(registry, 'language.getState', {})) as {
        override: string | null;
        effective: string;
        autoDetect: boolean;
      };

      expect(result.override).toBe('fr');
      expect(result.effective).toBe('fr');
      expect(result.autoDetect).toBe(false);
    });

    it('should return auto-detect after clearing override', async () => {
      await dispatchOk(registry, 'language.setOverride', {
        languageCode: 'de',
      });
      await dispatchOk(registry, 'language.clearOverride', {});

      const result = (await dispatchOk(registry, 'language.getState', {})) as {
        override: string | null;
        autoDetect: boolean;
      };

      expect(result.override).toBeNull();
      expect(result.autoDetect).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // language.setOverride
  // -----------------------------------------------------------------------

  describe('language.setOverride', () => {
    it('should set language override successfully', async () => {
      const result = (await dispatchOk(registry, 'language.setOverride', {
        languageCode: 'es',
      })) as { success: boolean; languageCode: string };

      expect(result.success).toBe(true);
      expect(result.languageCode).toBe('es');
    });

    it('should normalize language code to lowercase', async () => {
      const result = (await dispatchOk(registry, 'language.setOverride', {
        languageCode: 'FR',
      })) as { success: boolean; languageCode: string };

      expect(result.success).toBe(true);
      expect(result.languageCode).toBe('fr');
    });

    it('should truncate long language codes to 2 chars', async () => {
      const result = (await dispatchOk(registry, 'language.setOverride', {
        languageCode: 'eng',
      })) as { success: boolean; languageCode: string };

      expect(result.success).toBe(true);
      expect(result.languageCode).toBe('en');
    });

    it('should reject empty language code', async () => {
      const result = (await dispatchOk(registry, 'language.setOverride', {
        languageCode: '',
      })) as { success: boolean };

      expect(result.success).toBe(false);
    });

    it('should reject missing language code', async () => {
      const result = (await dispatchOk(registry, 'language.setOverride', {})) as {
        success: boolean;
      };

      expect(result.success).toBe(false);
    });

    it('should reject too-short language code', async () => {
      const result = (await dispatchOk(registry, 'language.setOverride', {
        languageCode: 'a',
      })) as { success: boolean };

      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // language.clearOverride
  // -----------------------------------------------------------------------

  describe('language.clearOverride', () => {
    it('should clear override successfully', async () => {
      // Set an override first
      await dispatchOk(registry, 'language.setOverride', {
        languageCode: 'ja',
      });

      const result = (await dispatchOk(
        registry,
        'language.clearOverride',
        {},
      )) as { success: boolean };

      expect(result.success).toBe(true);
    });

    it('should succeed even when no override is set', async () => {
      const result = (await dispatchOk(
        registry,
        'language.clearOverride',
        {},
      )) as { success: boolean };

      expect(result.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // T023: Integration — per-tab language state tracking via __tabId
  // -----------------------------------------------------------------------

  describe('per-tab language state (T022/T023)', () => {
    it('should populate tabLanguageStates when __tabId is provided (metadata path)', async () => {
      const result = (await dispatchOk(registry, 'language.detect', {
        metadata: 'es',
        __tabId: 42,
      })) as { code: string; source: string };

      expect(result.code).toBe('es');
      expect(result.source).toBe('metadata');
      expect(tabLanguageStates.has(42)).toBe(true);
      expect(tabLanguageStates.get(42)?.detected?.code).toBe('es');
    });

    it('should populate tabLanguageStates when __tabId is provided (detection path)', async () => {
      setLanguageDependencies({
        detectLanguage: jest.fn<(text: string) => string>().mockReturnValue('por'),
      });

      const result = (await dispatchOk(registry, 'language.detect', {
        textSample: 'Este é um texto em português suficientemente longo para detecção.',
        __tabId: 99,
      })) as { code: string; source: string };

      expect(result.code).toBe('por');
      expect(result.source).toBe('detection');
      expect(tabLanguageStates.has(99)).toBe(true);
      expect(tabLanguageStates.get(99)?.detected?.code).toBe('por');
    });

    it('should populate tabLanguageStates on default fallback path', async () => {
      const result = (await dispatchOk(registry, 'language.detect', {
        __tabId: 7,
      })) as { code: string; source: string };

      expect(result.code).toBe('en');
      expect(result.source).toBe('default');
      expect(tabLanguageStates.has(7)).toBe(true);
      expect(tabLanguageStates.get(7)?.detected?.code).toBe('en');
    });

    it('should NOT populate tabLanguageStates when __tabId is missing', async () => {
      await dispatchOk(registry, 'language.detect', {
        metadata: 'fr',
      });

      // No tabId = no state stored
      expect(tabLanguageStates.size).toBe(0);
    });

    it('should preserve existing override when detecting language for a tab', async () => {
      // Set override first via global
      await dispatchOk(registry, 'language.setOverride', { languageCode: 'ja' });

      // Detect for a specific tab — the tab should get detected state
      await dispatchOk(registry, 'language.detect', {
        metadata: 'de',
        __tabId: 55,
      });

      expect(tabLanguageStates.get(55)?.detected?.code).toBe('de');
      // Override is null per-tab (global override is separate)
      expect(tabLanguageStates.get(55)?.override).toBeNull();
    });

    it('should allow getState to read per-tab detected language', async () => {
      // Detect Spanish for tab 10
      await dispatchOk(registry, 'language.detect', {
        metadata: 'es',
        __tabId: 10,
      });

      // Get state for tab 10
      const state = (await dispatchOk(registry, 'language.getState', {
        tabId: 10,
      })) as { detected: { code: string } | null; effective: string };

      expect(state.detected?.code).toBe('es');
      expect(state.effective).toBe('es');
    });
  });
});
