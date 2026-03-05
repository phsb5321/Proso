// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Cache Index - In-Memory Index for Fast Lookups
 *
 * Maintains an in-memory index of cached audio entries for O(1) lookup
 * without hitting IndexedDB. Synchronized with persistent storage.
 *
 * @module utils/cache/cache-index
 */

import { cacheDefaults } from '../config/defaults';
import type { CacheConfig, CacheIndex, CacheIndexEntry, CacheStats } from './types';

/**
 * Default empty cache index
 */
function createEmptyIndex(config: Partial<CacheConfig> = {}): CacheIndex {
  return {
    urlIndex: {},
    totalSize: 0,
    entryCount: 0,
    hitCount: 0,
    missCount: 0,
    maxSize: config.maxSizeBytes ?? cacheDefaults.maxSizeBytes,
    maxEntries: config.maxEntries ?? cacheDefaults.maxEntries,
    lastUpdated: Date.now(),
    version: 1,
  };
}

/**
 * CacheIndex class - manages in-memory cache index
 */
export class CacheIndexManager {
  private index: CacheIndex;
  private cacheKeyToUrl: Map<string, string> = new Map();

  constructor(config: Partial<CacheConfig> = {}) {
    this.index = createEmptyIndex(config);
  }

  /**
   * Load index from serialized data
   */
  loadFromData(data: CacheIndex): void {
    this.index = { ...data };
    // Rebuild cacheKey to URL mapping
    this.cacheKeyToUrl.clear();
    for (const [url, entries] of Object.entries(this.index.urlIndex)) {
      for (const entry of entries) {
        this.cacheKeyToUrl.set(entry.cacheKey, url);
      }
    }
  }

  /**
   * Get serializable index data
   */
  toData(): CacheIndex {
    return { ...this.index };
  }

  /**
   * Check if a cache key exists in the index
   */
  has(cacheKey: string): boolean {
    return this.cacheKeyToUrl.has(cacheKey);
  }

  /**
   * Get entry metadata by cache key
   */
  get(cacheKey: string): CacheIndexEntry | null {
    const url = this.cacheKeyToUrl.get(cacheKey);
    if (!url) return null;

    const entries = this.index.urlIndex[url];
    if (!entries) return null;

    return entries.find((e) => e.cacheKey === cacheKey) ?? null;
  }

  /**
   * Add or update an entry in the index
   */
  set(url: string, entry: CacheIndexEntry): void {
    // Initialize URL entry array if needed
    if (!this.index.urlIndex[url]) {
      this.index.urlIndex[url] = [];
    }

    const entries = this.index.urlIndex[url];
    const existingIdx = entries.findIndex((e) => e.cacheKey === entry.cacheKey);

    if (existingIdx >= 0) {
      // Update existing entry
      const oldEntry = entries[existingIdx];
      this.index.totalSize -= oldEntry.size;
      entries[existingIdx] = entry;
    } else {
      // Add new entry
      entries.push(entry);
      this.index.entryCount++;
    }

    this.index.totalSize += entry.size;
    this.cacheKeyToUrl.set(entry.cacheKey, url);
    this.index.lastUpdated = Date.now();
  }

  /**
   * Remove an entry from the index
   */
  delete(cacheKey: string): boolean {
    const url = this.cacheKeyToUrl.get(cacheKey);
    if (!url) return false;

    const entries = this.index.urlIndex[url];
    if (!entries) return false;

    const idx = entries.findIndex((e) => e.cacheKey === cacheKey);
    if (idx < 0) return false;

    const entry = entries[idx];
    this.index.totalSize -= entry.size;
    this.index.entryCount--;
    entries.splice(idx, 1);

    // Clean up empty URL entries
    if (entries.length === 0) {
      delete this.index.urlIndex[url];
    }

    this.cacheKeyToUrl.delete(cacheKey);
    this.index.lastUpdated = Date.now();
    return true;
  }

  /**
   * Delete all entries for a URL
   */
  deleteForUrl(url: string): number {
    const entries = this.index.urlIndex[url];
    if (!entries || entries.length === 0) return 0;

    let removedCount = 0;
    for (const entry of entries) {
      this.index.totalSize -= entry.size;
      this.cacheKeyToUrl.delete(entry.cacheKey);
      removedCount++;
    }

    this.index.entryCount -= removedCount;
    delete this.index.urlIndex[url];
    this.index.lastUpdated = Date.now();
    return removedCount;
  }

  /**
   * Clear all entries
   */
  clear(): number {
    const count = this.index.entryCount;
    this.index.urlIndex = {};
    this.index.totalSize = 0;
    this.index.entryCount = 0;
    this.cacheKeyToUrl.clear();
    this.index.lastUpdated = Date.now();
    return count;
  }

  /**
   * Update access time for an entry (LRU touch)
   */
  touch(cacheKey: string): void {
    const url = this.cacheKeyToUrl.get(cacheKey);
    if (!url) return;

    const entries = this.index.urlIndex[url];
    if (!entries) return;

    const entry = entries.find((e) => e.cacheKey === cacheKey);
    if (entry) {
      entry.lastAccessedAt = Date.now();
      this.index.lastUpdated = Date.now();
    }
  }

  /**
   * Record a cache hit
   */
  recordHit(): void {
    this.index.hitCount++;
  }

  /**
   * Record a cache miss
   */
  recordMiss(): void {
    this.index.missCount++;
  }

  /**
   * Get all cached paragraph indices for a URL
   */
  getCachedParagraphs(url: string): number[] {
    const entries = this.index.urlIndex[url];
    if (!entries) return [];
    return entries.map((e) => e.paragraphIndex).sort((a, b) => a - b);
  }

  /**
   * Get all entries sorted by last access time (oldest first)
   * Used for LRU eviction
   */
  getEntriesByAge(): Array<CacheIndexEntry & { url: string }> {
    const allEntries: Array<CacheIndexEntry & { url: string }> = [];

    for (const [url, entries] of Object.entries(this.index.urlIndex)) {
      for (const entry of entries) {
        allEntries.push({ ...entry, url });
      }
    }

    // Sort by lastAccessedAt ascending (oldest first)
    return allEntries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    let oldestEntryAgeMs: number | null = null;

    const allEntries = this.getEntriesByAge();
    if (allEntries.length > 0) {
      oldestEntryAgeMs = now - allEntries[0].lastAccessedAt;
    }

    const totalHits = this.index.hitCount + this.index.missCount;
    // hitRate is a decimal (0-1) per CacheStats type
    const hitRate = totalHits > 0 ? this.index.hitCount / totalHits : 0;

    return {
      entries: this.index.entryCount,
      totalSize: this.index.totalSize,
      maxSize: this.index.maxSize,
      hitCount: this.index.hitCount,
      missCount: this.index.missCount,
      hitRate,
      oldestEntryAgeMs,
    };
  }

  /**
   * Check if eviction is needed
   */
  needsEviction(config: CacheConfig): boolean {
    const sizePercent = (this.index.totalSize / this.index.maxSize) * 100;
    const entryPercent = (this.index.entryCount / config.maxEntries) * 100;

    return (
      sizePercent >= config.evictionThresholdPercent ||
      entryPercent >= config.evictionThresholdPercent
    );
  }

  /**
   * Get entries that should be evicted to reach target
   */
  getEvictionCandidates(config: CacheConfig): Array<CacheIndexEntry & { url: string }> {
    if (!this.needsEviction(config)) return [];

    const targetSize = (config.evictionTargetPercent / 100) * this.index.maxSize;
    const targetEntries = Math.floor((config.evictionTargetPercent / 100) * config.maxEntries);

    const candidates: Array<CacheIndexEntry & { url: string }> = [];
    const sortedEntries = this.getEntriesByAge();

    let currentSize = this.index.totalSize;
    let currentEntries = this.index.entryCount;

    for (const entry of sortedEntries) {
      if (currentSize <= targetSize && currentEntries <= targetEntries) {
        break;
      }

      candidates.push(entry);
      currentSize -= entry.size;
      currentEntries--;
    }

    return candidates;
  }

  /**
   * Get stale entries (older than maxAge)
   */
  getStaleEntries(maxAgeMs: number): Array<CacheIndexEntry & { url: string }> {
    const cutoffTime = Date.now() - maxAgeMs;
    const staleEntries: Array<CacheIndexEntry & { url: string }> = [];

    for (const [url, entries] of Object.entries(this.index.urlIndex)) {
      for (const entry of entries) {
        if (entry.lastAccessedAt < cutoffTime) {
          staleEntries.push({ ...entry, url });
        }
      }
    }

    return staleEntries;
  }

  /**
   * Get the raw index (for persistence)
   */
  getRawIndex(): CacheIndex {
    return this.index;
  }

  /**
   * Get total size in bytes
   */
  get totalSize(): number {
    return this.index.totalSize;
  }

  /**
   * Get entry count
   */
  get entryCount(): number {
    return this.index.entryCount;
  }
}

/**
 * Create a new cache index manager
 */
export function createCacheIndex(config: Partial<CacheConfig> = {}): CacheIndexManager {
  return new CacheIndexManager(config);
}
