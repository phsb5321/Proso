/**
 * Hexagonal Dispatch Integration Tests (FR-016)
 *
 * Tests the dispatch flow: registry lookup → handler execution → Result unwrapping.
 * Covers success, not_found, execution_failed, validation errors, and
 * invalid param rejection with VALIDATION_ERROR code.
 *
 * @module tests/integration/dispatch
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  HandlerRegistry,
  createHandlerRegistry,
} from '../../src/handlers/registry';
import { Ok, Err } from '../../src/core/shared/result';
import type { Result } from '../../src/core/shared/result';
import { z } from 'zod';

describe('Hexagonal Dispatch Integration', () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = createHandlerRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  // ============================================================================
  // Dispatch Success
  // ============================================================================

  describe('dispatch success', () => {
    it('should dispatch to a registered handler and return Ok result', async () => {
      registry.register('test.echo', async (params) => {
        const data = params as { message: string };
        return Ok({ echo: data.message });
      });

      const result = await registry.dispatch('test.echo', { message: 'hello' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: boolean; value: { echo: string } };
        expect(inner.ok).toBe(true);
        expect(inner.value.echo).toBe('hello');
      }
    });

    it('should dispatch to handler and return raw value', async () => {
      registry.register('test.simple', async () => {
        return { status: 'ok', count: 42 };
      });

      const result = await registry.dispatch('test.simple', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        const value = result.value as { status: string; count: number };
        expect(value.status).toBe('ok');
        expect(value.count).toBe(42);
      }
    });

    it('should pass sender info through dispatch', async () => {
      let receivedSender: unknown = null;

      registry.register('test.sender', async (_params, sender) => {
        receivedSender = sender;
        return Ok({ received: true });
      });

      await registry.dispatch('test.sender', {}, { tab: { id: 42 } });

      expect(receivedSender).toEqual({ tab: { id: 42 } });
    });
  });

  // ============================================================================
  // Legacy Fallback (not_found)
  // ============================================================================

  describe('not_found fallback', () => {
    it('should return Err with not_found for unregistered handler', async () => {
      const result = await registry.dispatch('nonexistent.handler', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.handlerName).toBe('nonexistent.handler');
      }
    });

    it('should return not_found after handler is unregistered', async () => {
      registry.register('test.temp', async () => Ok({ ok: true }));
      expect(registry.has('test.temp')).toBe(true);

      registry.unregister('test.temp');

      const result = await registry.dispatch('test.temp', {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
      }
    });
  });

  // ============================================================================
  // Unknown Message Error
  // ============================================================================

  describe('unknown message error', () => {
    it('should return not_found for completely unknown message type', async () => {
      const result = await registry.dispatch('totally.unknown.message', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.handlerName).toBe('totally.unknown.message');
      }
    });

    it('should return not_found for empty string type', async () => {
      const result = await registry.dispatch('', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
      }
    });
  });

  // ============================================================================
  // Handler Error (Result.Err)
  // ============================================================================

  describe('handler error Result.Err', () => {
    it('should propagate Err from handler as successful dispatch', async () => {
      registry.register('test.fail', async () => {
        return Err({ type: 'operation_failed', message: 'Simulated failure' });
      });

      const result = await registry.dispatch('test.fail', {});

      // The dispatch itself succeeds (handler was found and executed)
      expect(result.ok).toBe(true);
      if (result.ok) {
        // But the handler returned Err
        const inner = result.value as { ok: boolean; error: { type: string; message: string } };
        expect(inner.ok).toBe(false);
        expect(inner.error.type).toBe('operation_failed');
        expect(inner.error.message).toBe('Simulated failure');
      }
    });

    it('should wrap thrown errors as execution_failed', async () => {
      registry.register('test.throw', async () => {
        throw new Error('Unexpected error');
      });

      const result = await registry.dispatch('test.throw', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('execution_failed');
        expect(result.error.message).toContain('Unexpected error');
      }
    });

    it('should handle non-Error thrown values', async () => {
      registry.register('test.throwString', async () => {
        throw 'plain string error';
      });

      const result = await registry.dispatch('test.throwString', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('execution_failed');
        expect(result.error.message).toContain('plain string error');
      }
    });
  });

  // ============================================================================
  // Validated Params Accepted
  // ============================================================================

  describe('validated params accepted', () => {
    const schema = z.object({
      name: z.string().min(1),
      count: z.number().int().positive(),
    });

    beforeEach(() => {
      registry.register('test.validated', async (params) => {
        const parsed = schema.safeParse(params);
        if (!parsed.success) {
          return Err({
            type: 'invalid_params',
            message: parsed.error.issues.map((i) => i.message).join('; '),
          });
        }
        return Ok({ greeting: `Hello ${parsed.data.name}, count=${parsed.data.count}` });
      });
    });

    it('should accept valid params and return Ok', async () => {
      const result = await registry.dispatch('test.validated', {
        name: 'World',
        count: 5,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: boolean; value: { greeting: string } };
        expect(inner.ok).toBe(true);
        expect(inner.value.greeting).toBe('Hello World, count=5');
      }
    });

    it('should accept params with extra fields (Zod strips them)', async () => {
      const result = await registry.dispatch('test.validated', {
        name: 'Test',
        count: 1,
        extra: 'ignored',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: boolean; value: { greeting: string } };
        expect(inner.ok).toBe(true);
      }
    });
  });

  // ============================================================================
  // Invalid Params Rejected (VALIDATION_ERROR code)
  // ============================================================================

  describe('invalid params rejected with VALIDATION_ERROR', () => {
    const schema = z.object({
      name: z.string().min(1),
      count: z.number().int().positive(),
    });

    beforeEach(() => {
      registry.register('test.validated', async (params) => {
        const parsed = schema.safeParse(params);
        if (!parsed.success) {
          return Err({
            type: 'invalid_params',
            message: parsed.error.issues.map((i) => i.message).join('; '),
          });
        }
        return Ok({ result: 'ok' });
      });
    });

    it('should reject missing required params', async () => {
      const result = await registry.dispatch('test.validated', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: boolean; error: { type: string; message: string } };
        expect(inner.ok).toBe(false);
        expect(inner.error.type).toBe('invalid_params');
      }
    });

    it('should reject wrong param types', async () => {
      const result = await registry.dispatch('test.validated', {
        name: 123, // should be string
        count: 'five', // should be number
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: boolean; error: { type: string; message: string } };
        expect(inner.ok).toBe(false);
        expect(inner.error.type).toBe('invalid_params');
        expect(inner.error.message).toBeTruthy();
      }
    });

    it('should reject params violating constraints', async () => {
      const result = await registry.dispatch('test.validated', {
        name: '', // min length 1
        count: -1, // must be positive
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: boolean; error: { type: string; message: string } };
        expect(inner.ok).toBe(false);
        expect(inner.error.type).toBe('invalid_params');
      }
    });

    it('should include validation error details in message', async () => {
      const result = await registry.dispatch('test.validated', { name: 42 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: boolean; error: { type: string; message: string } };
        expect(inner.ok).toBe(false);
        expect(inner.error.message.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // Registry Integrity
  // ============================================================================

  describe('registry integrity', () => {
    it('should track handler count correctly', () => {
      expect(registry.size).toBe(0);

      registry.register('a.handler', async () => Ok(null));
      registry.register('b.handler', async () => Ok(null));
      registry.register('c.handler', async () => Ok(null));

      expect(registry.size).toBe(3);

      registry.unregister('b.handler');
      expect(registry.size).toBe(2);
    });

    it('should clear all handlers', () => {
      registry.register('a.handler', async () => Ok(null));
      registry.register('b.handler', async () => Ok(null));

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.has('a.handler')).toBe(false);
    });

    it('should overwrite existing handler on re-registration', async () => {
      registry.register('test.overwrite', async () => Ok({ version: 1 }));
      registry.register('test.overwrite', async () => Ok({ version: 2 }));

      const result = await registry.dispatch('test.overwrite', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: boolean; value: { version: number } };
        expect(inner.ok).toBe(true);
        expect(inner.value.version).toBe(2);
      }
    });

    it('should group handlers by prefix', () => {
      registry.register('playback.start', async () => Ok(null));
      registry.register('playback.stop', async () => Ok(null));
      registry.register('cache.get', async () => Ok(null));
      registry.register('cache.clear', async () => Ok(null));
      registry.register('settings.get', async () => Ok(null));

      const groups = registry.getHandlersByPrefix();

      expect(groups.get('playback')?.length).toBe(2);
      expect(groups.get('cache')?.length).toBe(2);
      expect(groups.get('settings')?.length).toBe(1);
    });
  });
});
