/**
 * Unit tests for cache index
 *
 * @module tests/unit/cache/cache-index.test
 */

import { CacheIndexManager, createCacheIndex } from '../../../src/utils/cache/cache-index';
import type { CacheIndexEntry, CacheConfig } from '../../../src/utils/cache/types';
import { cacheDefaults } from '../../../src/utils/config/defaults';

describe('CacheIndexManager', () => {
  let index: CacheIndexManager;

  const testConfig: Partial<CacheConfig> = {
    maxSizeBytes: 100 * 1024 * 1024, // 100MB for testing
    maxEntries: 100,
    evictionThresholdPercent: 90,
    evictionTargetPercent: 70,
  };

  const testEntry: CacheIndexEntry = {
    cacheKey: 'example.com/article:0:openai:alloy:hash123',
    paragraphIndex: 0,
    provider: 'openai',
    voice: 'alloy',
    contentHash: 'hash123',
    size: 1024 * 100, // 100KB
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  };

  const testUrl = 'https://example.com/article';

  beforeEach(() => {
    index = createCacheIndex(testConfig);
  });

  describe('basic operations', () => {
    it('should start empty', () => {
      expect(index.entryCount).toBe(0);
      expect(index.totalSize).toBe(0);
    });

    it('should add entry with set()', () => {
      index.set(testUrl, testEntry);
      expect(index.entryCount).toBe(1);
      expect(index.totalSize).toBe(testEntry.size);
    });

    it('should check existence with has()', () => {
      expect(index.has(testEntry.cacheKey)).toBe(false);
      index.set(testUrl, testEntry);
      expect(index.has(testEntry.cacheKey)).toBe(true);
    });

    it('should retrieve entry with get()', () => {
      index.set(testUrl, testEntry);
      const retrieved = index.get(testEntry.cacheKey);
      expect(retrieved).toEqual(testEntry);
    });

    it('should return null for non-existent key', () => {
      expect(index.get('nonexistent')).toBeNull();
    });

    it('should delete entry', () => {
      index.set(testUrl, testEntry);
      expect(index.delete(testEntry.cacheKey)).toBe(true);
      expect(index.has(testEntry.cacheKey)).toBe(false);
      expect(index.entryCount).toBe(0);
      expect(index.totalSize).toBe(0);
    });

    it('should return false when deleting non-existent entry', () => {
      expect(index.delete('nonexistent')).toBe(false);
    });
  });

  describe('multiple entries', () => {
    it('should handle multiple entries for same URL', () => {
      const now = Date.now();
      const entry1: CacheIndexEntry = {
        paragraphIndex: 0,
        cacheKey: 'example.com/article:0:openai:alloy:hash1',
        provider: 'openai',
        voice: 'alloy',
        contentHash: 'hash1',
        size: 1024,
        createdAt: now,
        lastAccessedAt: now,
      };
      const entry2: CacheIndexEntry = {
        paragraphIndex: 1,
        cacheKey: 'example.com/article:1:openai:alloy:hash2',
        provider: 'openai',
        voice: 'alloy',
        contentHash: 'hash2',
        size: 2048,
        createdAt: now,
        lastAccessedAt: now,
      };

      index.set(testUrl, entry1);
      index.set(testUrl, entry2);

      expect(index.entryCount).toBe(2);
      expect(index.totalSize).toBe(entry1.size + entry2.size);
    });

    it('should update existing entry', () => {
      index.set(testUrl, testEntry);
      const updatedEntry: CacheIndexEntry = {
        ...testEntry,
        size: 2048,
      };
      index.set(testUrl, updatedEntry);

      expect(index.entryCount).toBe(1);
      expect(index.totalSize).toBe(2048);
    });

    it('should delete all entries for URL', () => {
      const now = Date.now();
      const entry1: CacheIndexEntry = {
        paragraphIndex: 0,
        cacheKey: 'example.com/article:0:openai:alloy:hash1',
        provider: 'openai',
        voice: 'alloy',
        contentHash: 'hash1',
        size: 1024,
        createdAt: now,
        lastAccessedAt: now,
      };
      const entry2: CacheIndexEntry = {
        paragraphIndex: 1,
        cacheKey: 'example.com/article:1:openai:alloy:hash2',
        provider: 'openai',
        voice: 'alloy',
        contentHash: 'hash2',
        size: 2048,
        createdAt: now,
        lastAccessedAt: now,
      };

      index.set(testUrl, entry1);
      index.set(testUrl, entry2);

      const removed = index.deleteForUrl(testUrl);
      expect(removed).toBe(2);
      expect(index.entryCount).toBe(0);
    });
  });

  describe('clear()', () => {
    it('should remove all entries', () => {
      index.set(testUrl, testEntry);
      const now = Date.now();
      index.set('https://other.com/page', {
        paragraphIndex: 0,
        cacheKey: 'other.com/page:0:openai:alloy:hash',
        provider: 'openai',
        voice: 'alloy',
        contentHash: 'hash',
        size: 1024,
        createdAt: now,
        lastAccessedAt: now,
      });

      const count = index.clear();
      expect(count).toBe(2);
      expect(index.entryCount).toBe(0);
      expect(index.totalSize).toBe(0);
    });
  });

  describe('touch()', () => {
    it('should update lastAccessedAt', () => {
      const oldTime = Date.now() - 1000;
      const entry: CacheIndexEntry = {
        ...testEntry,
        lastAccessedAt: oldTime,
      };
      index.set(testUrl, entry);

      index.touch(testEntry.cacheKey);

      const retrieved = index.get(testEntry.cacheKey);
      expect(retrieved?.lastAccessedAt).toBeGreaterThan(oldTime);
    });
  });

  describe('hit/miss tracking', () => {
    it('should record hits', () => {
      index.recordHit();
      index.recordHit();
      const stats = index.getStats();
      expect(stats.hitCount).toBe(2);
    });

    it('should record misses', () => {
      index.recordMiss();
      const stats = index.getStats();
      expect(stats.missCount).toBe(1);
    });

    it('should calculate hit rate', () => {
      index.recordHit();
      index.recordHit();
      index.recordHit();
      index.recordMiss();
      const stats = index.getStats();
      expect(stats.hitRate).toBe(0.75); // 3/4 = 0.75 (decimal)
    });
  });

  describe('getCachedParagraphs()', () => {
    it('should return sorted paragraph indices for URL', () => {
      const now = Date.now();
      const entries: CacheIndexEntry[] = [
        { cacheKey: 'ex:3:o:a:h', paragraphIndex: 3, provider: 'openai', voice: 'alloy', contentHash: 'h3', size: 100, createdAt: now, lastAccessedAt: now },
        { cacheKey: 'ex:1:o:a:h', paragraphIndex: 1, provider: 'openai', voice: 'alloy', contentHash: 'h1', size: 100, createdAt: now, lastAccessedAt: now },
        { cacheKey: 'ex:5:o:a:h', paragraphIndex: 5, provider: 'openai', voice: 'alloy', contentHash: 'h5', size: 100, createdAt: now, lastAccessedAt: now },
      ];

      for (const entry of entries) {
        index.set(testUrl, entry);
      }

      const cached = index.getCachedParagraphs(testUrl);
      expect(cached).toEqual([1, 3, 5]);
    });

    it('should return empty array for unknown URL', () => {
      expect(index.getCachedParagraphs('https://unknown.com')).toEqual([]);
    });
  });

  describe('getEntriesByAge()', () => {
    it('should return entries sorted by lastAccessedAt ascending', () => {
      const now = Date.now();
      const entries: CacheIndexEntry[] = [
        { cacheKey: 'k1', paragraphIndex: 0, provider: 'openai', voice: 'alloy', contentHash: 'h1', size: 100, createdAt: now - 1000, lastAccessedAt: now - 1000 },
        { cacheKey: 'k2', paragraphIndex: 1, provider: 'openai', voice: 'alloy', contentHash: 'h2', size: 100, createdAt: now - 3000, lastAccessedAt: now - 3000 },
        { cacheKey: 'k3', paragraphIndex: 2, provider: 'openai', voice: 'alloy', contentHash: 'h3', size: 100, createdAt: now - 2000, lastAccessedAt: now - 2000 },
      ];

      for (const entry of entries) {
        index.set(testUrl, entry);
      }

      const sorted = index.getEntriesByAge();
      expect(sorted[0].cacheKey).toBe('k2'); // Oldest
      expect(sorted[1].cacheKey).toBe('k3');
      expect(sorted[2].cacheKey).toBe('k1'); // Newest
    });
  });

  describe('eviction', () => {
    it('should detect when eviction is needed by size', () => {
      const config: CacheConfig = {
        ...cacheDefaults,
        maxSizeBytes: 1000,
        evictionThresholdPercent: 90,
        evictionTargetPercent: 70,
      };
      const idx = createCacheIndex(config);

      // Add entry that's 95% of max size
      const now = Date.now();
      idx.set(testUrl, {
        paragraphIndex: 0,
        cacheKey: 'k1',
        provider: 'openai',
        voice: 'alloy',
        contentHash: 'h1',
        size: 950,
        createdAt: now,
        lastAccessedAt: now,
      });

      expect(idx.needsEviction(config)).toBe(true);
    });

    it('should not need eviction when under threshold', () => {
      const config: CacheConfig = {
        ...cacheDefaults,
        maxSizeBytes: 1000,
        evictionThresholdPercent: 90,
        evictionTargetPercent: 70,
      };
      const idx = createCacheIndex(config);

      // Add entry that's 50% of max size
      const now = Date.now();
      idx.set(testUrl, {
        cacheKey: 'k1',
        paragraphIndex: 0,
        provider: 'openai',
        voice: 'alloy',
        contentHash: 'h1',
        size: 500,
        createdAt: now,
        lastAccessedAt: now,
      });

      expect(idx.needsEviction(config)).toBe(false);
    });

    it('should return eviction candidates to reach target', () => {
      const config: CacheConfig = {
        ...cacheDefaults,
        maxSizeBytes: 1000,
        maxEntries: 100,
        evictionThresholdPercent: 90,
        evictionTargetPercent: 70,
      };
      const idx = createCacheIndex(config);
      const now = Date.now();

      // Add entries totaling 950 bytes (95% full)
      idx.set(testUrl, { cacheKey: 'k1', paragraphIndex: 0, provider: 'openai', voice: 'alloy', contentHash: 'h1', size: 300, createdAt: now - 3000, lastAccessedAt: now - 3000 });
      idx.set(testUrl, { cacheKey: 'k2', paragraphIndex: 1, provider: 'openai', voice: 'alloy', contentHash: 'h2', size: 300, createdAt: now - 2000, lastAccessedAt: now - 2000 });
      idx.set(testUrl, { cacheKey: 'k3', paragraphIndex: 2, provider: 'openai', voice: 'alloy', contentHash: 'h3', size: 350, createdAt: now - 1000, lastAccessedAt: now - 1000 });

      const candidates = idx.getEvictionCandidates(config);
      // Should evict oldest entries to get under 700 bytes (70%)
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].cacheKey).toBe('k1'); // Oldest first
    });
  });

  describe('stale entries', () => {
    it('should identify stale entries', () => {
      const now = Date.now();
      const maxAgeMs = 1000 * 60 * 60; // 1 hour

      const entries: CacheIndexEntry[] = [
        { cacheKey: 'k1', paragraphIndex: 0, provider: 'openai', voice: 'alloy', contentHash: 'h1', size: 100, createdAt: now - maxAgeMs - 1000, lastAccessedAt: now - maxAgeMs - 1000 }, // Stale
        { cacheKey: 'k2', paragraphIndex: 1, provider: 'openai', voice: 'alloy', contentHash: 'h2', size: 100, createdAt: now - 1000, lastAccessedAt: now - 1000 }, // Fresh
      ];

      for (const entry of entries) {
        index.set(testUrl, entry);
      }

      const stale = index.getStaleEntries(maxAgeMs);
      expect(stale.length).toBe(1);
      expect(stale[0].cacheKey).toBe('k1');
    });
  });

  describe('getStats()', () => {
    it('should return correct statistics', () => {
      index.set(testUrl, testEntry);
      index.recordHit();
      index.recordMiss();

      const stats = index.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.totalSize).toBe(testEntry.size);
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(0.5); // 1/2 = 0.5
      // Note: sizePercentage not in CacheStats type, calculate manually if needed
      const sizePercentage = (stats.totalSize / stats.maxSize) * 100;
      expect(sizePercentage).toBeGreaterThan(0);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize index', () => {
      index.set(testUrl, testEntry);
      index.recordHit();

      const data = index.toData();
      const newIndex = createCacheIndex(testConfig);
      newIndex.loadFromData(data);

      expect(newIndex.entryCount).toBe(1);
      expect(newIndex.has(testEntry.cacheKey)).toBe(true);
    });
  });
});
