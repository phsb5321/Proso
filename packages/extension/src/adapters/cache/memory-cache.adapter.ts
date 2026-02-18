/**
 * In-Memory Cache Adapter
 *
 * Adapter implementing ICacheStore port using in-memory Map.
 * For testing and development - no persistence.
 *
 * @module adapters/cache/memory-cache
 */

import type { CacheError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Ok } from '../../core/shared/result';
import type { CacheEntry, CacheKey, CacheStats, ICacheStore } from '../../ports/cache-store.port';

/**
 * Internal storage entry with metadata.
 */
interface StorageEntry {
  key: CacheKey;
  entry: CacheEntry;
}

/**
 * Convert CacheKey to string for Map key.
 */
function keyToString(key: CacheKey): string {
  return `${key.urlHash}:${key.paragraphIndex}:${key.provider}:${key.voice}:${key.contentHash}`;
}

/**
 * In-memory cache adapter using Map.
 *
 * Features:
 * - Fast O(1) lookups
 * - No persistence (cleared on page refresh)
 * - LRU-like eviction when maxSizeBytes exceeded
 * - Suitable for testing and development
 */
export class InMemoryCacheAdapter implements ICacheStore {
  private readonly storage = new Map<string, StorageEntry>();
  private readonly maxSizeBytes: number;
  private readonly maxEntries: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(options: { maxSizeBytes?: number; maxEntries?: number } = {}) {
    this.maxSizeBytes = options.maxSizeBytes ?? 100 * 1024 * 1024; // 100MB default
    this.maxEntries = options.maxEntries ?? 1000;
  }

  async get(key: CacheKey): Promise<Result<CacheEntry | null, CacheError>> {
    const keyStr = keyToString(key);
    const stored = this.storage.get(keyStr);

    if (!stored) {
      this.missCount++;
      return Ok(null);
    }

    this.hitCount++;

    // Update access metadata
    const now = Date.now();
    const updatedEntry: CacheEntry = {
      ...stored.entry,
      lastAccessedAt: now,
      accessCount: stored.entry.accessCount + 1,
    };

    this.storage.set(keyStr, { key, entry: updatedEntry });

    return Ok(updatedEntry);
  }

  async set(key: CacheKey, entry: CacheEntry): Promise<Result<void, CacheError>> {
    const keyStr = keyToString(key);

    // Check if we need to evict
    if (!this.storage.has(keyStr)) {
      await this.evictIfNeeded();
    }

    this.storage.set(keyStr, { key, entry });
    return Ok(undefined);
  }

  async delete(key: CacheKey): Promise<Result<boolean, CacheError>> {
    const keyStr = keyToString(key);
    const deleted = this.storage.delete(keyStr);
    return Ok(deleted);
  }

  async clear(urlFilter?: string): Promise<Result<number, CacheError>> {
    if (!urlFilter) {
      const count = this.storage.size;
      this.storage.clear();
      this.hitCount = 0;
      this.missCount = 0;
      return Ok(count);
    }

    let count = 0;
    for (const [keyStr, stored] of this.storage) {
      if (stored.key.urlHash === urlFilter) {
        this.storage.delete(keyStr);
        count++;
      }
    }
    return Ok(count);
  }

  async has(key: CacheKey): Promise<boolean> {
    const keyStr = keyToString(key);
    return this.storage.has(keyStr);
  }

  async getStats(): Promise<CacheStats> {
    let totalSizeBytes = 0;
    let oldestAgeMs: number | null = null;
    const now = Date.now();

    for (const { entry } of this.storage.values()) {
      totalSizeBytes += entry.sizeBytes;
      const age = now - entry.createdAt;
      if (oldestAgeMs === null || age > oldestAgeMs) {
        oldestAgeMs = age;
      }
    }

    return {
      entries: this.storage.size,
      totalSizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      hitCount: this.hitCount,
      missCount: this.missCount,
      oldestEntryAgeMs: oldestAgeMs,
    };
  }

  async evictIfNeeded(): Promise<Result<number, CacheError>> {
    const stats = await this.getStats();

    // Check if eviction needed
    const sizeThreshold = this.maxSizeBytes * 0.9;
    const entryThreshold = this.maxEntries * 0.9;

    if (stats.totalSizeBytes < sizeThreshold && stats.entries < entryThreshold) {
      return Ok(0);
    }

    // Evict LRU entries until we're at 70% capacity
    const targetSize = this.maxSizeBytes * 0.7;
    const targetEntries = this.maxEntries * 0.7;

    // Sort entries by last accessed time (oldest first)
    const entries = [...this.storage.entries()].sort(
      (a, b) => a[1].entry.lastAccessedAt - b[1].entry.lastAccessedAt,
    );

    let evicted = 0;
    let currentSize = stats.totalSizeBytes;
    let currentEntries = stats.entries;

    for (const [keyStr, stored] of entries) {
      if (currentSize <= targetSize && currentEntries <= targetEntries) {
        break;
      }

      this.storage.delete(keyStr);
      currentSize -= stored.entry.sizeBytes;
      currentEntries--;
      evicted++;
    }

    return Ok(evicted);
  }

  /**
   * Reset stats (for testing).
   */
  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get internal storage size (for testing).
   */
  get size(): number {
    return this.storage.size;
  }
}
