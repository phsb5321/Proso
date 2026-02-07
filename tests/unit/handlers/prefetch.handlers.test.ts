/**
 * Prefetch Handlers Unit Tests
 *
 * Tests for the prefetch message handlers (prefetch.start, prefetch.stop,
 * prefetch.getStatus, prefetch.clearBuffer) registered via the HandlerRegistry.
 *
 * Uses jest.unstable_mockModule for ESM-compatible mocking of the playback module.
 *
 * @module tests/unit/handlers/prefetch.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Result } from '../../../src/core/shared/result';
import type {
  PrefetchHandlerError,
  PrefetchStartResponse,
  PrefetchStopResponse,
  PrefetchStatusResponse,
  PrefetchClearBufferResponse,
} from '../../../src/handlers/prefetch.handlers';
import type { HandlerError } from '../../../src/handlers/registry';

// ---------------------------------------------------------------------------
// Mock setup – must happen before dynamic imports
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

const mockStart = jest.fn();
const mockStop = jest.fn();
const mockGetStatus = jest.fn();
const mockClearBuffer = jest.fn();
const mockGetState = jest.fn();
const mockJumpTo = jest.fn();

jest.unstable_mockModule(resolve(srcDir, 'utils/playback'), () => ({
  playbackQueue: {
    getState: mockGetState,
    jumpTo: mockJumpTo,
  },
  prefetchService: {
    start: mockStart,
    stop: mockStop,
    getStatus: mockGetStatus,
    clearBuffer: mockClearBuffer,
  },
}));

// Dynamic imports AFTER mock registration
const { registerPrefetchHandlers } = await import(
  '../../../src/handlers/prefetch.handlers'
);
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dispatch a handler and unwrap the outer registry Result.
 * The registry wraps every handler response in Ok/Err; this helper
 * returns the inner value (which is itself a Result for prefetch handlers).
 */
async function dispatchOk<T>(
  registry: InstanceType<typeof HandlerRegistry>,
  name: string,
  params?: unknown,
): Promise<T> {
  const outer = await registry.dispatch(name, params);
  if (!outer.ok) {
    throw new Error(
      `Registry dispatch failed for '${name}': ${JSON.stringify(outer.error)}`,
    );
  }
  return outer.value as T;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Prefetch Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    jest.resetAllMocks();
    registry = new HandlerRegistry();
    registerPrefetchHandlers(registry);
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all four prefetch handlers', () => {
      expect(registry.has('prefetch.start')).toBe(true);
      expect(registry.has('prefetch.stop')).toBe(true);
      expect(registry.has('prefetch.getStatus')).toBe(true);
      expect(registry.has('prefetch.clearBuffer')).toBe(true);
    });

    it('should return not_found when dispatching an unregistered handler', async () => {
      const result = await registry.dispatch('prefetch.unknown', undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect((result.error as HandlerError).type).toBe('not_found');
      }
    });
  });

  // -----------------------------------------------------------------------
  // prefetch.start
  // -----------------------------------------------------------------------

  describe('prefetch.start', () => {
    it('should start prefetching and return queued count', async () => {
      mockGetState.mockReturnValue({ totalItems: 5 });
      mockGetStatus.mockReturnValue({ pendingTasks: 3 });

      const result = await dispatchOk<Result<PrefetchStartResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.start',
        { currentIndex: 2 },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.queuedCount).toBe(3);
      }
      expect(mockJumpTo).toHaveBeenCalledWith(2);
      expect(mockStart).toHaveBeenCalled();
    });

    it('should default currentIndex to 0 when params are undefined', async () => {
      mockGetState.mockReturnValue({ totalItems: 10 });
      mockGetStatus.mockReturnValue({ pendingTasks: 5 });

      await dispatchOk<Result<PrefetchStartResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.start',
        undefined,
      );

      expect(mockJumpTo).toHaveBeenCalledWith(0);
    });

    it('should return success false when queue has no paragraphs', async () => {
      mockGetState.mockReturnValue({ totalItems: 0 });

      const result = await dispatchOk<Result<PrefetchStartResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.start',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(false);
        expect(result.value.queuedCount).toBe(0);
        expect(result.value.error).toBe('No paragraphs loaded');
      }
      expect(mockJumpTo).not.toHaveBeenCalled();
      expect(mockStart).not.toHaveBeenCalled();
    });

    it('should return operation_failed on thrown error', async () => {
      mockGetState.mockImplementation(() => {
        throw new Error('Queue corrupted');
      });

      const result = await dispatchOk<Result<PrefetchStartResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.start',
        { currentIndex: 0 },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('operation_failed');
        expect(result.error.message).toBe('Queue corrupted');
      }
    });

    it('should handle non-Error thrown values', async () => {
      mockGetState.mockImplementation(() => {
        throw 'string failure'; // eslint-disable-line no-throw-literal
      });

      const result = await dispatchOk<Result<PrefetchStartResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.start',
        undefined,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('operation_failed');
        expect(result.error.message).toBe('string failure');
      }
    });
  });

  // -----------------------------------------------------------------------
  // prefetch.stop
  // -----------------------------------------------------------------------

  describe('prefetch.stop', () => {
    it('should stop prefetching and clear the buffer', async () => {
      const result = await dispatchOk<Result<PrefetchStopResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.stop',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
      }
      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(mockClearBuffer).toHaveBeenCalledTimes(1);
    });

    it('should return operation_failed when stop throws', async () => {
      mockStop.mockImplementation(() => {
        throw new Error('Cannot stop – already disposed');
      });

      const result = await dispatchOk<Result<PrefetchStopResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.stop',
        undefined,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('operation_failed');
        expect(result.error.message).toBe('Cannot stop – already disposed');
      }
    });

    it('should return operation_failed when clearBuffer throws after stop', async () => {
      mockClearBuffer.mockImplementation(() => {
        throw new Error('Buffer already freed');
      });

      const result = await dispatchOk<Result<PrefetchStopResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.stop',
        undefined,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('operation_failed');
        expect(result.error.message).toBe('Buffer already freed');
      }
    });
  });

  // -----------------------------------------------------------------------
  // prefetch.getStatus
  // -----------------------------------------------------------------------

  describe('prefetch.getStatus', () => {
    it('should return full prefetch status', async () => {
      mockGetStatus.mockReturnValue({
        isActive: true,
        bufferSize: 3,
        bufferedIndices: [0, 1, 2],
        pendingTasks: 2,
        inProgressTasks: 1,
      });

      const result = await dispatchOk<Result<PrefetchStatusResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.getStatus',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({
          isActive: true,
          bufferSize: 3,
          bufferedIndices: [0, 1, 2],
          pendingTasks: 2,
          inProgressTasks: 1,
        });
      }
    });

    it('should return inactive status when service is idle', async () => {
      mockGetStatus.mockReturnValue({
        isActive: false,
        bufferSize: 0,
        bufferedIndices: [],
        pendingTasks: 0,
        inProgressTasks: 0,
      });

      const result = await dispatchOk<Result<PrefetchStatusResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.getStatus',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isActive).toBe(false);
        expect(result.value.bufferSize).toBe(0);
        expect(result.value.bufferedIndices).toEqual([]);
      }
    });

    it('should return operation_failed when getStatus throws', async () => {
      mockGetStatus.mockImplementation(() => {
        throw new Error('Service not initialized');
      });

      const result = await dispatchOk<Result<PrefetchStatusResponse, PrefetchHandlerError>>(
        registry,
        'prefetch.getStatus',
        undefined,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('operation_failed');
        expect(result.error.message).toBe('Service not initialized');
      }
    });
  });

  // -----------------------------------------------------------------------
  // prefetch.clearBuffer
  // -----------------------------------------------------------------------

  describe('prefetch.clearBuffer', () => {
    it('should clear the entire buffer and report cleared count', async () => {
      // First call (before clear) returns bufferSize 5
      // Second call (after clear) returns bufferSize 0
      mockGetStatus
        .mockReturnValueOnce({ bufferSize: 5 })
        .mockReturnValueOnce({ bufferSize: 0 });

      const result = await dispatchOk<
        Result<PrefetchClearBufferResponse, PrefetchHandlerError>
      >(registry, 'prefetch.clearBuffer', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.clearedCount).toBe(5);
      }
      expect(mockClearBuffer).toHaveBeenCalledWith(undefined);
    });

    it('should pass keepIndices to clearBuffer', async () => {
      mockGetStatus
        .mockReturnValueOnce({ bufferSize: 5 })
        .mockReturnValueOnce({ bufferSize: 2 });

      const result = await dispatchOk<
        Result<PrefetchClearBufferResponse, PrefetchHandlerError>
      >(registry, 'prefetch.clearBuffer', { keepIndices: [1, 3] });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.clearedCount).toBe(3);
      }
      expect(mockClearBuffer).toHaveBeenCalledWith([1, 3]);
    });

    it('should report zero cleared when buffer is already empty', async () => {
      mockGetStatus
        .mockReturnValueOnce({ bufferSize: 0 })
        .mockReturnValueOnce({ bufferSize: 0 });

      const result = await dispatchOk<
        Result<PrefetchClearBufferResponse, PrefetchHandlerError>
      >(registry, 'prefetch.clearBuffer', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.clearedCount).toBe(0);
      }
    });

    it('should return operation_failed when clearBuffer throws', async () => {
      mockGetStatus.mockReturnValue({ bufferSize: 3 });
      mockClearBuffer.mockImplementation(() => {
        throw new Error('IO failure during clear');
      });

      const result = await dispatchOk<
        Result<PrefetchClearBufferResponse, PrefetchHandlerError>
      >(registry, 'prefetch.clearBuffer', undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('operation_failed');
        expect(result.error.message).toBe('IO failure during clear');
      }
    });

    it('should return operation_failed when first getStatus throws', async () => {
      mockGetStatus.mockImplementation(() => {
        throw new Error('Status unavailable');
      });

      const result = await dispatchOk<
        Result<PrefetchClearBufferResponse, PrefetchHandlerError>
      >(registry, 'prefetch.clearBuffer', undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('operation_failed');
        expect(result.error.message).toBe('Status unavailable');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Dispatch via registry
  // -----------------------------------------------------------------------

  describe('dispatch integration', () => {
    it('should wrap handler result in Ok from registry dispatch', async () => {
      mockGetState.mockReturnValue({ totalItems: 3 });
      mockGetStatus.mockReturnValue({ pendingTasks: 1 });

      const outer = await registry.dispatch('prefetch.start', { currentIndex: 0 });

      // Outer layer: registry wraps in Ok
      expect(outer.ok).toBe(true);
      if (outer.ok) {
        // Inner layer: handler returns its own Result
        const inner = outer.value as Result<PrefetchStartResponse, PrefetchHandlerError>;
        expect(inner.ok).toBe(true);
      }
    });

    it('should return not_found for unregistered handler names', async () => {
      const result = await registry.dispatch('prefetch.nonexistent', undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.handlerName).toBe('prefetch.nonexistent');
      }
    });
  });
});
