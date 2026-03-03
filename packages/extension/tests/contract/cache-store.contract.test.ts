/**
 * ICacheStore Contract Tests
 *
 * These tests define the contract that all cache store adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/cache-store
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { ICacheStore, CacheKey, CacheEntry } from '../../src/ports/cache-store.port';
import { isOk, isErr } from '../../src/core/shared/result';
import { InMemoryCacheAdapter } from '../../src/adapters/cache';

/**
 * Contract test suite for ICacheStore implementations.
 *
 * Usage:
 * ```typescript
 * runCacheStoreContractTests('IndexedDBCacheAdapter', () => new IndexedDBCacheAdapter());
 * ```
 */
export function runCacheStoreContractTests(
  adapterName: string,
  createAdapter: () => ICacheStore
) {
  describe(`${adapterName} implements ICacheStore contract`, () => {
    let adapter: ICacheStore;

    const testKey: CacheKey = {
      urlHash: 'test-url-hash',
      paragraphIndex: 0,
      provider: 'elevenlabs',
      voice: 'default',
      contentHash: 'test-content-hash',
    };

    const testEntry: CacheEntry = {
      audioBlob: new Blob(['test audio data'], { type: 'audio/mpeg' }),
      durationMs: 1000,
      wordTimings: null,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 1,
      sizeBytes: 15,
    };

    beforeEach(async () => {
      adapter = createAdapter();
      // Clear any existing data
      await adapter.clear();
    });

    describe('get()', () => {
      it('should return null for non-existent key', async () => {
        const result = await adapter.get(testKey);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBeNull();
        }
      });

      it('should return entry for existing key', async () => {
        // Set up
        await adapter.set(testKey, testEntry);

        // Test
        const result = await adapter.get(testKey);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).not.toBeNull();
          expect(result.value?.durationMs).toBe(testEntry.durationMs);
          expect(result.value?.audioBlob).toBeInstanceOf(Blob);
        }
      });

      it('should update lastAccessedAt on get', async () => {
        await adapter.set(testKey, testEntry);

        // Wait a bit to ensure time difference
        await new Promise((resolve) => setTimeout(resolve, 10));

        const result = await adapter.get(testKey);

        expect(isOk(result)).toBe(true);
        if (isOk(result) && result.value) {
          expect(result.value.lastAccessedAt).toBeGreaterThanOrEqual(
            testEntry.lastAccessedAt
          );
        }
      });

      it('should increment accessCount on get', async () => {
        await adapter.set(testKey, testEntry);

        await adapter.get(testKey);
        const result = await adapter.get(testKey);

        expect(isOk(result)).toBe(true);
        if (isOk(result) && result.value) {
          expect(result.value.accessCount).toBeGreaterThan(testEntry.accessCount);
        }
      });
    });

    describe('set()', () => {
      it('should store entry successfully', async () => {
        const result = await adapter.set(testKey, testEntry);

        expect(isOk(result)).toBe(true);

        // Verify it was stored
        const getResult = await adapter.get(testKey);
        expect(isOk(getResult)).toBe(true);
        if (isOk(getResult)) {
          expect(getResult.value).not.toBeNull();
        }
      });

      it('should overwrite existing entry', async () => {
        await adapter.set(testKey, testEntry);

        const updatedEntry: CacheEntry = {
          ...testEntry,
          durationMs: 2000,
        };

        await adapter.set(testKey, updatedEntry);

        const result = await adapter.get(testKey);
        expect(isOk(result)).toBe(true);
        if (isOk(result) && result.value) {
          expect(result.value.durationMs).toBe(2000);
        }
      });
    });

    describe('delete()', () => {
      it('should return false for non-existent key', async () => {
        const result = await adapter.delete(testKey);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(false);
        }
      });

      it('should return true and remove existing entry', async () => {
        await adapter.set(testKey, testEntry);

        const result = await adapter.delete(testKey);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(true);
        }

        // Verify it was removed
        const getResult = await adapter.get(testKey);
        expect(isOk(getResult)).toBe(true);
        if (isOk(getResult)) {
          expect(getResult.value).toBeNull();
        }
      });
    });

    describe('clear()', () => {
      it('should clear all entries', async () => {
        // Add multiple entries
        await adapter.set(testKey, testEntry);
        await adapter.set(
          { ...testKey, paragraphIndex: 1 },
          testEntry
        );

        const result = await adapter.clear();

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(2);
        }

        // Verify cleared
        const stats = await adapter.getStats();
        expect(stats.entries).toBe(0);
      });

      it('should clear entries for specific URL', async () => {
        // Add entries for different URLs
        await adapter.set(testKey, testEntry);
        await adapter.set(
          { ...testKey, urlHash: 'other-url' },
          testEntry
        );

        const result = await adapter.clear('test-url-hash');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(1);
        }

        // Verify only matching entries cleared
        const stats = await adapter.getStats();
        expect(stats.entries).toBe(1);
      });
    });

    describe('has()', () => {
      it('should return false for non-existent key', async () => {
        const result = await adapter.has(testKey);
        expect(result).toBe(false);
      });

      it('should return true for existing key', async () => {
        await adapter.set(testKey, testEntry);

        const result = await adapter.has(testKey);
        expect(result).toBe(true);
      });
    });

    describe('getStats()', () => {
      it('should return stats with zero entries initially', async () => {
        const stats = await adapter.getStats();

        expect(stats.entries).toBe(0);
        expect(stats.totalSizeBytes).toBe(0);
        expect(stats.maxSizeBytes).toBeGreaterThan(0);
        expect(stats.hitCount).toBeGreaterThanOrEqual(0);
        expect(stats.missCount).toBeGreaterThanOrEqual(0);
      });

      it('should track hit and miss counts', async () => {
        // Miss
        await adapter.get(testKey);

        // Set and hit
        await adapter.set(testKey, testEntry);
        await adapter.get(testKey);

        const stats = await adapter.getStats();
        expect(stats.hitCount).toBeGreaterThanOrEqual(1);
        expect(stats.missCount).toBeGreaterThanOrEqual(1);
      });

      it('should track total size', async () => {
        await adapter.set(testKey, testEntry);

        const stats = await adapter.getStats();
        expect(stats.totalSizeBytes).toBeGreaterThan(0);
        expect(stats.entries).toBe(1);
      });
    });

    describe('evictIfNeeded()', () => {
      it('should return count of evicted entries', async () => {
        const result = await adapter.evictIfNeeded();

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(typeof result.value).toBe('number');
          expect(result.value).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });
}

// Run contract tests for InMemoryCacheAdapter
runCacheStoreContractTests('InMemoryCacheAdapter', () => new InMemoryCacheAdapter());

/**
 * Placeholder test to satisfy Jest requirement.
 */
describe('ICacheStore Contract', () => {
  it('exports contract test helpers', () => {
    expect(typeof runCacheStoreContractTests).toBe('function');
  });
});
