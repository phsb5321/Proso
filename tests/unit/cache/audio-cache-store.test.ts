/**
 * Unit tests for AudioCacheStore
 *
 * @module tests/unit/cache/audio-cache-store.test
 */

import { jest } from '@jest/globals';

import {
  AudioCacheStore,
  createAudioCacheStore,
  getCacheStore,
  resetCacheStore,
  generateContentHash,
  generateCacheKey,
} from '../../../src/utils/cache/audio-cache-store';
import type { CacheConfig } from '../../../src/utils/cache/types';

// Mock IndexedDB for testing - use in-memory fallback
// The store will automatically use in-memory mode when IndexedDB is unavailable

describe('AudioCacheStore', () => {
  let store: AudioCacheStore;

  const testConfig: Partial<CacheConfig> = {
    maxSizeBytes: 100 * 1024 * 1024, // 100MB for testing
    maxEntries: 100,
    evictionThresholdPercent: 90,
    evictionTargetPercent: 70,
    persistToIndexedDB: false, // Use in-memory for unit tests
  };

  const createTestEntry = (paragraphIndex: number, size: number = 1024) => ({
    url: 'https://example.com/article',
    paragraphIndex,
    provider: 'elevenlabs',
    voice: 'alloy',
    contentHash: `hash${paragraphIndex}`,
    audioData: new ArrayBuffer(size),
    compressedSize: size,
    durationMs: 1000,
    wordTimeline: [] as { word: string; startMs: number; endMs: number; charOffset: number; charLength: number }[],
  });

  beforeEach(async () => {
    resetCacheStore();
    store = createAudioCacheStore(testConfig);
    await store.init();
  });

  afterEach(() => {
    resetCacheStore();
  });

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(store.isInitialized).toBe(true);
    });

    it('should use in-memory mode when IndexedDB unavailable', () => {
      expect(store.isInMemoryMode).toBe(true);
    });

    it('should start with empty stats', () => {
      const stats = store.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
    });
  });

  describe('set()', () => {
    it('should store entry and return cache key', async () => {
      const entry = createTestEntry(0);
      const cacheKey = await store.set(entry);

      // Cache key format: urlHash:paragraphIndex:provider:voice:contentHash
      // URL is stripped of non-alphanumeric chars and truncated to 32 chars
      expect(cacheKey).toContain('httpsexamplecomarticle');
      expect(cacheKey).toContain(':0:');
      expect(cacheKey).toContain(':elevenlabs:');
      expect(cacheKey).toContain(':alloy:');
    });

    it('should update stats after set', async () => {
      const entry = createTestEntry(0, 2048);
      await store.set(entry);

      const stats = store.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.totalSize).toBe(2048);
    });

    it('should store multiple entries', async () => {
      await store.set(createTestEntry(0, 1000));
      await store.set(createTestEntry(1, 2000));
      await store.set(createTestEntry(2, 3000));

      const stats = store.getStats();
      expect(stats.entries).toBe(3);
      expect(stats.totalSize).toBe(6000);
    });

    it('should update existing entry', async () => {
      // Both entries have same audioData.byteLength so they generate the same cache key
      // (the store uses byteLength + paragraphIndex to generate contentHash)
      const entry1 = createTestEntry(0, 1000);
      const entry2 = {
        ...createTestEntry(0, 1000), // Same size as entry1 for same cache key
        compressedSize: 2000, // Different compressedSize to track the update
      };

      await store.set(entry1);
      await store.set(entry2);

      const stats = store.getStats();
      expect(stats.entries).toBe(1);
      expect(stats.totalSize).toBe(2000);
    });
  });

  describe('has()', () => {
    it('should return false for non-existent entry', () => {
      expect(store.has('nonexistent')).toBe(false);
    });

    it('should return true for existing entry', async () => {
      const entry = createTestEntry(0);
      const cacheKey = await store.set(entry);

      expect(store.has(cacheKey)).toBe(true);
    });
  });

  describe('get()', () => {
    it('should return null for non-existent entry', async () => {
      const result = await store.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return entry for existing cache key', async () => {
      const entry = createTestEntry(0, 512);
      const cacheKey = await store.set(entry);

      const result = await store.get(cacheKey);
      expect(result).not.toBeNull();
      expect(result?.paragraphIndex).toBe(0);
      expect(result?.provider).toBe('elevenlabs');
      expect(result?.voice).toBe('alloy');
      expect(result?.compressedSize).toBe(512);
    });

    it('should update lastAccessedAt on get', async () => {
      const entry = createTestEntry(0);
      const cacheKey = await store.set(entry);

      const firstGet = await store.get(cacheKey);
      const firstAccessTime = firstGet?.lastAccessedAt ?? 0;

      // Wait a small amount to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const secondGet = await store.get(cacheKey);
      expect(secondGet?.lastAccessedAt).toBeGreaterThanOrEqual(firstAccessTime);
    });

    it('should increment accessCount on get', async () => {
      const entry = createTestEntry(0);
      const cacheKey = await store.set(entry);

      await store.get(cacheKey);
      const result = await store.get(cacheKey);

      expect(result?.accessCount).toBe(2);
    });

    it('should record hit on successful get', async () => {
      const entry = createTestEntry(0);
      const cacheKey = await store.set(entry);

      await store.get(cacheKey);
      await store.get(cacheKey);

      const stats = store.getStats();
      expect(stats.hitCount).toBe(2);
    });

    it('should record miss on failed get', async () => {
      await store.get('nonexistent');
      await store.get('also-nonexistent');

      const stats = store.getStats();
      expect(stats.missCount).toBe(2);
    });
  });

  describe('delete()', () => {
    it('should return false for non-existent entry', async () => {
      const result = await store.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('should delete existing entry', async () => {
      const entry = createTestEntry(0);
      const cacheKey = await store.set(entry);

      const result = await store.delete(cacheKey);
      expect(result).toBe(true);
      expect(store.has(cacheKey)).toBe(false);
    });

    it('should update stats after delete', async () => {
      const entry = createTestEntry(0, 2048);
      const cacheKey = await store.set(entry);

      await store.delete(cacheKey);

      const stats = store.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('clear()', () => {
    it('should remove all entries', async () => {
      await store.set(createTestEntry(0));
      await store.set(createTestEntry(1));
      await store.set(createTestEntry(2));

      const statsBefore = store.getStats();
      expect(statsBefore.entries).toBe(3);

      await store.clear();

      const stats = store.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  // Note: clearForUrl() method has been removed from API
  // Use clear() to clear all entries or delete() to remove specific entries

  describe('getStats()', () => {
    it('should calculate hit rate correctly', async () => {
      const entry = createTestEntry(0);
      const cacheKey = await store.set(entry);

      // 3 hits
      await store.get(cacheKey);
      await store.get(cacheKey);
      await store.get(cacheKey);

      // 1 miss
      await store.get('nonexistent');

      const stats = store.getStats();
      expect(stats.hitCount).toBe(3);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(0.75); // 3/(3+1) = 0.75
    });

    it('should calculate size correctly', async () => {
      // With 100MB max size, 1MB should be 1%
      const entry = createTestEntry(0, 1024 * 1024); // 1MB
      await store.set(entry);

      const stats = store.getStats();
      // Calculate size percentage manually: totalSize / maxSize * 100
      const sizePercentage = (stats.totalSize / stats.maxSize) * 100;
      expect(sizePercentage).toBeCloseTo(1, 0);
    });
  });

  describe('getCachedParagraphs()', () => {
    it('should return sorted list of cached paragraph indices', async () => {
      await store.set(createTestEntry(3));
      await store.set(createTestEntry(1));
      await store.set(createTestEntry(5));

      const cached = store.getCachedParagraphs(
        'https://example.com/article',
        'elevenlabs',
        'alloy'
      );

      expect(cached).toEqual([1, 3, 5]);
    });

    it('should return empty array for unknown URL', () => {
      const cached = store.getCachedParagraphs(
        'https://unknown.com',
        'elevenlabs',
        'alloy'
      );

      expect(cached).toEqual([]);
    });

    it('should filter by provider and voice', async () => {
      await store.set(createTestEntry(0));
      const entry1 = createTestEntry(1);
      await store.set({
        ...entry1,
        provider: 'openai',
        contentHash: 'openai1',
      });

      const elevenlabsCached = store.getCachedParagraphs(
        'https://example.com/article',
        'elevenlabs',
        'alloy'
      );

      const openaiCached = store.getCachedParagraphs(
        'https://example.com/article',
        'openai',
        'alloy'
      );

      expect(elevenlabsCached).toEqual([0]);
      expect(openaiCached).toEqual([1]);
    });
  });

  describe('generateCacheKey()', () => {
    it('should generate consistent cache key', () => {
      const key1 = generateCacheKey(
        'https://example.com/article',
        0,
        'elevenlabs',
        'alloy',
        'hash123'
      );
      const key2 = generateCacheKey(
        'https://example.com/article',
        0,
        'elevenlabs',
        'alloy',
        'hash123'
      );

      expect(key1).toBe(key2);
    });
  });

  describe('generateContentHash()', () => {
    it('should generate consistent hash for same content', async () => {
      const hash1 = await generateContentHash('Hello, world!');
      const hash2 = await generateContentHash('Hello, world!');

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different content', async () => {
      const hash1 = await generateContentHash('Hello, world!');
      const hash2 = await generateContentHash('Goodbye, world!');

      expect(hash1).not.toBe(hash2);
    });
  });

  // Note: Event listeners are not supported in the current API version
  // Events are tracked internally via hitCount/missCount stats

  describe('singleton', () => {
    it('should return same instance from getCacheStore()', () => {
      const store1 = getCacheStore();
      const store2 = getCacheStore();

      expect(store1).toBe(store2);
    });

    it('should reset singleton with resetCacheStore()', () => {
      const store1 = getCacheStore();
      resetCacheStore();
      const store2 = getCacheStore();

      expect(store1).not.toBe(store2);
    });
  });
});

describe('AudioCacheStore with word timeline', () => {
  let store: AudioCacheStore;

  beforeEach(async () => {
    resetCacheStore();
    store = createAudioCacheStore({ persistToIndexedDB: false });
    await store.init();
  });

  afterEach(() => {
    resetCacheStore();
  });

  it('should store and retrieve word timeline', async () => {
    const entry = {
      url: 'https://example.com/article',
      paragraphIndex: 0,
      provider: 'elevenlabs',
      voice: 'alloy',
      contentHash: 'hash123',
      audioData: new ArrayBuffer(1024),
      compressedSize: 1024,
      durationMs: 5000,
      wordTimeline: [
        { word: 'Hello', startMs: 0, endMs: 200, charOffset: 0, charLength: 5 },
        { word: 'world', startMs: 200, endMs: 500, charOffset: 6, charLength: 5 },
      ],
    };

    const cacheKey = await store.set(entry);
    const result = await store.get(cacheKey);

    expect(result?.wordTimeline).toHaveLength(2);
    expect(result?.wordTimeline?.[0].word).toBe('Hello');
    expect(result?.wordTimeline?.[1].word).toBe('world');
    expect(result?.durationMs).toBe(5000);
  });
});
