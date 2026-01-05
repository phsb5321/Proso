/**
 * Audio Cache Module
 * LRU cache for audio segments to enable instant rewind and reduce API calls
 *
 * @module utils/audio/cache
 */

import { z } from 'zod';
import { AudioSegment, type AudioSegmentMetadata } from './segment';

/**
 * Cache configuration schema
 */
export const cacheConfigSchema = z.object({
  maxEntries: z.number().int().positive().default(50),
  maxAgeMs: z.number().positive().default(30 * 60 * 1000), // 30 minutes
  maxSizeBytes: z.number().positive().default(100 * 1024 * 1024), // 100MB
});

export type CacheConfig = z.infer<typeof cacheConfigSchema>;

/**
 * Cache statistics schema
 */
export const cacheStatsSchema = z.object({
  entries: z.number().int().nonnegative(),
  maxEntries: z.number().int().positive(),
  totalSize: z.number().nonnegative(),
  maxSize: z.number().positive(),
  sizePercentage: z.string(),
});

export type CacheStats = z.infer<typeof cacheStatsSchema>;

/**
 * Default LRU Cache configuration
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxEntries: 50,
  maxAgeMs: 30 * 60 * 1000, // 30 minutes
  maxSizeBytes: 100 * 1024 * 1024, // 100MB
};

/**
 * LRU Audio Cache
 * Thread-safe cache with automatic eviction and size management
 */
export class AudioCache {
  private readonly _cache: Map<string, AudioSegment>;
  private _totalSize: number;
  private readonly _config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this._cache = new Map<string, AudioSegment>();
    this._totalSize = 0;
    this._config = cacheConfigSchema.parse({ ...DEFAULT_CACHE_CONFIG, ...config });
  }

  /**
   * Generate a cache key for audio content
   * @param provider - Provider ID
   * @param voice - Voice ID
   * @param text - Text content
   */
  generateKey(provider: string, voice: string, text: string): string {
    return AudioSegment.generateCacheKey(provider, voice, text);
  }

  /**
   * Check if a key exists in the cache
   * @param key - Cache key
   */
  has(key: string): boolean {
    if (!this._cache.has(key)) {
      return false;
    }

    // Check if segment is stale
    const segment = this._cache.get(key);
    if (segment && segment.isStale(this._config.maxAgeMs)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get a cached audio segment
   * @param key - Cache key
   * @returns AudioSegment or null if not found
   */
  get(key: string): AudioSegment | null {
    if (!this.has(key)) {
      return null;
    }

    const segment = this._cache.get(key);
    if (!segment) {
      return null;
    }

    segment.touch();

    // Move to end (most recently used)
    this._cache.delete(key);
    this._cache.set(key, segment);

    return segment;
  }

  /**
   * Store an audio segment in the cache
   * @param key - Cache key
   * @param audioData - Audio data
   * @param metadata - Segment metadata
   * @returns The created AudioSegment
   */
  set(key: string, audioData: ArrayBuffer, metadata: Partial<AudioSegmentMetadata> = {}): AudioSegment {
    // Remove existing entry if present
    if (this._cache.has(key)) {
      this.delete(key);
    }

    // Evict entries if needed
    this._evictIfNeeded(audioData.byteLength);

    // Create and store new segment
    const segment = new AudioSegment(key, audioData, metadata);
    this._cache.set(key, segment);
    this._totalSize += segment.size;

    return segment;
  }

  /**
   * Delete a cached segment
   * @param key - Cache key
   */
  delete(key: string): void {
    const segment = this._cache.get(key);
    if (segment) {
      this._totalSize -= segment.size;
      this._cache.delete(key);
    }
  }

  /**
   * Clear all cached segments
   */
  clear(): void {
    this._cache.clear();
    this._totalSize = 0;
  }

  /**
   * Clear segments for a specific provider
   * @param provider - Provider ID
   */
  clearForProvider(provider: string): void {
    for (const [key, segment] of this._cache) {
      if (segment.provider === provider) {
        this.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      entries: this._cache.size,
      maxEntries: this._config.maxEntries,
      totalSize: this._totalSize,
      maxSize: this._config.maxSizeBytes,
      sizePercentage: (this._totalSize / this._config.maxSizeBytes * 100).toFixed(1),
    };
  }

  /**
   * Evict entries if cache is full
   * @param incomingSize - Size of new entry
   */
  private _evictIfNeeded(incomingSize: number): void {
    // Evict if too many entries
    while (this._cache.size >= this._config.maxEntries) {
      this._evictOldest();
    }

    // Evict if size limit exceeded
    while (this._totalSize + incomingSize > this._config.maxSizeBytes && this._cache.size > 0) {
      this._evictOldest();
    }

    // Evict stale entries
    this._evictStale();
  }

  /**
   * Evict the oldest (least recently used) entry
   */
  private _evictOldest(): void {
    const oldestKey = this._cache.keys().next().value;
    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  /**
   * Evict all stale entries
   */
  private _evictStale(): void {
    for (const [key, segment] of this._cache) {
      if (segment.isStale(this._config.maxAgeMs)) {
        this.delete(key);
      }
    }
  }
}

/**
 * Singleton audio cache instance
 */
export const audioCache = new AudioCache();
