// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Audio Cache Store - IndexedDB Operations
 *
 * Implements IAudioCacheStore interface from contracts.
 * Provides persistent audio caching with in-memory fallback.
 *
 * @module utils/cache/audio-cache-store
 */

import { getDatabase, isIndexedDBAvailable, closeDatabase } from './db';
import { type CacheIndexManager, createCacheIndex } from './cache-index';
import { generateCacheKey, generateContentHash, parseCacheKey, normalizeUrl } from './cache-key';
import type {
  CachedAudioEntry,
  CacheConfig,
  CacheStats,
  CacheIndex,
  EvictionResult,
  CleanupResult,
  CacheEvent,
  CacheEventListener,
} from './types';
import { cacheDefaults } from '../config/defaults';
import {
  selectEntriesForEviction,
  needsEviction as checkNeedsEviction,
  getStaleEntries as findStaleEntries,
  createEvictionResult,
  createCleanupResult,
  createEvictionStats,
  updateEvictionStats,
  type EvictionStats,
} from './eviction';

/**
 * Logger for cache operations
 */
function logCacheEvent(event: CacheEvent, listeners: Set<CacheEventListener>): void {
  // Notify all listeners
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }
}

/**
 * Audio Cache Store implementation
 */
export class AudioCacheStore {
  private config: CacheConfig;
  private index: CacheIndexManager;
  private initialized = false;
  private useInMemoryFallback = false;
  private inMemoryCache: Map<string, CachedAudioEntry> = new Map();
  private eventListeners: Set<CacheEventListener> = new Set();
  private evictionStats: EvictionStats = createEvictionStats();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...cacheDefaults, ...config };
    this.index = createCacheIndex(this.config);
  }

  /**
   * Initialize the cache store
   * Opens IndexedDB connection, loads index into memory
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Check if IndexedDB is available
    const idbAvailable = await isIndexedDBAvailable();

    if (!idbAvailable || !this.config.persistToIndexedDB) {
      // Fall back to in-memory cache
      this.useInMemoryFallback = true;
      this.initialized = true;
      this.logEvent({
        type: 'error',
        operation: 'init',
        error: 'IndexedDB unavailable, using in-memory fallback',
      });
      return;
    }

    try {
      // Load existing index from IndexedDB
      await this.loadIndexFromDB();
      this.initialized = true;
    } catch (error) {
      // Fall back to in-memory on error
      this.useInMemoryFallback = true;
      this.initialized = true;
      this.logEvent({
        type: 'error',
        operation: 'init',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Load cache index from IndexedDB
   */
  private async loadIndexFromDB(): Promise<void> {
    const db = getDatabase();
    const entries = await db.audioCache.toArray();

    // Build index from stored entries
    for (const entry of entries) {
      const url = entry.url;
      this.index.set(url, {
        paragraphIndex: entry.paragraphIndex,
        cacheKey: entry.cacheKey,
        size: entry.compressedSize,
        lastAccessedAt: entry.lastAccessedAt,
      });
    }
  }

  /**
   * Close the cache store
   */
  async close(): Promise<void> {
    if (!this.useInMemoryFallback) {
      await closeDatabase();
    }
    this.initialized = false;
  }

  /**
   * Check if an entry exists in cache (O(1) using in-memory index)
   */
  has(cacheKey: string): boolean {
    if (this.useInMemoryFallback) {
      return this.inMemoryCache.has(cacheKey);
    }
    return this.index.has(cacheKey);
  }

  /**
   * Get a cached audio entry
   * Updates lastAccessedAt, returns null if not found or invalid
   */
  async get(cacheKey: string): Promise<CachedAudioEntry | null> {
    if (!this.initialized) await this.init();

    if (this.useInMemoryFallback) {
      const entry = this.inMemoryCache.get(cacheKey);
      if (entry) {
        entry.lastAccessedAt = Date.now();
        entry.accessCount++;
        this.index.recordHit();
        this.logEvent({ type: 'hit', cacheKey, size: entry.compressedSize });
        return entry;
      }
      this.index.recordMiss();
      this.logEvent({ type: 'miss', cacheKey });
      return null;
    }

    try {
      const db = getDatabase();
      const entry = await db.audioCache.get(cacheKey);

      if (!entry) {
        this.index.recordMiss();
        this.logEvent({ type: 'miss', cacheKey });
        return null;
      }

      // Validate entry integrity (T022a - FR-020)
      if (!this.validateEntry(entry)) {
        // Corrupt entry - remove it
        await this.delete(cacheKey);
        this.index.recordMiss();
        this.logEvent({ type: 'error', operation: 'get', error: `Corrupt entry: ${cacheKey}` });
        return null;
      }

      // Update access metadata
      const now = Date.now();
      await db.audioCache.update(cacheKey, {
        lastAccessedAt: now,
        accessCount: entry.accessCount + 1,
      });

      // Update index
      this.index.touch(cacheKey);
      this.index.recordHit();
      this.logEvent({ type: 'hit', cacheKey, size: entry.compressedSize });

      return {
        ...entry,
        lastAccessedAt: now,
        accessCount: entry.accessCount + 1,
      };
    } catch (error) {
      this.index.recordMiss();
      this.logEvent({
        type: 'error',
        operation: 'get',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Validate cached audio entry integrity (FR-020)
   */
  private validateEntry(entry: CachedAudioEntry): boolean {
    // Check required fields exist
    if (!entry.cacheKey || !entry.audioData || !entry.url) {
      return false;
    }

    // Check audio data is valid ArrayBuffer with content
    if (!(entry.audioData instanceof ArrayBuffer) || entry.audioData.byteLength === 0) {
      return false;
    }

    // Check size consistency
    if (entry.compressedSize !== entry.audioData.byteLength) {
      return false;
    }

    // Check timestamps are valid
    if (entry.createdAt <= 0 || entry.lastAccessedAt <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Store an audio entry in cache
   * Triggers eviction if needed, returns the cache key
   */
  async set(
    entry: Omit<CachedAudioEntry, 'cacheKey' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>,
  ): Promise<string> {
    if (!this.initialized) await this.init();

    // Generate cache key
    const cacheKey = generateCacheKey(
      entry.url,
      entry.paragraphIndex,
      entry.provider,
      entry.voice,
      entry.contentHash,
    );

    const now = Date.now();
    const fullEntry: CachedAudioEntry = {
      ...entry,
      cacheKey,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    };

    if (this.useInMemoryFallback) {
      this.inMemoryCache.set(cacheKey, fullEntry);
      this.index.set(entry.url, {
        paragraphIndex: entry.paragraphIndex,
        cacheKey,
        size: entry.compressedSize,
        lastAccessedAt: now,
      });
      this.logEvent({ type: 'set', cacheKey, size: entry.compressedSize });
      return cacheKey;
    }

    try {
      // Check if eviction is needed before adding
      await this.evictIfNeeded();

      const db = getDatabase();
      await db.audioCache.put(fullEntry);

      // Update index
      this.index.set(entry.url, {
        paragraphIndex: entry.paragraphIndex,
        cacheKey,
        size: entry.compressedSize,
        lastAccessedAt: now,
      });

      this.logEvent({ type: 'set', cacheKey, size: entry.compressedSize });
      return cacheKey;
    } catch (error) {
      // Handle QuotaExceededError
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        // Force eviction and retry
        await this.forceEviction();
        try {
          const db = getDatabase();
          await db.audioCache.put(fullEntry);
          this.index.set(entry.url, {
            paragraphIndex: entry.paragraphIndex,
            cacheKey,
            size: entry.compressedSize,
            lastAccessedAt: now,
          });
          return cacheKey;
        } catch {
          // If still failing, fall back to in-memory
          this.inMemoryCache.set(cacheKey, fullEntry);
          this.logEvent({
            type: 'error',
            operation: 'set',
            error: 'QuotaExceededError, falling back to in-memory',
          });
          return cacheKey;
        }
      }

      this.logEvent({
        type: 'error',
        operation: 'set',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete a cache entry
   */
  async delete(cacheKey: string): Promise<boolean> {
    if (!this.initialized) await this.init();

    const entry = this.index.get(cacheKey);
    const size = entry?.size ?? 0;

    if (this.useInMemoryFallback) {
      const deleted = this.inMemoryCache.delete(cacheKey);
      if (deleted) {
        this.index.delete(cacheKey);
        this.logEvent({ type: 'delete', cacheKey, size });
      }
      return deleted;
    }

    try {
      const db = getDatabase();
      await db.audioCache.delete(cacheKey);
      this.index.delete(cacheKey);
      this.logEvent({ type: 'delete', cacheKey, size });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<number> {
    if (!this.initialized) await this.init();

    const count = this.index.entryCount;

    if (this.useInMemoryFallback) {
      this.inMemoryCache.clear();
      this.index.clear();
      return count;
    }

    try {
      const db = getDatabase();
      await db.audioCache.clear();
      this.index.clear();
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Clear cache entries for a specific URL
   */
  async clearForUrl(url: string): Promise<number> {
    if (!this.initialized) await this.init();

    const normalizedUrl = normalizeUrl(url);

    if (this.useInMemoryFallback) {
      let count = 0;
      for (const [key, entry] of this.inMemoryCache) {
        if (normalizeUrl(entry.url) === normalizedUrl) {
          this.inMemoryCache.delete(key);
          count++;
        }
      }
      this.index.deleteForUrl(url);
      return count;
    }

    try {
      const db = getDatabase();
      const count = await db.audioCache.where('url').equals(url).delete();
      this.index.deleteForUrl(url);
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Clear cache entries for a specific provider/voice
   */
  async clearForProvider(provider: string, voice?: string): Promise<number> {
    if (!this.initialized) await this.init();

    if (this.useInMemoryFallback) {
      let count = 0;
      for (const [key, entry] of this.inMemoryCache) {
        if (entry.provider === provider && (!voice || entry.voice === voice)) {
          this.inMemoryCache.delete(key);
          this.index.delete(key);
          count++;
        }
      }
      return count;
    }

    try {
      const db = getDatabase();

      if (voice) {
        // Delete entries for specific provider+voice
        const count = await db.audioCache
          .where('[provider+voice]')
          .equals([provider, voice])
          .delete();
        // Rebuild index for consistency
        await this.loadIndexFromDB();
        return count;
      } else {
        // Get all entries for provider
        const entries = await db.audioCache.filter((e) => e.provider === provider).toArray();

        for (const entry of entries) {
          await db.audioCache.delete(entry.cacheKey);
          this.index.delete(entry.cacheKey);
        }
        return entries.length;
      }
    } catch {
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.index.getStats();
  }

  /**
   * Get the in-memory cache index
   */
  getIndex(): CacheIndex {
    return this.index.getRawIndex();
  }

  /**
   * Get cached paragraph indices for a URL
   */
  getCachedParagraphs(url: string, provider: string, voice: string): number[] {
    const normalizedUrl = normalizeUrl(url);
    const cachedIndices: number[] = [];

    // Filter by provider and voice
    const entries = this.index.getRawIndex().urlIndex[url] ?? [];
    for (const entry of entries) {
      const parsed = parseCacheKey(entry.cacheKey);
      if (parsed && parsed.provider === provider && parsed.voice === voice) {
        cachedIndices.push(entry.paragraphIndex);
      }
    }

    return cachedIndices.sort((a, b) => a - b);
  }

  /**
   * Generate cache key from components (convenience method)
   */
  generateKey(
    url: string,
    paragraphIndex: number,
    provider: string,
    voice: string,
    contentHash: string,
  ): string {
    return generateCacheKey(url, paragraphIndex, provider, voice, contentHash);
  }

  /**
   * Generate content hash (convenience method)
   */
  async hashContent(text: string): Promise<string> {
    return generateContentHash(text);
  }

  /**
   * Run eviction if cache exceeds thresholds
   * Uses multi-factor scoring from eviction module
   */
  async evictIfNeeded(): Promise<EvictionResult> {
    const startTime = Date.now();

    // Use new eviction module for threshold check
    if (!checkNeedsEviction(this.index.totalSize, this.index.entryCount, this.config)) {
      return createEvictionResult(false, 0, 0, 'none', startTime);
    }

    return this.runEviction(startTime);
  }

  /**
   * Force eviction regardless of thresholds
   */
  private async forceEviction(): Promise<EvictionResult> {
    return this.runEviction(Date.now());
  }

  /**
   * Run the eviction process using multi-factor scoring
   */
  private async runEviction(startTime: number): Promise<EvictionResult> {
    // Get all entries from the index
    const allEntries = this.index.getEntriesByAge();

    // Use new eviction module for smart selection
    const candidates = selectEntriesForEviction(
      allEntries,
      this.index.totalSize,
      this.index.entryCount,
      this.config,
    );

    if (candidates.length === 0) {
      return createEvictionResult(true, 0, 0, 'none', startTime);
    }

    let bytesFreed = 0;
    let entriesEvicted = 0;

    // Batch delete for efficiency
    for (const candidate of candidates) {
      const deleted = await this.delete(candidate.cacheKey);
      if (deleted) {
        bytesFreed += candidate.size;
        entriesEvicted++;
      }
    }

    const result = createEvictionResult(
      true,
      entriesEvicted,
      bytesFreed,
      this.index.totalSize > this.config.maxSizeBytes * 0.9 ? 'size_limit' : 'entry_limit',
      startTime,
    );

    // Update eviction statistics
    this.evictionStats = updateEvictionStats(this.evictionStats, result);

    this.logEvent({ type: 'eviction', count: entriesEvicted, bytesFreed });
    return result;
  }

  /**
   * Get eviction statistics
   */
  getEvictionStats(): EvictionStats {
    return { ...this.evictionStats };
  }

  /**
   * Run cleanup for stale entries (older than maxAgeMs)
   * Uses eviction module for stale entry detection
   */
  async cleanup(): Promise<CleanupResult> {
    if (!this.initialized) await this.init();

    const startTime = Date.now();

    // Get all entries from index
    const allEntries = this.index.getEntriesByAge();

    // Use eviction module for stale entry detection
    const staleEntries = findStaleEntries(allEntries, this.config.maxAgeMs);

    let bytesFreed = 0;
    let staleEntriesRemoved = 0;
    const corruptEntriesRemoved = 0;

    for (const entry of staleEntries) {
      const deleted = await this.delete(entry.cacheKey);
      if (deleted) {
        bytesFreed += entry.size;
        staleEntriesRemoved++;
      }
    }

    const result = createCleanupResult(
      staleEntriesRemoved,
      corruptEntriesRemoved,
      bytesFreed,
      startTime,
    );

    if (result.entriesRemoved > 0) {
      this.logEvent({ type: 'cleanup', count: result.entriesRemoved, bytesFreed });
    }

    return result;
  }

  /**
   * Add event listener
   */
  addEventListener(listener: CacheEventListener): void {
    this.eventListeners.add(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: CacheEventListener): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Log cache event
   */
  private logEvent(event: CacheEvent): void {
    logCacheEvent(event, this.eventListeners);
  }

  /**
   * Check if using in-memory fallback
   */
  get isInMemoryMode(): boolean {
    return this.useInMemoryFallback;
  }

  /**
   * Check if initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Create audio cache store factory
 */
export function createAudioCacheStore(config?: Partial<CacheConfig>): AudioCacheStore {
  return new AudioCacheStore(config);
}

/**
 * Singleton instance for global use
 */
let cacheStoreInstance: AudioCacheStore | null = null;

/**
 * Get the global cache store instance
 */
export function getCacheStore(): AudioCacheStore {
  if (!cacheStoreInstance) {
    cacheStoreInstance = new AudioCacheStore();
  }
  return cacheStoreInstance;
}

/**
 * Reset the global cache store instance
 */
export function resetCacheStore(): void {
  if (cacheStoreInstance) {
    cacheStoreInstance.close();
    cacheStoreInstance = null;
  }
}
