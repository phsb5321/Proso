/**
 * Cache Store Port Interface
 *
 * Defines the contract for audio cache storage.
 * Adapters: IndexedDB (production), InMemory (testing)
 *
 * @module ports/cache-store
 */

import type { CacheError } from '../core/shared/errors';
import type { Result } from '../core/shared/result';
import type { WordTiming } from './audio-generator.port';

/**
 * Cache key for identifying cached audio entries.
 */
export interface CacheKey {
  readonly urlHash: string;
  readonly paragraphIndex: number;
  readonly provider: string;
  readonly voice: string;
  readonly contentHash: string;
}

/**
 * Cached audio entry with metadata.
 */
export interface CacheEntry {
  readonly audioBlob: Blob;
  readonly durationMs: number;
  readonly wordTimings: readonly WordTiming[] | null;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
  readonly accessCount: number;
  readonly sizeBytes: number;
}

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  readonly entries: number;
  readonly totalSizeBytes: number;
  readonly maxSizeBytes: number;
  readonly hitCount: number;
  readonly missCount: number;
  readonly oldestEntryAgeMs: number | null;
}

/**
 * Port interface for audio cache storage.
 *
 * Implementations:
 * - IndexedDBCacheAdapter - Production cache using IndexedDB
 * - InMemoryCacheAdapter - Testing cache using Map
 */
export interface ICacheStore {
  /**
   * Get cached audio entry.
   * @param key - Cache key
   * @returns Result with entry (or null if not found) or error
   */
  get(key: CacheKey): Promise<Result<CacheEntry | null, CacheError>>;

  /**
   * Store audio entry.
   * @param key - Cache key
   * @param entry - Entry to store
   * @returns Result indicating success or error
   */
  set(key: CacheKey, entry: CacheEntry): Promise<Result<void, CacheError>>;

  /**
   * Delete specific entry.
   * @param key - Cache key
   * @returns Result with true if deleted, false if not found
   */
  delete(key: CacheKey): Promise<Result<boolean, CacheError>>;

  /**
   * Clear all entries (optionally filtered by URL).
   * @param urlFilter - Optional URL hash to filter by
   * @returns Result with count of deleted entries
   */
  clear(urlFilter?: string): Promise<Result<number, CacheError>>;

  /**
   * Check if entry exists without retrieving it.
   * @param key - Cache key
   * @returns True if entry exists
   */
  has(key: CacheKey): Promise<boolean>;

  /**
   * Get cache statistics.
   * @returns Cache stats
   */
  getStats(): Promise<CacheStats>;

  /**
   * Run eviction if cache exceeds threshold.
   * @returns Result with count of evicted entries
   */
  evictIfNeeded(): Promise<Result<number, CacheError>>;
}
