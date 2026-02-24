// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * Unit tests for logging message handlers.
 *
 * Tests all three logging handlers registered via registerLoggingHandlers:
 *   - logging.logRemote
 *   - logging.flushBuffer
 *   - logging.getState
 *
 * @module tests/unit/handlers/logging.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Dynamic imports
// ---------------------------------------------------------------------------

const {
  registerLoggingHandlers,
  setLoggingDependencies,
} = await import('../../../src/handlers/logging.handlers');
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

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function createMockDependencies() {
  return {
    addToBuffer: jest.fn<
      (entry: {
        level: LogLevel;
        message: string;
        component: string;
        metadata?: Record<string, unknown>;
        timestamp: number;
      }) => void
    >(),
    flushBuffer: jest.fn<() => Promise<number>>(),
    getBufferSize: jest.fn<() => number>(),
    isEnabled: jest.fn<() => boolean>(),
    getLastFlushAttempt: jest.fn<() => number>(),
    getConsecutiveFailures: jest.fn<() => number>(),
    isCircuitBreakerOpen: jest.fn<() => boolean>(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('logging.handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;
  let mockDeps: ReturnType<typeof createMockDependencies>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerLoggingHandlers(registry);
    mockDeps = createMockDependencies();
    mockDeps.isEnabled.mockReturnValue(true);
    setLoggingDependencies(mockDeps);
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all three logging handlers', () => {
      expect(registry.has('logging.logRemote')).toBe(true);
      expect(registry.has('logging.flushBuffer')).toBe(true);
      expect(registry.has('logging.getState')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // logging.logRemote
  // -----------------------------------------------------------------------

  describe('logging.logRemote', () => {
    it('should buffer a valid log message', async () => {
      const result = (await dispatchOk(registry, 'logging.logRemote', {
        level: 'info',
        message: 'Test log message',
        component: 'handler',
      })) as { success: boolean; buffered: boolean };

      expect(result.success).toBe(true);
      expect(result.buffered).toBe(true);
      expect(mockDeps.addToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Test log message',
          component: 'handler',
        }),
      );
    });

    it('should include metadata when provided', async () => {
      await dispatchOk(registry, 'logging.logRemote', {
        level: 'warn',
        message: 'Warning message',
        component: 'adapter',
        metadata: { key: 'value' },
      });

      expect(mockDeps.addToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { key: 'value' },
        }),
      );
    });

    it('should use default component when not provided', async () => {
      await dispatchOk(registry, 'logging.logRemote', {
        level: 'error',
        message: 'Error message',
      });

      expect(mockDeps.addToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          component: 'unknown',
        }),
      );
    });

    it('should reject empty message', async () => {
      const result = (await dispatchOk(registry, 'logging.logRemote', {
        level: 'info',
        message: '',
      })) as { success: boolean; buffered: boolean };

      expect(result.success).toBe(false);
      expect(result.buffered).toBe(false);
      expect(mockDeps.addToBuffer).not.toHaveBeenCalled();
    });

    it('should reject missing message', async () => {
      const result = (await dispatchOk(registry, 'logging.logRemote', {
        level: 'info',
      })) as { success: boolean; buffered: boolean };

      expect(result.success).toBe(false);
      expect(result.buffered).toBe(false);
    });

    it('should reject invalid log level', async () => {
      const result = (await dispatchOk(registry, 'logging.logRemote', {
        level: 'trace',
        message: 'Message',
      })) as { success: boolean; buffered: boolean };

      expect(result.success).toBe(false);
      expect(result.buffered).toBe(false);
    });

    it('should reject missing log level', async () => {
      const result = (await dispatchOk(registry, 'logging.logRemote', {
        message: 'Message',
      })) as { success: boolean; buffered: boolean };

      expect(result.success).toBe(false);
      expect(result.buffered).toBe(false);
    });

    it('should accept but not buffer when logging is disabled', async () => {
      mockDeps.isEnabled.mockReturnValue(false);

      const result = (await dispatchOk(registry, 'logging.logRemote', {
        level: 'info',
        message: 'Should not be buffered',
      })) as { success: boolean; buffered: boolean };

      expect(result.success).toBe(true);
      expect(result.buffered).toBe(false);
      expect(mockDeps.addToBuffer).not.toHaveBeenCalled();
    });

    it('should return success:true/buffered:false when no dependencies set', async () => {
      setLoggingDependencies(null as unknown as ReturnType<typeof createMockDependencies>);

      const result = (await dispatchOk(registry, 'logging.logRemote', {
        level: 'info',
        message: 'No deps message',
      })) as { success: boolean; buffered: boolean };

      expect(result.success).toBe(true);
      expect(result.buffered).toBe(false);
    });

    it('should truncate long messages to 10000 chars', async () => {
      const longMessage = 'x'.repeat(20000);

      await dispatchOk(registry, 'logging.logRemote', {
        level: 'debug',
        message: longMessage,
      });

      const call = mockDeps.addToBuffer.mock.calls[0][0];
      expect(call.message.length).toBe(10000);
    });

    it('should include timestamp in buffered entry', async () => {
      const before = Date.now();

      await dispatchOk(registry, 'logging.logRemote', {
        level: 'info',
        message: 'Timestamped',
      });

      const after = Date.now();
      const call = mockDeps.addToBuffer.mock.calls[0][0];
      expect(call.timestamp).toBeGreaterThanOrEqual(before);
      expect(call.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle all valid log levels', async () => {
      for (const level of ['debug', 'info', 'warn', 'error'] as const) {
        jest.clearAllMocks();
        mockDeps.isEnabled.mockReturnValue(true);

        const result = (await dispatchOk(registry, 'logging.logRemote', {
          level,
          message: `Test ${level}`,
        })) as { success: boolean; buffered: boolean };

        expect(result.success).toBe(true);
        expect(result.buffered).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // logging.flushBuffer
  // -----------------------------------------------------------------------

  describe('logging.flushBuffer', () => {
    it('should flush buffer and return count', async () => {
      mockDeps.flushBuffer.mockResolvedValue(5);

      const result = (await dispatchOk(registry, 'logging.flushBuffer', {})) as {
        success: boolean;
        flushedCount: number;
      };

      expect(result.success).toBe(true);
      expect(result.flushedCount).toBe(5);
      expect(mockDeps.flushBuffer).toHaveBeenCalled();
    });

    it('should return 0 when buffer is empty', async () => {
      mockDeps.flushBuffer.mockResolvedValue(0);

      const result = (await dispatchOk(registry, 'logging.flushBuffer', {})) as {
        success: boolean;
        flushedCount: number;
      };

      expect(result.success).toBe(true);
      expect(result.flushedCount).toBe(0);
    });

    it('should handle flush failure', async () => {
      mockDeps.flushBuffer.mockRejectedValue(new Error('Network error'));

      const result = (await dispatchOk(registry, 'logging.flushBuffer', {})) as {
        success: boolean;
        flushedCount: number;
      };

      expect(result.success).toBe(false);
      expect(result.flushedCount).toBe(0);
    });

    it('should return success with 0 when no dependencies set', async () => {
      setLoggingDependencies(null as unknown as ReturnType<typeof createMockDependencies>);

      const result = (await dispatchOk(registry, 'logging.flushBuffer', {})) as {
        success: boolean;
        flushedCount: number;
      };

      expect(result.success).toBe(true);
      expect(result.flushedCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // logging.getState
  // -----------------------------------------------------------------------

  describe('logging.getState', () => {
    it('should return current logging state', async () => {
      mockDeps.isEnabled.mockReturnValue(true);
      mockDeps.getBufferSize.mockReturnValue(42);
      mockDeps.getLastFlushAttempt.mockReturnValue(1700000000000);
      mockDeps.getConsecutiveFailures.mockReturnValue(2);
      mockDeps.isCircuitBreakerOpen.mockReturnValue(false);

      const result = (await dispatchOk(registry, 'logging.getState', {})) as {
        enabled: boolean;
        bufferSize: number;
        lastFlushAttempt: number;
        consecutiveFailures: number;
        circuitBreakerOpen: boolean;
      };

      expect(result.enabled).toBe(true);
      expect(result.bufferSize).toBe(42);
      expect(result.lastFlushAttempt).toBe(1700000000000);
      expect(result.consecutiveFailures).toBe(2);
      expect(result.circuitBreakerOpen).toBe(false);
    });

    it('should return disabled state when no dependencies set', async () => {
      setLoggingDependencies(null as unknown as ReturnType<typeof createMockDependencies>);

      const result = (await dispatchOk(registry, 'logging.getState', {})) as {
        enabled: boolean;
        bufferSize: number;
        consecutiveFailures: number;
        circuitBreakerOpen: boolean;
      };

      expect(result.enabled).toBe(false);
      expect(result.bufferSize).toBe(0);
      expect(result.consecutiveFailures).toBe(0);
      expect(result.circuitBreakerOpen).toBe(false);
    });

    it('should show circuit breaker open state', async () => {
      mockDeps.isEnabled.mockReturnValue(true);
      mockDeps.getBufferSize.mockReturnValue(100);
      mockDeps.getConsecutiveFailures.mockReturnValue(5);
      mockDeps.isCircuitBreakerOpen.mockReturnValue(true);
      mockDeps.getLastFlushAttempt.mockReturnValue(0);

      const result = (await dispatchOk(registry, 'logging.getState', {})) as {
        circuitBreakerOpen: boolean;
        consecutiveFailures: number;
      };

      expect(result.circuitBreakerOpen).toBe(true);
      expect(result.consecutiveFailures).toBe(5);
    });
  });
});
