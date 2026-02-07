/**
 * Cache Handler Unit Tests
 *
 * Tests for all cache-related message handlers registered via registerCacheHandlers.
 * Covers: cache.getStats, cache.clear, cache.has, cache.delete,
 *         cache.evictIfNeeded, cache.getCachedParagraphs, cost.estimate
 *
 * Uses jest.unstable_mockModule for ESM-compatible mocking.
 *
 * @module tests/unit/handlers/cache.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Result } from '../../../src/core/shared/result';
import type {
  CacheHandlerError,
  CacheStatsResponse,
  CacheClearResponse,
  CacheCheckResponse,
  CacheEvictionResponse,
  CachedParagraphsResponse,
  CostEstimateResponse,
} from '../../../src/handlers/cache.handlers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetContainer = jest.fn<() => unknown>();
const mockIsContainerInitialized = jest.fn<() => boolean>(() => true);

jest.unstable_mockModule(resolve(srcDir, 'composition'), () => ({
  getContainer: mockGetContainer,
  isContainerInitialized: mockIsContainerInitialized,
}));

const mockCacheStoreInstance = {
  isInitialized: true,
  getCachedParagraphs: jest.fn<(url: string, provider: string, voice: string) => number[]>(
    () => [],
  ),
};

jest.unstable_mockModule(resolve(srcDir, 'utils/cache/audio-cache-store'), () => ({
  getCacheStore: jest.fn(() => mockCacheStoreInstance),
}));

jest.unstable_mockModule(resolve(srcDir, 'utils/cache/cost-estimator'), () => ({
  getProviderPricing: jest.fn((provider: string) => {
    if (provider === 'elevenlabs') {
      return { pricePerKiloChar: 0.18, name: 'ElevenLabs' };
    }
    return { pricePerKiloChar: 0, name: 'Browser' };
  }),
}));

// Dynamic imports AFTER mocks are registered
const { registerCacheHandlers } = await import('../../../src/handlers/cache.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock container with a mock cacheStore adapter.
 * Individual tests can override methods on the returned mockCacheStore.
 */
function createMockContainer(cacheStoreOverrides: Record<string, unknown> = {}) {
  const mockCacheStore = {
    getStats: jest.fn<() => Promise<unknown>>(),
    clear: jest.fn<() => Promise<unknown>>(),
    has: jest.fn<() => Promise<unknown>>(),
    delete: jest.fn<() => Promise<unknown>>(),
    evictIfNeeded: jest.fn<() => Promise<unknown>>(),
    ...cacheStoreOverrides,
  };

  return {
    container: { adapters: { cacheStore: mockCacheStore } },
    mockCacheStore,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cache Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerCacheHandlers(registry);

    // Default: container is initialised with a valid cacheStore
    mockIsContainerInitialized.mockReturnValue(true);
    mockGetContainer.mockReset();

    // Reset legacy cache store mock
    mockCacheStoreInstance.isInitialized = true;
    mockCacheStoreInstance.getCachedParagraphs.mockReset();
    mockCacheStoreInstance.getCachedParagraphs.mockReturnValue([]);
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all 7 handlers', () => {
      const names = registry.getHandlerNames();
      expect(names).toContain('cache.getStats');
      expect(names).toContain('cache.clear');
      expect(names).toContain('cache.has');
      expect(names).toContain('cache.delete');
      expect(names).toContain('cache.evictIfNeeded');
      expect(names).toContain('cache.getCachedParagraphs');
      expect(names).toContain('cost.estimate');
      expect(names).toHaveLength(7);
    });
  });

  // -----------------------------------------------------------------------
  // cache.getStats
  // -----------------------------------------------------------------------

  describe('cache.getStats', () => {
    it('should return cache statistics on success', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.getStats.mockResolvedValue({
        entries: 5,
        totalSizeBytes: 1024,
        maxSizeBytes: 500_000,
        hitCount: 10,
        missCount: 2,
        oldestEntryAgeMs: 60_000,
      });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.getStats', undefined);
      expect(dispatchResult.ok).toBe(true);

      const inner = (dispatchResult as { ok: true; value: Result<CacheStatsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.entries).toBe(5);
        expect(inner.value.totalSizeBytes).toBe(1024);
        expect(inner.value.hitRate).toBeCloseTo(10 / 12);
        expect(inner.value.oldestEntryAgeMs).toBe(60_000);
      }
    });

    it('should return adapter_unavailable when container is not initialized', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const dispatchResult = await registry.dispatch('cache.getStats', undefined);
      expect(dispatchResult.ok).toBe(true);

      const inner = (dispatchResult as { ok: true; value: Result<CacheStatsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('adapter_unavailable');
      }
    });

    it('should return adapter_unavailable when cacheStore is null', async () => {
      mockGetContainer.mockReturnValue({ adapters: { cacheStore: null } });

      const dispatchResult = await registry.dispatch('cache.getStats', undefined);
      expect(dispatchResult.ok).toBe(true);

      const inner = (dispatchResult as { ok: true; value: Result<CacheStatsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('adapter_unavailable');
        expect(inner.error.message).toContain('not available');
      }
    });

    it('should return operation_failed when getStats throws', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.getStats.mockRejectedValue(new Error('DB read error'));
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.getStats', undefined);
      expect(dispatchResult.ok).toBe(true);

      const inner = (dispatchResult as { ok: true; value: Result<CacheStatsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('operation_failed');
        expect(inner.error.message).toBe('DB read error');
      }
    });

    it('should compute hitRate as 0 when no hits or misses', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.getStats.mockResolvedValue({
        entries: 0,
        totalSizeBytes: 0,
        maxSizeBytes: 500_000,
        hitCount: 0,
        missCount: 0,
        oldestEntryAgeMs: null,
      });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.getStats', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<CacheStatsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.hitRate).toBe(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // cache.clear
  // -----------------------------------------------------------------------

  describe('cache.clear', () => {
    it('should clear all entries and report count', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.clear.mockResolvedValue({ ok: true, value: 3 });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.clear', {});
      expect(dispatchResult.ok).toBe(true);

      const inner = (dispatchResult as { ok: true; value: Result<CacheClearResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.success).toBe(true);
        expect(inner.value.entriesCleared).toBe(3);
      }
    });

    it('should pass urlFilter to cacheStore.clear', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.clear.mockResolvedValue({ ok: true, value: 1 });
      mockGetContainer.mockReturnValue(container);

      await registry.dispatch('cache.clear', { urlFilter: 'abc123' });
      expect(mockCacheStore.clear).toHaveBeenCalledWith('abc123');
    });

    it('should return adapter_unavailable when container not initialized', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const dispatchResult = await registry.dispatch('cache.clear', {});
      const inner = (dispatchResult as { ok: true; value: Result<CacheClearResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('adapter_unavailable');
      }
    });

    it('should return success:false when clear result is not ok', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.clear.mockResolvedValue({ ok: false, error: { type: 'cache_error' } });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.clear', {});
      const inner = (dispatchResult as { ok: true; value: Result<CacheClearResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.success).toBe(false);
        expect(inner.value.entriesCleared).toBe(0);
      }
    });

    it('should return operation_failed when clear throws', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.clear.mockRejectedValue(new Error('IDB write error'));
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.clear', {});
      const inner = (dispatchResult as { ok: true; value: Result<CacheClearResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('operation_failed');
      }
    });
  });

  // -----------------------------------------------------------------------
  // cache.has
  // -----------------------------------------------------------------------

  describe('cache.has', () => {
    const validKey = {
      urlHash: 'abc123',
      paragraphIndex: 0,
      provider: 'browser',
      voice: '',
      contentHash: 'hash1',
    };

    it('should return exists:true when entry is cached', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.has.mockResolvedValue(true);
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.has', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<CacheCheckResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.exists).toBe(true);
      }
    });

    it('should return exists:false when entry is not cached', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.has.mockResolvedValue(false);
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.has', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<CacheCheckResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.exists).toBe(false);
      }
    });

    it('should return invalid_params when urlHash is missing', async () => {
      const { container } = createMockContainer();
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.has', {
        paragraphIndex: 0,
        provider: 'browser',
        voice: '',
        contentHash: 'h',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CacheCheckResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('invalid_params');
      }
    });

    it('should return invalid_params when paragraphIndex is not a number', async () => {
      const { container } = createMockContainer();
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.has', {
        urlHash: 'abc',
        paragraphIndex: 'not-a-number',
        provider: 'browser',
        voice: '',
        contentHash: 'h',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CacheCheckResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('invalid_params');
        expect(inner.error.message).toContain('urlHash');
      }
    });

    it('should return adapter_unavailable when container not initialized', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const dispatchResult = await registry.dispatch('cache.has', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<CacheCheckResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('adapter_unavailable');
      }
    });

    it('should return adapter_unavailable when cacheStore is null', async () => {
      mockGetContainer.mockReturnValue({ adapters: { cacheStore: null } });

      const dispatchResult = await registry.dispatch('cache.has', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<CacheCheckResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('adapter_unavailable');
      }
    });

    it('should return operation_failed when has throws', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.has.mockRejectedValue(new Error('lookup failure'));
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.has', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<CacheCheckResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('operation_failed');
        expect(inner.error.message).toBe('lookup failure');
      }
    });
  });

  // -----------------------------------------------------------------------
  // cache.delete
  // -----------------------------------------------------------------------

  describe('cache.delete', () => {
    const validKey = {
      urlHash: 'abc123',
      paragraphIndex: 2,
      provider: 'browser',
      voice: '',
      contentHash: 'hash2',
    };

    it('should delete an entry and return deleted:true', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.delete.mockResolvedValue({ ok: true, value: true });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.delete', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<{ success: boolean; deleted: boolean }, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.success).toBe(true);
        expect(inner.value.deleted).toBe(true);
      }
    });

    it('should return deleted:false when entry did not exist', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.delete.mockResolvedValue({ ok: true, value: false });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.delete', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<{ success: boolean; deleted: boolean }, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.deleted).toBe(false);
      }
    });

    it('should return success:false when delete result is not ok', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.delete.mockResolvedValue({ ok: false, error: { type: 'cache_error' } });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.delete', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<{ success: boolean; deleted: boolean }, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.success).toBe(false);
        expect(inner.value.deleted).toBe(false);
      }
    });

    it('should return invalid_params when urlHash is missing', async () => {
      const { container } = createMockContainer();
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.delete', {
        paragraphIndex: 0,
      });
      const inner = (dispatchResult as { ok: true; value: Result<unknown, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('invalid_params');
      }
    });

    it('should return invalid_params when params is undefined', async () => {
      const dispatchResult = await registry.dispatch('cache.delete', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<unknown, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('invalid_params');
      }
    });

    it('should return adapter_unavailable when container not initialized', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const dispatchResult = await registry.dispatch('cache.delete', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<unknown, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('adapter_unavailable');
      }
    });

    it('should return operation_failed when delete throws', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.delete.mockRejectedValue(new Error('delete boom'));
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.delete', validKey);
      const inner = (dispatchResult as { ok: true; value: Result<unknown, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('operation_failed');
        expect(inner.error.message).toBe('delete boom');
      }
    });
  });

  // -----------------------------------------------------------------------
  // cache.evictIfNeeded
  // -----------------------------------------------------------------------

  describe('cache.evictIfNeeded', () => {
    it('should return eviction result on success', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.evictIfNeeded.mockResolvedValue({ ok: true, value: 5 });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.evictIfNeeded', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<CacheEvictionResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.success).toBe(true);
        expect(inner.value.entriesEvicted).toBe(5);
      }
    });

    it('should return success:false when eviction result is not ok', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.evictIfNeeded.mockResolvedValue({ ok: false, error: { type: 'cache_error' } });
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.evictIfNeeded', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<CacheEvictionResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.success).toBe(false);
        expect(inner.value.entriesEvicted).toBe(0);
      }
    });

    it('should return adapter_unavailable when container not initialized', async () => {
      mockIsContainerInitialized.mockReturnValue(false);

      const dispatchResult = await registry.dispatch('cache.evictIfNeeded', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<CacheEvictionResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('adapter_unavailable');
      }
    });

    it('should return adapter_unavailable when cacheStore is null', async () => {
      mockGetContainer.mockReturnValue({ adapters: { cacheStore: null } });

      const dispatchResult = await registry.dispatch('cache.evictIfNeeded', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<CacheEvictionResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('adapter_unavailable');
      }
    });

    it('should return operation_failed when evictIfNeeded throws', async () => {
      const { container, mockCacheStore } = createMockContainer();
      mockCacheStore.evictIfNeeded.mockRejectedValue(new Error('eviction error'));
      mockGetContainer.mockReturnValue(container);

      const dispatchResult = await registry.dispatch('cache.evictIfNeeded', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<CacheEvictionResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('operation_failed');
        expect(inner.error.message).toBe('eviction error');
      }
    });
  });

  // -----------------------------------------------------------------------
  // cache.getCachedParagraphs
  // -----------------------------------------------------------------------

  describe('cache.getCachedParagraphs', () => {
    it('should return cached paragraph indices', async () => {
      mockCacheStoreInstance.getCachedParagraphs.mockReturnValue([0, 2, 4]);

      const dispatchResult = await registry.dispatch('cache.getCachedParagraphs', {
        url: 'https://example.com/article',
        provider: 'browser',
        voice: 'default',
        totalParagraphs: 5,
      });
      const inner = (dispatchResult as { ok: true; value: Result<CachedParagraphsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.cachedIndices).toEqual([0, 2, 4]);
        expect(inner.value.totalParagraphs).toBe(5);
      }
    });

    it('should use default provider and voice when not provided', async () => {
      mockCacheStoreInstance.getCachedParagraphs.mockReturnValue([]);

      await registry.dispatch('cache.getCachedParagraphs', {
        url: 'https://example.com',
      });
      expect(mockCacheStoreInstance.getCachedParagraphs).toHaveBeenCalledWith(
        'https://example.com',
        'browser',
        '',
      );
    });

    it('should return empty indices when cacheStore is not initialized', async () => {
      mockCacheStoreInstance.isInitialized = false;

      const dispatchResult = await registry.dispatch('cache.getCachedParagraphs', {
        url: 'https://example.com',
        totalParagraphs: 10,
      });
      const inner = (dispatchResult as { ok: true; value: Result<CachedParagraphsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.cachedIndices).toEqual([]);
        expect(inner.value.totalParagraphs).toBe(10);
      }
    });

    it('should return invalid_params when url is missing', async () => {
      const dispatchResult = await registry.dispatch('cache.getCachedParagraphs', {});
      const inner = (dispatchResult as { ok: true; value: Result<CachedParagraphsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('invalid_params');
        expect(inner.error.message).toContain('url is required');
      }
    });

    it('should return invalid_params when params is undefined', async () => {
      const dispatchResult = await registry.dispatch('cache.getCachedParagraphs', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<CachedParagraphsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('invalid_params');
      }
    });

    it('should return operation_failed when getCachedParagraphs throws', async () => {
      mockCacheStoreInstance.getCachedParagraphs.mockImplementation(() => {
        throw new Error('store read fail');
      });

      const dispatchResult = await registry.dispatch('cache.getCachedParagraphs', {
        url: 'https://example.com',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CachedParagraphsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('operation_failed');
        expect(inner.error.message).toBe('store read fail');
      }
    });

    it('should default totalParagraphs to 0 when not provided', async () => {
      mockCacheStoreInstance.getCachedParagraphs.mockReturnValue([1]);

      const dispatchResult = await registry.dispatch('cache.getCachedParagraphs', {
        url: 'https://example.com',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CachedParagraphsResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.totalParagraphs).toBe(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // cost.estimate
  // -----------------------------------------------------------------------

  describe('cost.estimate', () => {
    it('should estimate cost for uncached paragraphs', async () => {
      mockCacheStoreInstance.getCachedParagraphs.mockReturnValue([]);

      const dispatchResult = await registry.dispatch('cost.estimate', {
        url: 'https://example.com',
        paragraphs: ['Hello world', 'Testing cost'],
        provider: 'elevenlabs',
        voice: 'voice1',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        // "Hello world" = 11 chars, "Testing cost" = 12 chars => total 23
        expect(inner.value.totalCharacters).toBe(23);
        expect(inner.value.cachedCharacters).toBe(0);
        expect(inner.value.uncachedCharacters).toBe(23);
        expect(inner.value.provider).toBe('elevenlabs');
        expect(inner.value.pricePerKiloChar).toBe(0.18);
        expect(inner.value.estimatedCost).toBeCloseTo((23 / 1000) * 0.18);
        expect(inner.value.actualCost).toBeCloseTo((23 / 1000) * 0.18);
        expect(inner.value.savingsFromCache).toBeCloseTo(0);
        expect(inner.value.savingsPercentage).toBe(0);
        expect(inner.value.paragraphCosts).toHaveLength(2);
        expect(inner.value.paragraphCosts[0].isCached).toBe(false);
        expect(inner.value.paragraphCosts[1].isCached).toBe(false);
      }
    });

    it('should account for cached paragraphs in cost calculation', async () => {
      // Paragraph at index 0 is cached
      mockCacheStoreInstance.getCachedParagraphs.mockReturnValue([0]);

      const dispatchResult = await registry.dispatch('cost.estimate', {
        url: 'https://example.com',
        paragraphs: ['Cached text!', 'Not cached!'],
        provider: 'elevenlabs',
        voice: 'voice1',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        // "Cached text!" = 12, "Not cached!" = 11 => total 23
        expect(inner.value.cachedCharacters).toBe(12);
        expect(inner.value.uncachedCharacters).toBe(11);
        expect(inner.value.paragraphCosts[0].isCached).toBe(true);
        expect(inner.value.paragraphCosts[0].cost).toBe(0);
        expect(inner.value.paragraphCosts[1].isCached).toBe(false);
        expect(inner.value.savingsFromCache).toBeGreaterThan(0);
        expect(inner.value.savingsPercentage).toBeCloseTo((12 / 23) * 100);
      }
    });

    it('should return empty estimate when paragraphs array is empty', async () => {
      const dispatchResult = await registry.dispatch('cost.estimate', {
        url: 'https://example.com',
        paragraphs: [],
        provider: 'browser',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.totalCharacters).toBe(0);
        expect(inner.value.paragraphCosts).toHaveLength(0);
        expect(inner.value.estimatedCost).toBe(0);
      }
    });

    it('should return empty estimate when paragraphs is not provided', async () => {
      const dispatchResult = await registry.dispatch('cost.estimate', {
        url: 'https://example.com',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.totalCharacters).toBe(0);
        expect(inner.value.paragraphCosts).toHaveLength(0);
      }
    });

    it('should return invalid_params when url is missing', async () => {
      const dispatchResult = await registry.dispatch('cost.estimate', {
        paragraphs: ['text'],
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('invalid_params');
        expect(inner.error.message).toContain('url is required');
      }
    });

    it('should return invalid_params when params is undefined', async () => {
      const dispatchResult = await registry.dispatch('cost.estimate', undefined);
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('invalid_params');
      }
    });

    it('should respect startParagraph and endParagraph range', async () => {
      mockCacheStoreInstance.getCachedParagraphs.mockReturnValue([]);

      const dispatchResult = await registry.dispatch('cost.estimate', {
        url: 'https://example.com',
        paragraphs: ['para0', 'para1', 'para2', 'para3'],
        provider: 'elevenlabs',
        voice: '',
        startParagraph: 1,
        endParagraph: 3,
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        // Only paragraphs 1 and 2 (indices 1..3 exclusive)
        expect(inner.value.paragraphCosts).toHaveLength(2);
        expect(inner.value.paragraphCosts[0].index).toBe(1);
        expect(inner.value.paragraphCosts[1].index).toBe(2);
        // "para1" = 5, "para2" = 5 => total 10
        expect(inner.value.totalCharacters).toBe(10);
      }
    });

    it('should default to browser provider and empty voice', async () => {
      mockCacheStoreInstance.getCachedParagraphs.mockReturnValue([]);

      const dispatchResult = await registry.dispatch('cost.estimate', {
        url: 'https://example.com',
        paragraphs: ['text'],
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.provider).toBe('browser');
        expect(inner.value.pricePerKiloChar).toBe(0);
        expect(inner.value.actualCost).toBe(0);
      }
    });

    it('should return operation_failed when getCachedParagraphs throws', async () => {
      mockCacheStoreInstance.getCachedParagraphs.mockImplementation(() => {
        throw new Error('cost calc failure');
      });

      const dispatchResult = await registry.dispatch('cost.estimate', {
        url: 'https://example.com',
        paragraphs: ['text'],
        provider: 'elevenlabs',
        voice: 'v1',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(false);
      if (!inner.ok) {
        expect(inner.error.type).toBe('operation_failed');
        expect(inner.error.message).toBe('cost calc failure');
      }
    });

    it('should handle non-initialized cacheStore gracefully', async () => {
      mockCacheStoreInstance.isInitialized = false;
      // When not initialized, no paragraphs are cached
      const dispatchResult = await registry.dispatch('cost.estimate', {
        url: 'https://example.com',
        paragraphs: ['abc', 'def'],
        provider: 'elevenlabs',
        voice: '',
      });
      const inner = (dispatchResult as { ok: true; value: Result<CostEstimateResponse, CacheHandlerError> }).value;
      expect(inner.ok).toBe(true);
      if (inner.ok) {
        expect(inner.value.cachedCharacters).toBe(0);
        expect(inner.value.uncachedCharacters).toBe(6);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Dispatch via registry for non-existent handler
  // -----------------------------------------------------------------------

  describe('dispatch unknown handler', () => {
    it('should return not_found for unregistered handler names', async () => {
      const result = await registry.dispatch('cache.nonexistent', {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.handlerName).toBe('cache.nonexistent');
      }
    });
  });
});
