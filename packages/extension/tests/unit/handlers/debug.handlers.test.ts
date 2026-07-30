/**
 * Debug Handler Unit Tests
 *
 * Tests for debug/telemetry message handlers registered on the HandlerRegistry.
 * Verifies all 5 handlers: getStatus, getDispatchStats, getDispatchSummary,
 * resetStats, getUnknownMessages.
 *
 * Uses jest.unstable_mockModule for ESM-compatible mocking of heavy
 * transitive dependencies (init-hexagonal, composition, telemetry).
 *
 * @module tests/unit/handlers/debug.handlers
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DispatchStats, DispatchSummary } from '../../../src/utils/telemetry';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// --- Mock setup (must come before dynamic imports) ---

const mockGetContainerStatus =
  jest.fn<
    () => {
      initialized: boolean;
      adapters: string[];
      services: string[];
      handlers: string[];
    }
  >();
const mockGetHexagonalDispatchStats = jest.fn<() => DispatchStats>();
const mockGetHexagonalDispatchSummary = jest.fn<(legacyHandlers: string[]) => DispatchSummary>();
const mockResetHexagonalDispatchStats = jest.fn();

jest.unstable_mockModule(resolve(srcDir, 'composition/status'), () => ({
  getContainerStatus: mockGetContainerStatus,
}));

const mockIsPlaybackServiceAvailable = jest.fn<() => boolean>();
const mockIsContentExtractionServiceAvailable = jest.fn<() => boolean>();

jest.unstable_mockModule(resolve(srcDir, 'composition'), () => ({
  getContainer: jest.fn(),
  isContainerInitialized: jest.fn(() => true),
  isPlaybackServiceAvailable: mockIsPlaybackServiceAvailable,
  isContentExtractionServiceAvailable: mockIsContentExtractionServiceAvailable,
}));

const mockGetUnknownMessageStats =
  jest.fn<
    () => {
      total: number;
      types: Record<string, { count: number; lastSeen: number }>;
    }
  >();

jest.unstable_mockModule(resolve(srcDir, 'utils/telemetry'), () => ({
  getDispatchStats: mockGetHexagonalDispatchStats,
  getDispatchSummary: mockGetHexagonalDispatchSummary,
  resetDispatchStats: mockResetHexagonalDispatchStats,
  getUnknownMessageStats: mockGetUnknownMessageStats,
}));

// --- Dynamic imports after mocks ---

const { registerDebugHandlers } = await import('../../../src/handlers/debug.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// --- Helpers ---

/**
 * Create a default DispatchStats fixture with optional overrides.
 */
function makeDispatchStats(overrides: Partial<DispatchStats> = {}): DispatchStats {
  return {
    hexTotal: 0,
    legacyTotal: 0,
    unknownTotal: 0,
    hexPercentage: 0,
    byType: {},
    unknownTypes: {},
    startTime: Date.now(),
    lastReset: Date.now(),
    ...overrides,
  };
}

/**
 * Create a default DispatchSummary fixture with optional overrides.
 */
function makeDispatchSummary(overrides: Partial<DispatchSummary> = {}): DispatchSummary {
  return {
    stats: makeDispatchStats(),
    hexHandlers: [],
    legacyOnlyHandlers: [],
    migratedHandlers: [],
    ...overrides,
  };
}

// --- Tests ---

describe('Debug Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new HandlerRegistry();
    registerDebugHandlers(registry);
  });

  describe('registration', () => {
    it('should register all 5 debug handlers', () => {
      const names = registry.getHandlerNames();
      expect(names).toContain('hexagonal.getStatus');
      expect(names).toContain('hexagonal.getDispatchStats');
      expect(names).toContain('hexagonal.getDispatchSummary');
      expect(names).toContain('hexagonal.resetStats');
      expect(names).toContain('hexagonal.getUnknownMessages');
      expect(names).toHaveLength(5);
    });

    it('should group all handlers under the hexagonal prefix', () => {
      const groups = registry.getHandlersByPrefix();
      expect(groups.get('hexagonal')).toHaveLength(5);
    });
  });

  describe('hexagonal.getStatus', () => {
    it('should return Ok with container status and service availability', async () => {
      mockGetContainerStatus.mockReturnValue({
        initialized: true,
        adapters: ['audioGenerator', 'cacheStore'],
        services: ['playback'],
        handlers: ['playback.start'],
      });
      mockIsPlaybackServiceAvailable.mockReturnValue(true);
      mockIsContentExtractionServiceAvailable.mockReturnValue(false);

      const result = await registry.dispatch('hexagonal.getStatus', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // The handler returns Ok(value), which dispatch wraps in another Ok.
        // So result.value is the handler's Result<HexagonalStatusResponse, ...>.
        const inner = result.value as { ok: true; value: Record<string, unknown> };
        expect(inner.ok).toBe(true);
        expect(inner.value).toEqual({
          initialized: true,
          adapters: ['audioGenerator', 'cacheStore'],
          services: ['playback'],
          handlers: ['playback.start'],
          playbackServiceAvailable: true,
          contentExtractionServiceAvailable: false,
        });
      }
    });

    it('should reflect uninitialized container', async () => {
      mockGetContainerStatus.mockReturnValue({
        initialized: false,
        adapters: [],
        services: [],
        handlers: [],
      });
      mockIsPlaybackServiceAvailable.mockReturnValue(false);
      mockIsContentExtractionServiceAvailable.mockReturnValue(false);

      const result = await registry.dispatch('hexagonal.getStatus', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: true; value: Record<string, unknown> };
        expect(inner.ok).toBe(true);
        expect(inner.value).toMatchObject({
          initialized: false,
          adapters: [],
          services: [],
          handlers: [],
          playbackServiceAvailable: false,
          contentExtractionServiceAvailable: false,
        });
      }
    });

    it('should return execution_failed when getContainerStatus throws', async () => {
      mockGetContainerStatus.mockImplementation(() => {
        throw new Error('Container exploded');
      });

      const result = await registry.dispatch('hexagonal.getStatus', undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          type: 'execution_failed',
          handlerName: 'hexagonal.getStatus',
          message: 'Container exploded',
        });
      }
    });
  });

  describe('hexagonal.getDispatchStats', () => {
    it('should return Ok with current dispatch stats', async () => {
      const stats = makeDispatchStats({ hexTotal: 42, legacyTotal: 7, hexPercentage: 85.7 });
      mockGetHexagonalDispatchStats.mockReturnValue(stats);

      const result = await registry.dispatch('hexagonal.getDispatchStats', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: true; value: DispatchStats };
        expect(inner.ok).toBe(true);
        expect(inner.value.hexTotal).toBe(42);
        expect(inner.value.legacyTotal).toBe(7);
        expect(inner.value.hexPercentage).toBe(85.7);
      }
    });

    it('should return execution_failed when getHexagonalDispatchStats throws', async () => {
      mockGetHexagonalDispatchStats.mockImplementation(() => {
        throw new Error('Stats unavailable');
      });

      const result = await registry.dispatch('hexagonal.getDispatchStats', undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          type: 'execution_failed',
          handlerName: 'hexagonal.getDispatchStats',
          message: 'Stats unavailable',
        });
      }
    });
  });

  describe('hexagonal.getDispatchSummary', () => {
    it('should return Ok with summary using provided legacy handlers', async () => {
      const summary = makeDispatchSummary({
        hexHandlers: ['playback.start'],
        legacyOnlyHandlers: ['startPlayback'],
        migratedHandlers: [],
      });
      mockGetHexagonalDispatchSummary.mockReturnValue(summary);

      const result = await registry.dispatch('hexagonal.getDispatchSummary', {
        legacyHandlers: ['startPlayback', 'stopPlayback'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: true; value: DispatchSummary };
        expect(inner.ok).toBe(true);
        expect(inner.value.hexHandlers).toContain('playback.start');
        expect(inner.value.legacyOnlyHandlers).toContain('startPlayback');
      }
      expect(mockGetHexagonalDispatchSummary).toHaveBeenCalledWith(
        expect.arrayContaining(['hexagonal.getDispatchSummary']),
        ['startPlayback', 'stopPlayback'],
      );
    });

    it('should default to empty array when legacyHandlers not provided', async () => {
      const summary = makeDispatchSummary();
      mockGetHexagonalDispatchSummary.mockReturnValue(summary);

      await registry.dispatch('hexagonal.getDispatchSummary', undefined);

      expect(mockGetHexagonalDispatchSummary).toHaveBeenCalledWith(expect.any(Array), []);
    });

    it('should default to empty array when params is null', async () => {
      const summary = makeDispatchSummary();
      mockGetHexagonalDispatchSummary.mockReturnValue(summary);

      await registry.dispatch('hexagonal.getDispatchSummary', null);

      expect(mockGetHexagonalDispatchSummary).toHaveBeenCalledWith(expect.any(Array), []);
    });
  });

  describe('hexagonal.resetStats', () => {
    it('should call resetHexagonalDispatchStats and return success', async () => {
      const result = await registry.dispatch('hexagonal.resetStats', undefined);

      expect(mockResetHexagonalDispatchStats).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as { ok: true; value: { success: boolean } };
        expect(inner.ok).toBe(true);
        expect(inner.value.success).toBe(true);
      }
    });

    it('should return execution_failed when resetHexagonalDispatchStats throws', async () => {
      mockResetHexagonalDispatchStats.mockImplementation(() => {
        throw new Error('Reset failed');
      });

      const result = await registry.dispatch('hexagonal.resetStats', undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          type: 'execution_failed',
          handlerName: 'hexagonal.resetStats',
          message: 'Reset failed',
        });
      }
    });
  });

  describe('hexagonal.getUnknownMessages', () => {
    it('should return Ok with unknown message stats', async () => {
      mockGetUnknownMessageStats.mockReturnValue({
        total: 3,
        types: {
          'bad.action': { count: 2, lastSeen: 1000 },
          'unknown.type': { count: 1, lastSeen: 2000 },
        },
      });

      const result = await registry.dispatch('hexagonal.getUnknownMessages', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as {
          ok: true;
          value: { total: number; types: Record<string, { count: number; lastSeen: number }> };
        };
        expect(inner.ok).toBe(true);
        expect(inner.value.total).toBe(3);
        expect(Object.keys(inner.value.types)).toHaveLength(2);
        expect(inner.value.types['bad.action'].count).toBe(2);
      }
    });

    it('should return empty stats when no unknown messages', async () => {
      mockGetUnknownMessageStats.mockReturnValue({
        total: 0,
        types: {},
      });

      const result = await registry.dispatch('hexagonal.getUnknownMessages', undefined);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const inner = result.value as {
          ok: true;
          value: { total: number; types: Record<string, unknown> };
        };
        expect(inner.ok).toBe(true);
        expect(inner.value.total).toBe(0);
        expect(Object.keys(inner.value.types)).toHaveLength(0);
      }
    });
  });

  describe('dispatch for unregistered handler', () => {
    it('should return not_found error for unknown handler name', async () => {
      const result = await registry.dispatch('hexagonal.doesNotExist', undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          type: 'not_found',
          handlerName: 'hexagonal.doesNotExist',
        });
      }
    });
  });
});
