/**
 * Popup ↔ Background Round-Trip Integration Tests (FR-017)
 *
 * Simulates the full round-trip message flow from popup to background:
 * popup sends {type, ...data} → background dispatches to handler → response returned.
 *
 * Tests cover playback.start, settings.get, provider.select, cache.getStats,
 * export.start; verify request validation, response schema, and error format.
 *
 * @module tests/integration/popup-background
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  HandlerRegistry,
  createHandlerRegistry,
} from '../../src/handlers/registry';
import { Ok, Err } from '../../src/core/shared/result';
import type { Result } from '../../src/core/shared/result';
import { z } from 'zod';

/**
 * Simulates the background.ts dispatchMessage() function:
 * 1. Look up handler in registry
 * 2. If found, execute and return result
 * 3. If not found, fall back to legacy handlers
 * 4. If neither, return unknownMessageResponse
 */
async function simulateDispatch(
  registry: HandlerRegistry,
  legacyHandlers: Record<string, (data: Record<string, unknown>) => Promise<unknown>>,
  type: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  // Try hexagonal handler
  if (registry.has(type)) {
    const result = await registry.dispatch(type, data);

    if (!result.ok) {
      return { success: false, error: result.error.message || String(result.error) };
    }

    // Unwrap inner Result if present
    const handlerResult = result.value as unknown;
    if (
      handlerResult &&
      typeof handlerResult === 'object' &&
      'ok' in handlerResult &&
      typeof (handlerResult as { ok: boolean }).ok === 'boolean'
    ) {
      const inner = handlerResult as { ok: boolean; value?: unknown; error?: unknown };
      if (inner.ok) {
        return inner.value;
      }
      return { success: false, error: String(inner.error) };
    }

    return handlerResult;
  }

  // Try legacy handler
  const handler = legacyHandlers[type];
  if (handler) {
    return handler(data);
  }

  // Unknown message
  return { success: false, error: `Unknown message type: ${type}`, code: 'UNKNOWN_MESSAGE' };
}

describe('Popup ↔ Background Round-Trip Integration', () => {
  let registry: HandlerRegistry;
  const legacyHandlers: Record<string, (data: Record<string, unknown>) => Promise<unknown>> = {};

  // Zod schemas mirroring the real handler schemas
  const playbackStartSchema = z.object({
    paragraphs: z.array(z.string()).optional(),
    tabId: z.number().int().positive().optional(),
  });

  const settingsGetSchema = z.object({}).passthrough();

  const providerSelectSchema = z.object({
    provider: z.enum(['browser', 'elevenlabs', 'openai', 'groq', 'cartesia']),
  });

  const cacheGetStatsSchema = z.object({}).passthrough();

  const exportStartSchema = z.object({
    format: z.enum(['mp3', 'wav']).optional(),
    paragraphs: z.array(z.string()).optional(),
  });

  // Mock state
  let mockSettings: Record<string, unknown>;
  let mockProvider: string;
  let mockCacheStats: { entries: number; totalSize: number; hitRate: number };

  beforeEach(() => {
    registry = createHandlerRegistry();

    // Reset mock state
    mockSettings = {
      provider: 'browser',
      speed: 1.0,
      voice: null,
      cacheEnabled: true,
    };
    mockProvider = 'browser';
    mockCacheStats = { entries: 10, totalSize: 5242880, hitRate: 0.75 };

    // Register handlers that mirror the real handlers' behavior
    registry.register('playback.start', async (params) => {
      const parsed = playbackStartSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      return Ok({
        success: true,
        status: 'playing',
        paragraphCount: parsed.data.paragraphs?.length ?? 0,
      });
    });

    registry.register('settings.get', async (params) => {
      const parsed = settingsGetSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      return Ok(mockSettings);
    });

    registry.register('provider.select', async (params) => {
      const parsed = providerSelectSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      mockProvider = parsed.data.provider;
      return Ok({ success: true, provider: mockProvider });
    });

    registry.register('cache.getStats', async (params) => {
      const parsed = cacheGetStatsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      return Ok(mockCacheStats);
    });

    registry.register('export.start', async (params) => {
      const parsed = exportStartSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      return Ok({
        success: true,
        jobId: 'export-job-123',
        format: parsed.data.format ?? 'mp3',
      });
    });
  });

  afterEach(() => {
    registry.clear();
  });

  // ============================================================================
  // playback.start round-trip
  // ============================================================================

  describe('playback.start round-trip', () => {
    it('should start playback with valid params', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'playback.start', {
        paragraphs: ['Hello world.', 'Second paragraph.'],
        tabId: 1,
      });

      const response = result as { success: boolean; status: string; paragraphCount: number };
      expect(response.success).toBe(true);
      expect(response.status).toBe('playing');
      expect(response.paragraphCount).toBe(2);
    });

    it('should start playback with no params (all optional)', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'playback.start', {});

      const response = result as { success: boolean; status: string };
      expect(response.success).toBe(true);
    });

    it('should reject invalid tabId type', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'playback.start', {
        tabId: 'not-a-number',
      });

      const response = result as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });
  });

  // ============================================================================
  // settings.get round-trip
  // ============================================================================

  describe('settings.get round-trip', () => {
    it('should return current settings', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'settings.get', {});

      const response = result as Record<string, unknown>;
      expect(response.provider).toBe('browser');
      expect(response.speed).toBe(1.0);
      expect(response.cacheEnabled).toBe(true);
    });

    it('should accept empty params', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'settings.get', {});

      expect(result).toBeTruthy();
    });
  });

  // ============================================================================
  // provider.select round-trip
  // ============================================================================

  describe('provider.select round-trip', () => {
    it('should select a valid provider', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'provider.select', {
        provider: 'elevenlabs',
      });

      const response = result as { success: boolean; provider: string };
      expect(response.success).toBe(true);
      expect(response.provider).toBe('elevenlabs');
      expect(mockProvider).toBe('elevenlabs');
    });

    it('should reject an invalid provider', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'provider.select', {
        provider: 'invalid-provider',
      });

      const response = result as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });

    it('should reject missing provider param', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'provider.select', {});

      const response = result as { success: boolean; error: string };
      expect(response.success).toBe(false);
    });

    it.each(['browser', 'elevenlabs', 'openai', 'groq', 'cartesia'] as const)(
      'should accept provider "%s"',
      async (provider) => {
        const result = await simulateDispatch(registry, legacyHandlers, 'provider.select', {
          provider,
        });

        const response = result as { success: boolean; provider: string };
        expect(response.success).toBe(true);
        expect(response.provider).toBe(provider);
      },
    );
  });

  // ============================================================================
  // cache.getStats round-trip
  // ============================================================================

  describe('cache.getStats round-trip', () => {
    it('should return cache statistics', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'cache.getStats', {});

      const response = result as { entries: number; totalSize: number; hitRate: number };
      expect(response.entries).toBe(10);
      expect(response.totalSize).toBe(5242880);
      expect(response.hitRate).toBe(0.75);
    });
  });

  // ============================================================================
  // export.start round-trip
  // ============================================================================

  describe('export.start round-trip', () => {
    it('should start export with default format', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'export.start', {});

      const response = result as { success: boolean; jobId: string; format: string };
      expect(response.success).toBe(true);
      expect(response.jobId).toBeTruthy();
      expect(response.format).toBe('mp3');
    });

    it('should start export with specified format', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'export.start', {
        format: 'wav',
      });

      const response = result as { success: boolean; format: string };
      expect(response.success).toBe(true);
      expect(response.format).toBe('wav');
    });

    it('should reject invalid format', async () => {
      const result = await simulateDispatch(registry, legacyHandlers, 'export.start', {
        format: 'ogg', // not in enum
      });

      const response = result as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });
  });

  // ============================================================================
  // Request Validation
  // ============================================================================

  describe('request validation', () => {
    it('should validate params via Zod before handler execution', async () => {
      let handlerCalled = false;

      // Register a handler with strict validation
      const strictSchema = z.object({
        required: z.string(),
      });

      registry.register('test.strict', async (params) => {
        const parsed = strictSchema.safeParse(params);
        if (!parsed.success) {
          return Err({
            type: 'invalid_params',
            message: parsed.error.issues.map((i) => i.message).join('; '),
          });
        }
        handlerCalled = true;
        return Ok({ ok: true });
      });

      // Send invalid params
      await simulateDispatch(registry, legacyHandlers, 'test.strict', {});

      // Handler was called but returned validation error before doing work
      // (Zod validation happens inside the handler)
      expect(handlerCalled).toBe(false);
    });
  });

  // ============================================================================
  // Response Schema
  // ============================================================================

  describe('response schema', () => {
    it('should return structured error for unknown message', async () => {
      const result = await simulateDispatch(
        registry,
        legacyHandlers,
        'completely.unknown',
        {},
      );

      const response = result as { success: boolean; error: string; code: string };
      expect(response.success).toBe(false);
      expect(response.error).toContain('Unknown message type');
      expect(response.code).toBe('UNKNOWN_MESSAGE');
    });

    it('should return unwrapped value for successful Result', async () => {
      registry.register('test.result', async () => {
        return Ok({ data: [1, 2, 3], total: 3 });
      });

      const result = await simulateDispatch(registry, legacyHandlers, 'test.result', {});

      const response = result as { data: number[]; total: number };
      expect(response.data).toEqual([1, 2, 3]);
      expect(response.total).toBe(3);
    });
  });

  // ============================================================================
  // Error Format
  // ============================================================================

  describe('error format', () => {
    it('should return { success: false, error: string } for handler errors', async () => {
      registry.register('test.error', async () => {
        return Err({ type: 'not_found', message: 'Item not found' });
      });

      const result = await simulateDispatch(registry, legacyHandlers, 'test.error', {});

      const response = result as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(typeof response.error).toBe('string');
    });

    it('should return { success: false, error: string } for thrown errors', async () => {
      registry.register('test.crash', async () => {
        throw new Error('Handler crashed');
      });

      const result = await simulateDispatch(registry, legacyHandlers, 'test.crash', {});

      const response = result as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
    });
  });

  // ============================================================================
  // Legacy Fallback
  // ============================================================================

  describe('legacy fallback', () => {
    it('should fall back to legacy handlers when not in registry', async () => {
      legacyHandlers['getLogs'] = async () => ({
        success: true,
        logs: [],
        status: { bufferCount: 0, bufferBytes: 0 },
      });

      const result = await simulateDispatch(registry, legacyHandlers, 'getLogs', {});

      const response = result as { success: boolean; logs: unknown[] };
      expect(response.success).toBe(true);
      expect(response.logs).toEqual([]);

      // Clean up
      delete legacyHandlers['getLogs'];
    });

    it('should prefer hexagonal handler over legacy', async () => {
      registry.register('settings.get', async () => {
        return Ok({ source: 'hexagonal' });
      });

      legacyHandlers['settings.get'] = async () => ({
        source: 'legacy',
      });

      const result = await simulateDispatch(registry, legacyHandlers, 'settings.get', {});

      const response = result as { source: string };
      expect(response.source).toBe('hexagonal');

      // Clean up
      delete legacyHandlers['settings.get'];
    });
  });
});
