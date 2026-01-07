/**
 * Mock Cache Store
 *
 * Mock implementation of ICacheStore for testing.
 * Uses in-memory Map for storage.
 *
 * @module tests/mocks/mock-cache-store
 */

import type {
  ICacheStore,
  CacheKey,
  CacheEntry,
  CacheStats,
} from '../../src/ports/cache-store.port';
import type { Result } from '../../src/core/shared/result';
import type { CacheError } from '../../src/core/shared/errors';
import { Ok, Err } from '../../src/core/shared/result';
import { cacheError } from '../../src/core/shared/errors';

/**
 * Configuration for mock cache store.
 */
export interface MockCacheStoreConfig {
  /** Maximum cache size in bytes */
  maxSizeBytes?: number;
  /** Force specific error on next operation */
  forceError?: CacheError | null;
  /** Simulate latency in ms */
  latencyMs?: number;
}

/**
 * Serialize cache key to string for Map storage.
 */
function keyToString(key: CacheKey): string {
  return `${key.urlHash}:${key.paragraphIndex}:${key.provider}:${key.voice}:${key.contentHash}`;
}

/**
 * Mock cache store for testing PlaybackService.
 */
export class MockCacheStore implements ICacheStore {
  private readonly cache = new Map<string, CacheEntry>();
  private maxSizeBytes: number;
  private forceError: CacheError | null;
  private latencyMs: number;
  private hitCount = 0;
  private missCount = 0;

  // Tracking for test assertions
  public getCalls: CacheKey[] = [];
  public setCalls: Array<{ key: CacheKey; entry: CacheEntry }> = [];
  public deleteCalls: CacheKey[] = [];
  public clearCalls: Array<string | undefined> = [];
  public hasCalls: CacheKey[] = [];

  constructor(config: MockCacheStoreConfig = {}) {
    this.maxSizeBytes = config.maxSizeBytes ?? 100 * 1024 * 1024; // 100MB
    this.forceError = config.forceError ?? null;
    this.latencyMs = config.latencyMs ?? 0;
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  async get(key: CacheKey): Promise<Result<CacheEntry | null, CacheError>> {
    this.getCalls.push(key);
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const keyStr = keyToString(key);
    const entry = this.cache.get(keyStr);

    if (!entry) {
      this.missCount++;
      return Ok(null);
    }

    this.hitCount++;

    // Update access time and count
    const updatedEntry: CacheEntry = {
      ...entry,
      lastAccessedAt: Date.now(),
      accessCount: entry.accessCount + 1,
    };
    this.cache.set(keyStr, updatedEntry);

    return Ok(updatedEntry);
  }

  async set(key: CacheKey, entry: CacheEntry): Promise<Result<void, CacheError>> {
    this.setCalls.push({ key, entry });
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    // Check size
    const currentSize = this.getCurrentSizeBytes();
    if (currentSize + entry.sizeBytes > this.maxSizeBytes) {
      return Err(
        cacheError.storageFull(currentSize, this.maxSizeBytes)
      );
    }

    const keyStr = keyToString(key);
    this.cache.set(keyStr, entry);

    return Ok(undefined);
  }

  async delete(key: CacheKey): Promise<Result<boolean, CacheError>> {
    this.deleteCalls.push(key);
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    const keyStr = keyToString(key);
    const existed = this.cache.has(keyStr);
    this.cache.delete(keyStr);

    return Ok(existed);
  }

  async clear(urlFilter?: string): Promise<Result<number, CacheError>> {
    this.clearCalls.push(urlFilter);
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    if (!urlFilter) {
      const count = this.cache.size;
      this.cache.clear();
      return Ok(count);
    }

    // Filter by URL
    let count = 0;
    for (const [keyStr] of this.cache) {
      if (keyStr.startsWith(urlFilter)) {
        this.cache.delete(keyStr);
        count++;
      }
    }

    return Ok(count);
  }

  async has(key: CacheKey): Promise<boolean> {
    this.hasCalls.push(key);
    await this.simulateLatency();

    const keyStr = keyToString(key);
    return this.cache.has(keyStr);
  }

  async getStats(): Promise<CacheStats> {
    await this.simulateLatency();

    let totalSize = 0;
    let oldestAge: number | null = null;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      totalSize += entry.sizeBytes;
      const age = now - entry.createdAt;
      if (oldestAge === null || age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      entries: this.cache.size,
      totalSizeBytes: totalSize,
      maxSizeBytes: this.maxSizeBytes,
      hitCount: this.hitCount,
      missCount: this.missCount,
      oldestEntryAgeMs: oldestAge,
    };
  }

  async evictIfNeeded(): Promise<Result<number, CacheError>> {
    await this.simulateLatency();

    if (this.forceError) {
      return Err(this.forceError);
    }

    // Simple eviction: remove oldest entries until under 90% capacity
    const targetSize = this.maxSizeBytes * 0.7;
    let currentSize = this.getCurrentSizeBytes();
    let evictedCount = 0;

    if (currentSize <= this.maxSizeBytes * 0.9) {
      return Ok(0);
    }

    // Sort by last access time (oldest first)
    const entries = [...this.cache.entries()].sort(
      ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt
    );

    for (const [key, entry] of entries) {
      if (currentSize <= targetSize) break;
      this.cache.delete(key);
      currentSize -= entry.sizeBytes;
      evictedCount++;
    }

    return Ok(evictedCount);
  }

  // Helper methods

  private getCurrentSizeBytes(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.sizeBytes;
    }
    return total;
  }

  // Test helpers

  /**
   * Reset all tracking counters.
   */
  reset(): void {
    this.cache.clear();
    this.getCalls = [];
    this.setCalls = [];
    this.deleteCalls = [];
    this.clearCalls = [];
    this.hasCalls = [];
    this.hitCount = 0;
    this.missCount = 0;
    this.forceError = null;
  }

  /**
   * Set forced error for next operations.
   */
  setForceError(error: CacheError | null): void {
    this.forceError = error;
  }

  /**
   * Set latency for simulated operations.
   */
  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  /**
   * Pre-populate cache with entries for testing.
   */
  prePopulate(entries: Array<{ key: CacheKey; entry: CacheEntry }>): void {
    for (const { key, entry } of entries) {
      this.cache.set(keyToString(key), entry);
    }
  }

  /**
   * Get current cache size for assertions.
   */
  getSize(): number {
    return this.cache.size;
  }
}

/**
 * Create a mock cache store with default configuration.
 */
export function createMockCacheStore(
  config?: MockCacheStoreConfig
): MockCacheStore {
  return new MockCacheStore(config);
}
