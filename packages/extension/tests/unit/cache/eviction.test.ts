/**
 * Eviction Module Unit Tests
 * Tests for src/utils/cache/eviction.ts
 *
 * @module tests/unit/cache/eviction
 */

import {
  calculateEvictionScore,
  scoreEntriesForEviction,
  calculateEvictionTargets,
  selectEntriesForEviction,
  needsEviction,
  getStaleEntries,
  createEvictionResult,
  createCleanupResult,
  createEvictionStats,
  updateEvictionStats,
  type EvictionCandidate,
} from '../../../src/utils/cache/eviction';
import type { CacheIndexEntry, CacheConfig, EvictionResult } from '../../../src/utils/cache/types';
import { cacheDefaults } from '../../../src/utils/config/defaults';

describe('Eviction Module', () => {
  // Mock entry helper - uses only CacheIndexEntry fields
  const createMockEntry = (
    overrides: Partial<CacheIndexEntry & { url: string }> = {}
  ): CacheIndexEntry & { url: string } => {
    const now = Date.now();
    return {
      url: 'https://example.com/page',
      cacheKey: 'test-key-123',
      paragraphIndex: 0,
      provider: 'openai',
      voice: 'alloy',
      contentHash: 'hash123',
      size: 50000, // 50KB
      createdAt: now - 1800000, // 30 min ago
      lastAccessedAt: now - 1800000, // 30 min ago
      ...overrides,
    };
  };

  describe('calculateEvictionScore', () => {
    const maxCacheSize = 100 * 1024 * 1024; // 100MB

    it('should calculate higher score for older entries', () => {
      const oldEntry = createMockEntry({
        lastAccessedAt: Date.now() - 3600000 * 24, // 24 hours ago
      });
      const newEntry = createMockEntry({
        lastAccessedAt: Date.now() - 60000, // 1 minute ago
      });

      const oldScore = calculateEvictionScore(oldEntry, maxCacheSize);
      const newScore = calculateEvictionScore(newEntry, maxCacheSize);

      expect(oldScore).toBeGreaterThan(newScore);
    });

    it('should calculate higher score for larger entries', () => {
      const now = Date.now();
      const largeEntry = createMockEntry({
        size: 5 * 1024 * 1024, // 5MB
        lastAccessedAt: now - 1000,
      });
      const smallEntry = createMockEntry({
        size: 100 * 1024, // 100KB
        lastAccessedAt: now - 1000,
      });

      const largeScore = calculateEvictionScore(largeEntry, maxCacheSize);
      const smallScore = calculateEvictionScore(smallEntry, maxCacheSize);

      expect(largeScore).toBeGreaterThan(smallScore);
    });

    it('should return positive score for valid entries', () => {
      const entry = createMockEntry();
      const score = calculateEvictionScore(entry, maxCacheSize);

      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scoreEntriesForEviction', () => {
    it('should sort entries by score descending (highest first)', () => {
      const now = Date.now();
      const entries = [
        createMockEntry({ lastAccessedAt: now - 1000, cacheKey: 'new' }),
        createMockEntry({ lastAccessedAt: now - 3600000, cacheKey: 'old' }),
        createMockEntry({ lastAccessedAt: now - 60000, cacheKey: 'medium' }),
      ];

      const maxCacheSize = 100 * 1024 * 1024;
      const scored = scoreEntriesForEviction(entries, maxCacheSize, now);

      // Oldest entry should be first (highest score)
      expect(scored[0].cacheKey).toBe('old');
      expect(scored[2].cacheKey).toBe('new');
    });

    it('should add score property to all entries', () => {
      const entries = [createMockEntry(), createMockEntry({ cacheKey: 'key2' })];
      const maxCacheSize = 100 * 1024 * 1024;

      const scored = scoreEntriesForEviction(entries, maxCacheSize);

      for (const entry of scored) {
        expect(typeof entry.score).toBe('number');
      }
    });
  });

  describe('calculateEvictionTargets', () => {
    const config: CacheConfig = {
      ...cacheDefaults,
      maxSizeBytes: 100 * 1024 * 1024, // 100MB
      maxEntries: 1000,
      evictionTargetPercent: 80,
    };

    it('should calculate bytes to free when over target', () => {
      const currentSize = 95 * 1024 * 1024; // 95MB
      const currentEntries = 500;

      const targets = calculateEvictionTargets(currentSize, currentEntries, config);

      // Target is 80% = 80MB, so need to free 15MB
      expect(targets.bytesToFree).toBeGreaterThan(0);
      expect(targets.targetSize).toBe(80 * 1024 * 1024);
    });

    it('should return 0 bytes to free when under target', () => {
      const currentSize = 50 * 1024 * 1024; // 50MB
      const currentEntries = 300;

      const targets = calculateEvictionTargets(currentSize, currentEntries, config);

      expect(targets.bytesToFree).toBe(0);
    });

    it('should calculate entries to free when over target', () => {
      const currentSize = 50 * 1024 * 1024;
      const currentEntries = 900;

      const targets = calculateEvictionTargets(currentSize, currentEntries, config);

      // Target is 80% = 800 entries, so need to free 100
      expect(targets.entriesToFree).toBe(100);
    });
  });

  describe('selectEntriesForEviction', () => {
    const config: CacheConfig = {
      ...cacheDefaults,
      maxSizeBytes: 100 * 1024 * 1024, // 100MB
      maxEntries: 100,
      evictionThresholdPercent: 90,
      evictionTargetPercent: 80,
    };

    it('should return empty array when no eviction needed', () => {
      const entries = [createMockEntry({ size: 1024 })];
      const currentSize = 10 * 1024 * 1024; // 10MB
      const currentEntries = 10;

      const toEvict = selectEntriesForEviction(entries, currentSize, currentEntries, config);

      expect(toEvict.length).toBe(0);
    });

    it('should select oldest entries first', () => {
      const now = Date.now();
      const entries = [
        createMockEntry({ cacheKey: 'new', lastAccessedAt: now - 1000, size: 10 * 1024 * 1024 }),
        createMockEntry({ cacheKey: 'old', lastAccessedAt: now - 3600000, size: 10 * 1024 * 1024 }),
        createMockEntry({ cacheKey: 'medium', lastAccessedAt: now - 60000, size: 10 * 1024 * 1024 }),
      ];

      const currentSize = 95 * 1024 * 1024;
      const currentEntries = 3;

      const toEvict = selectEntriesForEviction(entries, currentSize, currentEntries, config);

      // Should include the oldest entry
      expect(toEvict.some((e) => e.cacheKey === 'old')).toBe(true);
    });
  });

  describe('needsEviction', () => {
    const config: CacheConfig = {
      ...cacheDefaults,
      maxSizeBytes: 100 * 1024 * 1024,
      maxEntries: 100,
      evictionThresholdPercent: 90,
    };

    it('should return true when size exceeds threshold', () => {
      const currentSize = 95 * 1024 * 1024; // 95% full
      const currentEntries = 50;

      expect(needsEviction(currentSize, currentEntries, config)).toBe(true);
    });

    it('should return true when entries exceed threshold', () => {
      const currentSize = 50 * 1024 * 1024;
      const currentEntries = 95; // 95% of max

      expect(needsEviction(currentSize, currentEntries, config)).toBe(true);
    });

    it('should return false when under threshold', () => {
      const currentSize = 80 * 1024 * 1024; // 80%
      const currentEntries = 80; // 80%

      expect(needsEviction(currentSize, currentEntries, config)).toBe(false);
    });
  });

  describe('getStaleEntries', () => {
    it('should return entries older than max age', () => {
      const now = Date.now();
      const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

      const entries = [
        createMockEntry({ cacheKey: 'fresh', lastAccessedAt: now - 1000 }),
        createMockEntry({ cacheKey: 'stale', lastAccessedAt: now - 48 * 3600000 }), // 48 hours
        createMockEntry({ cacheKey: 'borderline', lastAccessedAt: now - 23 * 3600000 }), // 23 hours
      ];

      const stale = getStaleEntries(entries, maxAgeMs, now);

      expect(stale.length).toBe(1);
      expect(stale[0].cacheKey).toBe('stale');
    });

    it('should return empty array when no stale entries', () => {
      const now = Date.now();
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days

      const entries = [
        createMockEntry({ lastAccessedAt: now - 1000 }),
        createMockEntry({ lastAccessedAt: now - 3600000 }),
      ];

      const stale = getStaleEntries(entries, maxAgeMs, now);

      expect(stale.length).toBe(0);
    });
  });

  describe('createEvictionResult', () => {
    it('should create result with correct properties', () => {
      const startTime = Date.now() - 100;
      const result = createEvictionResult(true, 5, 1024 * 1024, 'size_limit', startTime);

      expect(result.triggered).toBe(true);
      expect(result.entriesEvicted).toBe(5);
      expect(result.bytesFreed).toBe(1024 * 1024);
      expect(result.reason).toBe('size_limit');
      expect(result.durationMs).toBeGreaterThanOrEqual(100);
    });
  });

  describe('createCleanupResult', () => {
    it('should create result with combined entry count', () => {
      const startTime = Date.now() - 50;
      const result = createCleanupResult(10, 2, 5 * 1024 * 1024, startTime);

      expect(result.entriesRemoved).toBe(12); // 10 + 2
      expect(result.staleEntriesRemoved).toBe(10);
      expect(result.corruptEntriesRemoved).toBe(2);
      expect(result.bytesFreed).toBe(5 * 1024 * 1024);
      expect(result.durationMs).toBeGreaterThanOrEqual(50);
    });
  });

  describe('EvictionStats', () => {
    it('should create initial stats with zero values', () => {
      const stats = createEvictionStats();

      expect(stats.totalEvictions).toBe(0);
      expect(stats.totalBytesFreed).toBe(0);
      expect(stats.totalEntriesEvicted).toBe(0);
      expect(stats.averageBatchSize).toBe(0);
      expect(stats.lastEvictionTime).toBeNull();
    });

    it('should update stats after eviction', () => {
      let stats = createEvictionStats();
      const result: EvictionResult = {
        triggered: true,
        entriesEvicted: 5,
        bytesFreed: 1024 * 1024,
        reason: 'size_limit',
        durationMs: 100,
      };

      stats = updateEvictionStats(stats, result);

      expect(stats.totalEvictions).toBe(1);
      expect(stats.totalEntriesEvicted).toBe(5);
      expect(stats.totalBytesFreed).toBe(1024 * 1024);
      expect(stats.averageBatchSize).toBe(5);
      expect(stats.lastEvictionTime).not.toBeNull();
    });

    it('should not update stats when no eviction occurred', () => {
      const stats = createEvictionStats();
      const result: EvictionResult = {
        triggered: false,
        entriesEvicted: 0,
        bytesFreed: 0,
        reason: 'none',
        durationMs: 10,
      };

      const updatedStats = updateEvictionStats(stats, result);

      expect(updatedStats.totalEvictions).toBe(0);
      expect(updatedStats.lastEvictionTime).toBeNull();
    });

    it('should calculate correct average batch size over multiple evictions', () => {
      let stats = createEvictionStats();

      const result1: EvictionResult = {
        triggered: true,
        entriesEvicted: 10,
        bytesFreed: 1024,
        reason: 'size_limit',
        durationMs: 100,
      };
      stats = updateEvictionStats(stats, result1);

      const result2: EvictionResult = {
        triggered: true,
        entriesEvicted: 20,
        bytesFreed: 2048,
        reason: 'entry_limit',
        durationMs: 50,
      };
      stats = updateEvictionStats(stats, result2);

      expect(stats.totalEvictions).toBe(2);
      expect(stats.totalEntriesEvicted).toBe(30);
      expect(stats.averageBatchSize).toBe(15); // (10 + 20) / 2
    });
  });
});
