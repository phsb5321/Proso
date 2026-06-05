/**
 * IndexedDB Cache Lifecycle Integration Tests
 *
 * Tests the complete audio cache lifecycle: init, store, retrieve, evict, cleanup.
 * Uses mock in-memory storage to verify cache behavior.
 *
 * @module tests/integration/cache/indexeddb-lifecycle
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  HandlerRegistry,
  createHandlerRegistry,
} from '../../../src/handlers/registry';
import type { Result } from '../../../src/core/shared/result';
import { Ok, Err } from '../../../src/core/shared/result';

/**
 * Mock cache entry type
 */
interface CacheEntry {
  cacheKey: string;
  url: string;
  paragraphIndex: number;
  provider: string;
  voice: string;
  audioData: ArrayBuffer;
  originalSize: number;
  compressedSize: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

/**
 * Mock cache configuration
 */
interface CacheConfig {
  maxSizeBytes: number;
  maxEntries: number;
  maxAgeMs: number;
  evictionThresholdPercent: number;
  evictionTargetPercent: number;
}

/**
 * Mock cache statistics
 */
interface CacheStats {
  entries: number;
  totalSize: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  oldestEntryAgeMs: number | null;
}

/**
 * Mock cache store state
 */
interface CacheStoreState {
  entries: Map<string, CacheEntry>;
  config: CacheConfig;
  hitCount: number;
  missCount: number;
  isInitialized: boolean;
}

describe('IndexedDB Cache Lifecycle Integration', () => {
  let registry: HandlerRegistry;
  let cacheState: CacheStoreState;

  const defaultConfig: CacheConfig = {
    maxSizeBytes: 10 * 1024 * 1024, // 10MB for testing
    maxEntries: 100,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    evictionThresholdPercent: 90,
    evictionTargetPercent: 70,
  };

  beforeEach(() => {
    registry = createHandlerRegistry();

    // Initialize cache state
    cacheState = {
      entries: new Map(),
      config: { ...defaultConfig },
      hitCount: 0,
      missCount: 0,
      isInitialized: false,
    };

    // Helper functions
    function getTotalSize(): number {
      let total = 0;
      for (const entry of cacheState.entries.values()) {
        total += entry.compressedSize;
      }
      return total;
    }

    // Register cache handlers

    // Initialize cache
    registry.register<
      { config?: Partial<CacheConfig> },
      Result<{ isInitialized: boolean }, { type: string; message: string }>
    >(
      'cache.init',
      async ({ config }) => {
        if (cacheState.isInitialized) {
          return Ok({ isInitialized: true });
        }

        if (config) {
          cacheState.config = { ...cacheState.config, ...config };
        }

        cacheState.isInitialized = true;
        return Ok({ isInitialized: true });
      },
      'Initialize cache store',
    );

    // Store entry
    registry.register<
      {
        url: string;
        paragraphIndex: number;
        provider: string;
        voice: string;
        audioData: ArrayBuffer;
      },
      Result<{ cacheKey: string }, { type: string; message: string }>
    >(
      'cache.set',
      async ({ url, paragraphIndex, provider, voice, audioData }) => {
        if (!cacheState.isInitialized) {
          return Err({ type: 'not_initialized', message: 'Cache not initialized' });
        }

        // Check entry limit
        if (cacheState.entries.size >= cacheState.config.maxEntries) {
          // Trigger eviction
          await registry.dispatch('cache.evict', {});
        }

        // Generate cache key
        const urlHash = url.replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
        const contentHash = Math.random().toString(36).substring(2, 18);
        const cacheKey = `${urlHash}:${paragraphIndex}:${provider}:${voice}:${contentHash}`;

        const now = Date.now();
        const entry: CacheEntry = {
          cacheKey,
          url,
          paragraphIndex,
          provider,
          voice,
          audioData,
          originalSize: audioData.byteLength,
          compressedSize: audioData.byteLength,
          createdAt: now,
          lastAccessedAt: now,
          accessCount: 0,
        };

        // Check size limit
        const currentSize = getTotalSize();
        if (currentSize + entry.compressedSize > cacheState.config.maxSizeBytes) {
          await registry.dispatch('cache.evict', {});
        }

        cacheState.entries.set(cacheKey, entry);
        return Ok({ cacheKey });
      },
      'Store audio in cache',
    );

    // Get entry
    registry.register<
      { cacheKey: string },
      Result<CacheEntry | null, { type: string; message: string }>
    >(
      'cache.get',
      async ({ cacheKey }) => {
        if (!cacheState.isInitialized) {
          return Err({ type: 'not_initialized', message: 'Cache not initialized' });
        }

        const entry = cacheState.entries.get(cacheKey);
        if (entry) {
          cacheState.hitCount++;
          entry.lastAccessedAt = Date.now();
          entry.accessCount++;
          return Ok(entry);
        }

        cacheState.missCount++;
        return Ok(null);
      },
      'Get cached audio',
    );

    // Check if entry exists
    registry.register<
      { url: string; paragraphIndex: number; provider: string; voice: string },
      Result<{ exists: boolean; cacheKey: string | null }, { type: string; message: string }>
    >(
      'cache.check',
      async ({ url, paragraphIndex, provider, voice }) => {
        if (!cacheState.isInitialized) {
          return Err({ type: 'not_initialized', message: 'Cache not initialized' });
        }

        for (const [key, entry] of cacheState.entries) {
          if (
            entry.url === url &&
            entry.paragraphIndex === paragraphIndex &&
            entry.provider === provider &&
            entry.voice === voice
          ) {
            return Ok({ exists: true, cacheKey: key });
          }
        }

        return Ok({ exists: false, cacheKey: null });
      },
      'Check if paragraph is cached',
    );

    // Delete entry
    registry.register<
      { cacheKey: string },
      Result<{ deleted: boolean }, { type: string; message: string }>
    >(
      'cache.delete',
      async ({ cacheKey }) => {
        if (!cacheState.isInitialized) {
          return Err({ type: 'not_initialized', message: 'Cache not initialized' });
        }

        const deleted = cacheState.entries.delete(cacheKey);
        return Ok({ deleted });
      },
      'Delete cached entry',
    );

    // Clear all entries
    registry.register<void, Result<{ entriesRemoved: number }, { type: string; message: string }>>(
      'cache.clear',
      async () => {
        if (!cacheState.isInitialized) {
          return Err({ type: 'not_initialized', message: 'Cache not initialized' });
        }

        const count = cacheState.entries.size;
        cacheState.entries.clear();
        cacheState.hitCount = 0;
        cacheState.missCount = 0;
        return Ok({ entriesRemoved: count });
      },
      'Clear all cached entries',
    );

    // Get statistics
    registry.register<void, Result<CacheStats, { type: string; message: string }>>(
      'cache.getStats',
      async () => {
        const totalSize = getTotalSize();
        const totalAccess = cacheState.hitCount + cacheState.missCount;
        const hitRate = totalAccess > 0 ? cacheState.hitCount / totalAccess : 0;

        let oldestEntryAgeMs: number | null = null;
        const now = Date.now();

        for (const entry of cacheState.entries.values()) {
          const age = now - entry.createdAt;
          if (oldestEntryAgeMs === null || age > oldestEntryAgeMs) {
            oldestEntryAgeMs = age;
          }
        }

        return Ok({
          entries: cacheState.entries.size,
          totalSize,
          maxSize: cacheState.config.maxSizeBytes,
          hitCount: cacheState.hitCount,
          missCount: cacheState.missCount,
          hitRate,
          oldestEntryAgeMs,
        });
      },
      'Get cache statistics',
    );

    // Evict entries if needed
    registry.register<
      { force?: boolean },
      Result<
        { triggered: boolean; entriesEvicted: number; bytesFreed: number },
        { type: string; message: string }
      >
    >(
      'cache.evict',
      async ({ force = false }) => {
        const totalSize = getTotalSize();
        const usagePercent = (totalSize / cacheState.config.maxSizeBytes) * 100;

        if (!force && usagePercent < cacheState.config.evictionThresholdPercent) {
          return Ok({ triggered: false, entriesEvicted: 0, bytesFreed: 0 });
        }

        const targetSize =
          (cacheState.config.evictionTargetPercent / 100) * cacheState.config.maxSizeBytes;

        // Sort by last accessed time (oldest first)
        const sorted = [...cacheState.entries.entries()].sort(
          ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt,
        );

        let bytesFreed = 0;
        let entriesEvicted = 0;

        for (const [key, entry] of sorted) {
          if (totalSize - bytesFreed <= targetSize) break;
          cacheState.entries.delete(key);
          bytesFreed += entry.compressedSize;
          entriesEvicted++;
        }

        return Ok({ triggered: true, entriesEvicted, bytesFreed });
      },
      'Evict entries based on LRU',
    );

    // Cleanup stale entries
    registry.register<
      void,
      Result<
        { entriesRemoved: number; staleEntriesRemoved: number; bytesFreed: number },
        { type: string; message: string }
      >
    >(
      'cache.cleanup',
      async () => {
        if (!cacheState.isInitialized) {
          return Err({ type: 'not_initialized', message: 'Cache not initialized' });
        }

        const now = Date.now();
        let entriesRemoved = 0;
        let bytesFreed = 0;

        for (const [key, entry] of cacheState.entries) {
          if (now - entry.createdAt > cacheState.config.maxAgeMs) {
            cacheState.entries.delete(key);
            bytesFreed += entry.compressedSize;
            entriesRemoved++;
          }
        }

        return Ok({
          entriesRemoved,
          staleEntriesRemoved: entriesRemoved,
          bytesFreed,
        });
      },
      'Cleanup stale entries',
    );

    // Get cached paragraphs for URL
    registry.register<
      { url: string; provider: string; voice: string },
      Result<number[], { type: string; message: string }>
    >(
      'cache.getCachedParagraphs',
      async ({ url, provider, voice }) => {
        const indices: number[] = [];

        for (const entry of cacheState.entries.values()) {
          if (entry.url === url && entry.provider === provider && entry.voice === voice) {
            indices.push(entry.paragraphIndex);
          }
        }

        return Ok(indices.sort((a, b) => a - b));
      },
      'Get cached paragraph indices',
    );
  });

  afterEach(() => {
    registry.clear();
    cacheState.entries.clear();
  });

  // Helper functions
  function createMockAudioData(sizeBytes: number): ArrayBuffer {
    return new ArrayBuffer(sizeBytes);
  }

  describe('Initialization Flow', () => {
    it('should initialize cache store', async () => {
      const result = await registry.dispatch<
        { config?: Partial<CacheConfig> },
        Result<{ isInitialized: boolean }, { type: string; message: string }>
      >('cache.init', {});

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.isInitialized).toBe(true);
      }
      expect(cacheState.isInitialized).toBe(true);
    });

    it('should accept custom configuration', async () => {
      const customConfig = { maxSizeBytes: 5 * 1024 * 1024 };
      const result = await registry.dispatch<
        { config?: Partial<CacheConfig> },
        Result<{ isInitialized: boolean }, { type: string; message: string }>
      >('cache.init', { config: customConfig });

      expect(result.ok).toBe(true);
      expect(cacheState.config.maxSizeBytes).toBe(5 * 1024 * 1024);
    });

    it('should be idempotent', async () => {
      await registry.dispatch('cache.init', {});
      const result = await registry.dispatch<
        { config?: Partial<CacheConfig> },
        Result<{ isInitialized: boolean }, { type: string; message: string }>
      >('cache.init', {});

      expect(result.ok).toBe(true);
    });
  });

  describe('Store and Retrieve Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('cache.init', {});
    });

    it('should store audio entry and return cache key', async () => {
      const audioData = createMockAudioData(1024);
      const result = await registry.dispatch<
        {
          url: string;
          paragraphIndex: number;
          provider: string;
          voice: string;
          audioData: ArrayBuffer;
        },
        Result<{ cacheKey: string }, { type: string; message: string }>
      >('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData,
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.cacheKey).toContain(':0:openai:alloy:');
      }
    });

    it('should retrieve stored entry by cache key', async () => {
      const audioData = createMockAudioData(1024);
      const setResult = await registry.dispatch<
        {
          url: string;
          paragraphIndex: number;
          provider: string;
          voice: string;
          audioData: ArrayBuffer;
        },
        Result<{ cacheKey: string }, { type: string; message: string }>
      >('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData,
      });

      if (!setResult.ok || !setResult.value.ok) throw new Error('Set failed');

      const getResult = await registry.dispatch<
        { cacheKey: string },
        Result<CacheEntry | null, { type: string; message: string }>
      >('cache.get', {
        cacheKey: setResult.value.value.cacheKey,
      });

      expect(getResult.ok).toBe(true);
      if (getResult.ok && getResult.value.ok) {
        expect(getResult.value.value).not.toBeNull();
        expect(getResult.value.value?.audioData.byteLength).toBe(1024);
      }
    });

    it('should return null for non-existent key', async () => {
      const result = await registry.dispatch<
        { cacheKey: string },
        Result<CacheEntry | null, { type: string; message: string }>
      >('cache.get', {
        cacheKey: 'nonexistent:0:openai:alloy:abc123',
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value).toBeNull();
      }
    });

    it('should update access time and count on retrieval', async () => {
      const audioData = createMockAudioData(1024);
      const setResult = await registry.dispatch<
        {
          url: string;
          paragraphIndex: number;
          provider: string;
          voice: string;
          audioData: ArrayBuffer;
        },
        Result<{ cacheKey: string }, { type: string; message: string }>
      >('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData,
      });

      if (!setResult.ok || !setResult.value.ok) throw new Error('Set failed');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Get twice
      await registry.dispatch('cache.get', { cacheKey: setResult.value.value.cacheKey });
      await registry.dispatch('cache.get', { cacheKey: setResult.value.value.cacheKey });

      const entry = cacheState.entries.get(setResult.value.value.cacheKey);
      expect(entry?.accessCount).toBe(2);
    });
  });

  describe('Check Existence Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('cache.init', {});
    });

    it('should find existing entry by attributes', async () => {
      const audioData = createMockAudioData(1024);
      await registry.dispatch('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 5,
        provider: 'openai',
        voice: 'alloy',
        audioData,
      });

      const result = await registry.dispatch<
        { url: string; paragraphIndex: number; provider: string; voice: string },
        Result<{ exists: boolean; cacheKey: string | null }, { type: string; message: string }>
      >('cache.check', {
        url: 'https://example.com/article',
        paragraphIndex: 5,
        provider: 'openai',
        voice: 'alloy',
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.exists).toBe(true);
        expect(result.value.value.cacheKey).not.toBeNull();
      }
    });

    it('should not find non-existent entry', async () => {
      const result = await registry.dispatch<
        { url: string; paragraphIndex: number; provider: string; voice: string },
        Result<{ exists: boolean; cacheKey: string | null }, { type: string; message: string }>
      >('cache.check', {
        url: 'https://example.com/nonexistent',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.exists).toBe(false);
        expect(result.value.value.cacheKey).toBeNull();
      }
    });
  });

  describe('Delete Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('cache.init', {});
    });

    it('should delete existing entry', async () => {
      const audioData = createMockAudioData(1024);
      const setResult = await registry.dispatch<
        {
          url: string;
          paragraphIndex: number;
          provider: string;
          voice: string;
          audioData: ArrayBuffer;
        },
        Result<{ cacheKey: string }, { type: string; message: string }>
      >('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData,
      });

      if (!setResult.ok || !setResult.value.ok) throw new Error('Set failed');

      const deleteResult = await registry.dispatch<
        { cacheKey: string },
        Result<{ deleted: boolean }, { type: string; message: string }>
      >('cache.delete', {
        cacheKey: setResult.value.value.cacheKey,
      });

      expect(deleteResult.ok).toBe(true);
      if (deleteResult.ok && deleteResult.value.ok) {
        expect(deleteResult.value.value.deleted).toBe(true);
      }

      // Verify it's gone
      const getResult = await registry.dispatch<
        { cacheKey: string },
        Result<CacheEntry | null, { type: string; message: string }>
      >('cache.get', {
        cacheKey: setResult.value.value.cacheKey,
      });
      expect(getResult.ok && getResult.value.ok && getResult.value.value).toBeNull();
    });

    it('should handle deleting non-existent entry gracefully', async () => {
      const result = await registry.dispatch<
        { cacheKey: string },
        Result<{ deleted: boolean }, { type: string; message: string }>
      >('cache.delete', {
        cacheKey: 'nonexistent:0:openai:alloy:abc123',
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.deleted).toBe(false);
      }
    });
  });

  describe('Clear Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('cache.init', {});
      // Add some entries
      for (let i = 0; i < 5; i++) {
        await registry.dispatch('cache.set', {
          url: 'https://example.com/article',
          paragraphIndex: i,
          provider: 'openai',
          voice: 'alloy',
          audioData: createMockAudioData(1024),
        });
      }
    });

    it('should clear all entries', async () => {
      const result = await registry.dispatch<
        void,
        Result<{ entriesRemoved: number }, { type: string; message: string }>
      >('cache.clear', undefined);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.entriesRemoved).toBe(5);
      }
      expect(cacheState.entries.size).toBe(0);
    });

    it('should reset hit/miss counts', async () => {
      // Generate some hits/misses
      await registry.dispatch('cache.get', { cacheKey: 'nonexistent' });

      await registry.dispatch('cache.clear', undefined);

      expect(cacheState.hitCount).toBe(0);
      expect(cacheState.missCount).toBe(0);
    });
  });

  describe('Statistics Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('cache.init', {});
    });

    it('should return accurate statistics', async () => {
      // Add entries
      for (let i = 0; i < 3; i++) {
        const setResult = await registry.dispatch<
          {
            url: string;
            paragraphIndex: number;
            provider: string;
            voice: string;
            audioData: ArrayBuffer;
          },
          Result<{ cacheKey: string }, { type: string; message: string }>
        >('cache.set', {
          url: 'https://example.com/article',
          paragraphIndex: i,
          provider: 'openai',
          voice: 'alloy',
          audioData: createMockAudioData(1000), // 1KB each
        });

        // Access the first one multiple times
        if (i === 0 && setResult.ok && setResult.value.ok) {
          await registry.dispatch('cache.get', { cacheKey: setResult.value.value.cacheKey });
          await registry.dispatch('cache.get', { cacheKey: setResult.value.value.cacheKey });
        }
      }

      // Generate a miss
      await registry.dispatch('cache.get', { cacheKey: 'nonexistent' });

      const result = await registry.dispatch<void, Result<CacheStats, { type: string; message: string }>>(
        'cache.getStats',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.entries).toBe(3);
        expect(result.value.value.totalSize).toBe(3000);
        expect(result.value.value.hitCount).toBe(2);
        expect(result.value.value.missCount).toBe(1);
        expect(result.value.value.hitRate).toBeCloseTo(0.667, 1);
      }
    });

    it('should track oldest entry age', async () => {
      await registry.dispatch('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData: createMockAudioData(1024),
      });

      // Wait well past the asserted floor (>=50ms) so CI timer jitter / coarse
      // Date.now() resolution can't make the measured age dip under it (de-flake).
      await new Promise((resolve) => setTimeout(resolve, 120));

      const result = await registry.dispatch<void, Result<CacheStats, { type: string; message: string }>>(
        'cache.getStats',
        undefined,
      );

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.oldestEntryAgeMs).toBeGreaterThanOrEqual(50);
      }
    });
  });

  describe('Eviction Flow', () => {
    beforeEach(async () => {
      // Initialize with small limits for testing
      await registry.dispatch('cache.init', {
        config: {
          maxSizeBytes: 5000, // 5KB
          evictionThresholdPercent: 80, // 4KB
          evictionTargetPercent: 50, // 2.5KB
        },
      });
    });

    it('should not evict when under threshold', async () => {
      // Add 2KB (under 4KB threshold)
      await registry.dispatch('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData: createMockAudioData(2000),
      });

      const result = await registry.dispatch<
        { force?: boolean },
        Result<{ triggered: boolean; entriesEvicted: number; bytesFreed: number }, { type: string; message: string }>
      >('cache.evict', {});

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.triggered).toBe(false);
        expect(result.value.value.entriesEvicted).toBe(0);
      }
    });

    it('should evict when over threshold', async () => {
      // Add 4.5KB (over 4KB threshold)
      for (let i = 0; i < 5; i++) {
        await registry.dispatch('cache.set', {
          url: 'https://example.com/article',
          paragraphIndex: i,
          provider: 'openai',
          voice: 'alloy',
          audioData: createMockAudioData(900), // 900 bytes each = 4.5KB
        });
      }

      const result = await registry.dispatch<
        { force?: boolean },
        Result<{ triggered: boolean; entriesEvicted: number; bytesFreed: number }, { type: string; message: string }>
      >('cache.evict', {});

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.triggered).toBe(true);
        expect(result.value.value.entriesEvicted).toBeGreaterThan(0);
      }
    });

    it('should evict least recently used entries first', async () => {
      // Add entries with different access patterns
      const keys: string[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await registry.dispatch<
          {
            url: string;
            paragraphIndex: number;
            provider: string;
            voice: string;
            audioData: ArrayBuffer;
          },
          Result<{ cacheKey: string }, { type: string; message: string }>
        >('cache.set', {
          url: 'https://example.com/article',
          paragraphIndex: i,
          provider: 'openai',
          voice: 'alloy',
          audioData: createMockAudioData(900),
        });
        if (result.ok && result.value.ok) keys.push(result.value.value.cacheKey);
      }

      // Access the last entry to make it "fresh"
      await registry.dispatch('cache.get', { cacheKey: keys[4] });

      // Force eviction
      await registry.dispatch('cache.evict', { force: true });

      // The last entry (most recently accessed) should still exist
      const lastEntry = await registry.dispatch<
        { cacheKey: string },
        Result<CacheEntry | null, { type: string; message: string }>
      >('cache.get', { cacheKey: keys[4] });
      expect(lastEntry.ok && lastEntry.value.ok && lastEntry.value.value).not.toBeNull();
    });
  });

  describe('Cleanup Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('cache.init', {
        config: { maxAgeMs: 100 }, // 100ms for testing
      });
    });

    it('should remove stale entries', async () => {
      // Add an entry
      await registry.dispatch('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData: createMockAudioData(1024),
      });

      // Wait for it to become stale
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = await registry.dispatch<
        void,
        Result<{ entriesRemoved: number; staleEntriesRemoved: number; bytesFreed: number }, { type: string; message: string }>
      >('cache.cleanup', undefined);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.staleEntriesRemoved).toBe(1);
      }
      expect(cacheState.entries.size).toBe(0);
    });

    it('should not remove fresh entries', async () => {
      // Add an entry
      await registry.dispatch('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData: createMockAudioData(1024),
      });

      // Run cleanup immediately (entry is fresh)
      const result = await registry.dispatch<
        void,
        Result<{ entriesRemoved: number; staleEntriesRemoved: number; bytesFreed: number }, { type: string; message: string }>
      >('cache.cleanup', undefined);

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.staleEntriesRemoved).toBe(0);
      }
      expect(cacheState.entries.size).toBe(1);
    });
  });

  describe('Get Cached Paragraphs Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('cache.init', {});
    });

    it('should return cached paragraph indices for URL', async () => {
      // Add paragraphs 0, 2, 5 for the URL
      for (const index of [0, 2, 5]) {
        await registry.dispatch('cache.set', {
          url: 'https://example.com/article',
          paragraphIndex: index,
          provider: 'openai',
          voice: 'alloy',
          audioData: createMockAudioData(1024),
        });
      }

      const result = await registry.dispatch<
        { url: string; provider: string; voice: string },
        Result<number[], { type: string; message: string }>
      >('cache.getCachedParagraphs', {
        url: 'https://example.com/article',
        provider: 'openai',
        voice: 'alloy',
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value).toEqual([0, 2, 5]);
      }
    });

    it('should return empty array for uncached URL', async () => {
      const result = await registry.dispatch<
        { url: string; provider: string; voice: string },
        Result<number[], { type: string; message: string }>
      >('cache.getCachedParagraphs', {
        url: 'https://example.com/nonexistent',
        provider: 'openai',
        voice: 'alloy',
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value).toEqual([]);
      }
    });

    it('should filter by provider and voice', async () => {
      // Add same paragraph with different providers
      await registry.dispatch('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData: createMockAudioData(1024),
      });

      await registry.dispatch('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 1,
        provider: 'elevenlabs',
        voice: 'rachel',
        audioData: createMockAudioData(1024),
      });

      const openaiResult = await registry.dispatch<
        { url: string; provider: string; voice: string },
        Result<number[], { type: string; message: string }>
      >('cache.getCachedParagraphs', {
        url: 'https://example.com/article',
        provider: 'openai',
        voice: 'alloy',
      });

      expect(openaiResult.ok).toBe(true);
      if (openaiResult.ok && openaiResult.value.ok) {
        expect(openaiResult.value.value).toEqual([0]);
      }

      const elevenResult = await registry.dispatch<
        { url: string; provider: string; voice: string },
        Result<number[], { type: string; message: string }>
      >('cache.getCachedParagraphs', {
        url: 'https://example.com/article',
        provider: 'elevenlabs',
        voice: 'rachel',
      });

      expect(elevenResult.ok).toBe(true);
      if (elevenResult.ok && elevenResult.value.ok) {
        expect(elevenResult.value.value).toEqual([1]);
      }
    });
  });

  describe('Error Handling', () => {
    it('should fail operations when not initialized', async () => {
      const result = await registry.dispatch<
        {
          url: string;
          paragraphIndex: number;
          provider: string;
          voice: string;
          audioData: ArrayBuffer;
        },
        Result<{ cacheKey: string }, { type: string; message: string }>
      >('cache.set', {
        url: 'https://example.com/article',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        audioData: createMockAudioData(1024),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });
  });
});
