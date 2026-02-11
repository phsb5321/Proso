/**
 * IndexedDB Cache Adapter
 *
 * Adapter implementing ICacheStore port using the existing AudioCacheStore.
 * Production cache implementation with IndexedDB persistence.
 *
 * @module adapters/cache/indexeddb-cache
 */

import type { CacheError } from '../../core/shared/errors';
import { cacheError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type { CacheEntry, CacheKey, CacheStats, ICacheStore } from '../../ports/cache-store.port';
import { type AudioCacheStore, createAudioCacheStore } from '../../utils/cache/audio-cache-store';
import { generateCacheKey } from '../../utils/cache/cache-key';

/**
 * Convert port CacheKey to string cache key.
 */
function toCacheKeyString(key: CacheKey): string {
  return generateCacheKey(
    key.urlHash,
    key.paragraphIndex,
    key.provider,
    key.voice,
    key.contentHash,
  );
}

/**
 * IndexedDB cache adapter wrapping AudioCacheStore.
 */
export class IndexedDBCacheAdapter implements ICacheStore {
  private readonly store: AudioCacheStore;
  private initialized = false;

  constructor() {
    this.store = createAudioCacheStore({
      persistToIndexedDB: true,
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.store.init();
      this.initialized = true;
    }
  }

  async get(key: CacheKey): Promise<Result<CacheEntry | null, CacheError>> {
    try {
      await this.ensureInitialized();
      const cacheKey = toCacheKeyString(key);
      const entry = await this.store.get(cacheKey);

      if (!entry) {
        return Ok(null);
      }

      // Convert to port CacheEntry format
      const blob = new Blob([entry.audioData], { type: 'audio/mpeg' });

      // Convert wordTimeline to wordTimings format
      const wordTimings = entry.wordTimeline
        ? entry.wordTimeline.map((t) => ({
            word: t.word,
            startMs: t.startMs,
            endMs: t.endMs,
          }))
        : null;

      return Ok({
        audioBlob: blob,
        durationMs: entry.durationMs ?? 0,
        wordTimings,
        createdAt: entry.createdAt,
        lastAccessedAt: entry.lastAccessedAt,
        accessCount: entry.accessCount,
        sizeBytes: entry.compressedSize,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(cacheError.databaseError(message));
    }
  }

  async set(key: CacheKey, entry: CacheEntry): Promise<Result<void, CacheError>> {
    try {
      await this.ensureInitialized();

      // Convert Blob to ArrayBuffer
      const audioData = await entry.audioBlob.arrayBuffer();

      // Convert wordTimings to wordTimeline format (always provide an array)
      const wordTimeline = entry.wordTimings
        ? entry.wordTimings.map((t, index) => ({
            word: t.word,
            startMs: t.startMs,
            endMs: t.endMs,
            charOffset: index * 5, // Approximate character offset
            charLength: t.word.length,
          }))
        : [];

      await this.store.set({
        url: key.urlHash,
        paragraphIndex: key.paragraphIndex,
        provider: key.provider,
        voice: key.voice,
        contentHash: key.contentHash,
        audioData,
        compressedSize: audioData.byteLength,
        durationMs: entry.durationMs,
        wordTimeline,
      });

      return Ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('Quota') || message.includes('storage')) {
        const stats = this.store.getStats();
        return Err(cacheError.storageFull(stats.totalSize, stats.maxSize));
      }

      return Err(cacheError.databaseError(message));
    }
  }

  async delete(key: CacheKey): Promise<Result<boolean, CacheError>> {
    try {
      await this.ensureInitialized();
      const cacheKey = toCacheKeyString(key);
      const deleted = await this.store.delete(cacheKey);
      return Ok(deleted);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(cacheError.databaseError(message));
    }
  }

  async clear(urlFilter?: string): Promise<Result<number, CacheError>> {
    try {
      await this.ensureInitialized();

      // Get count before clear for return value
      const statsBefore = this.store.getStats();
      const entriesBefore = statsBefore.entries;

      if (urlFilter) {
        // Note: clearForUrl not implemented in AudioCacheStore
        // For now, clear all entries (url filtering would need to be added)
        console.warn('clearForUrl not implemented, clearing all entries');
      }

      await this.store.clear();
      return Ok(entriesBefore);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(cacheError.databaseError(message));
    }
  }

  async has(key: CacheKey): Promise<boolean> {
    await this.ensureInitialized();
    const cacheKey = toCacheKeyString(key);
    return this.store.has(cacheKey);
  }

  async getStats(): Promise<CacheStats> {
    await this.ensureInitialized();
    const stats = this.store.getStats();
    return {
      entries: stats.entries,
      totalSizeBytes: stats.totalSize,
      maxSizeBytes: stats.maxSize,
      hitCount: stats.hitCount,
      missCount: stats.missCount,
      oldestEntryAgeMs: stats.oldestEntryAgeMs ?? null,
    };
  }

  async evictIfNeeded(): Promise<Result<number, CacheError>> {
    try {
      await this.ensureInitialized();
      const result = await this.store.evictIfNeeded();
      return Ok(result.entriesEvicted);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(cacheError.databaseError(message));
    }
  }

  /**
   * Close the underlying store.
   * Note: AudioCacheStore doesn't have a public close() method,
   * so we just mark as uninitialized.
   */
  async close(): Promise<void> {
    if (this.initialized) {
      this.initialized = false;
    }
  }
}
