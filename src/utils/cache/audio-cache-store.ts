// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Audio Cache Store Module
 * IndexedDB-backed cache for TTS audio with in-memory fallback
 *
 * Feature: 028-smart-audio-cache
 *
 * @module utils/cache/audio-cache-store
 */

import type {
  CacheConfig,
  CachedAudioEntry,
  CacheStats,
  CleanupResult,
  EvictionResult,
  WordTimelineItem,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: CacheConfig = {
  maxSizeBytes: 500 * 1024 * 1024, // 500MB
  maxEntries: 1000,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  evictionThresholdPercent: 90,
  evictionTargetPercent: 70,
  persistToIndexedDB: true,
  dbName: 'voxpage-audio-cache',
  storeName: 'audio-entries',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a SHA-256 hash of text content
 * Returns a hex string truncated to 16 characters
 */
export async function generateContentHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 16);
  } catch {
    // Fallback for environments without crypto.subtle
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
  }
}

/**
 * Generate a cache key from components
 */
export function generateCacheKey(
  url: string,
  paragraphIndex: number,
  provider: string,
  voice: string,
  contentHash: string,
): string {
  // Create URL hash for shorter keys
  const urlHash = url.replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  return `${urlHash}:${paragraphIndex}:${provider}:${voice}:${contentHash}`;
}

/**
 * Estimate cost based on character count and provider
 */
export function estimateCost(
  characters: number,
  provider: string,
  _voice?: string,
): { estimatedCost: number; pricePerKiloChar: number } {
  // Provider pricing per 1000 characters (approximate)
  const pricing: Record<string, number> = {
    elevenlabs: 0.3, // $0.30 per 1000 chars
    openai: 0.015, // $0.015 per 1000 chars
    browser: 0, // Free
    groq: 0, // Free tier
    cartesia: 0.1, // $0.10 per 1000 chars (estimate)
  };

  const pricePerKiloChar = pricing[provider] ?? 0;
  const estimatedCost = (characters / 1000) * pricePerKiloChar;

  return { estimatedCost, pricePerKiloChar };
}

// ============================================================================
// AudioCacheStore Class
// ============================================================================

/**
 * Audio cache store with IndexedDB persistence and in-memory fallback
 */
export class AudioCacheStore {
  private config: CacheConfig;
  private db: IDBDatabase | null = null;
  private memoryCache: Map<string, CachedAudioEntry> = new Map();
  private _isInitialized = false;
  private _isInMemoryMode = false;
  private hitCount = 0;
  private missCount = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the cache store
   */
  async init(): Promise<void> {
    if (this._isInitialized) return;

    if (this.config.persistToIndexedDB) {
      try {
        this.db = await this.openDatabase();
        this._isInMemoryMode = false;
      } catch (error) {
        console.warn('[AudioCacheStore] IndexedDB unavailable, using in-memory mode:', error);
        this._isInMemoryMode = true;
      }
    } else {
      this._isInMemoryMode = true;
    }

    this._isInitialized = true;
  }

  /**
   * Open IndexedDB database
   */
  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          const store = db.createObjectStore(this.config.storeName, { keyPath: 'cacheKey' });
          store.createIndex('url', 'url', { unique: false });
          store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  /**
   * Check if cache is initialized
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Check if using in-memory mode
   */
  get isInMemoryMode(): boolean {
    return this._isInMemoryMode;
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: string): boolean {
    if (this._isInMemoryMode) {
      return this.memoryCache.has(key);
    }
    // For IndexedDB, we need async check - this is a sync approximation
    return false;
  }

  /**
   * Get an entry from the cache
   */
  async get(key: string): Promise<CachedAudioEntry | null> {
    if (!this._isInitialized) await this.init();

    if (this._isInMemoryMode) {
      const entry = this.memoryCache.get(key);
      if (entry) {
        this.hitCount++;
        entry.lastAccessedAt = Date.now();
        entry.accessCount++;
        return entry;
      }
      this.missCount++;
      return null;
    }

    // IndexedDB path
    if (!this.db) {
      this.missCount++;
      return null;
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CachedAudioEntry | undefined;
        if (entry) {
          this.hitCount++;
          // Update access time
          entry.lastAccessedAt = Date.now();
          entry.accessCount++;
          store.put(entry);
          resolve(entry);
        } else {
          this.missCount++;
          resolve(null);
        }
      };

      request.onerror = () => {
        this.missCount++;
        resolve(null);
      };
    });
  }

  /**
   * Store an entry in the cache
   */
  async set(
    entry: Omit<CachedAudioEntry, 'cacheKey' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>,
  ): Promise<string> {
    if (!this._isInitialized) await this.init();

    const contentHash = await generateContentHash(
      entry.audioData.byteLength.toString() + entry.paragraphIndex,
    );
    const cacheKey = generateCacheKey(
      entry.url,
      entry.paragraphIndex,
      entry.provider,
      entry.voice,
      contentHash,
    );

    const fullEntry: CachedAudioEntry = {
      ...entry,
      cacheKey,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
    };

    if (this._isInMemoryMode) {
      // Check size limits
      await this.evictIfNeeded();
      this.memoryCache.set(cacheKey, fullEntry);
      return cacheKey;
    }

    // IndexedDB path
    if (!this.db) {
      throw new Error('Cache not initialized');
    }

    await this.evictIfNeeded();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.put(fullEntry);

      request.onsuccess = () => resolve(cacheKey);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete an entry from the cache
   */
  async delete(key: string): Promise<boolean> {
    if (!this._isInitialized) await this.init();

    if (this._isInMemoryMode) {
      return this.memoryCache.delete(key);
    }

    if (!this.db) return false;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }

  /**
   * Clear all entries from the cache
   */
  async clear(): Promise<void> {
    if (!this._isInitialized) await this.init();

    if (this._isInMemoryMode) {
      this.memoryCache.clear();
      return;
    }

    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.config.storeName, 'readwrite');
      const store = transaction.objectStore(this.config.storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let entries = 0;
    let totalSize = 0;
    let oldestEntryAgeMs: number | null = null;
    const now = Date.now();

    if (this._isInMemoryMode) {
      entries = this.memoryCache.size;
      for (const entry of this.memoryCache.values()) {
        totalSize += entry.compressedSize;
        const age = now - entry.createdAt;
        if (oldestEntryAgeMs === null || age > oldestEntryAgeMs) {
          oldestEntryAgeMs = age;
        }
      }
    }

    const totalAccess = this.hitCount + this.missCount;
    const hitRate = totalAccess > 0 ? this.hitCount / totalAccess : 0;

    return {
      entries,
      totalSize,
      maxSize: this.config.maxSizeBytes,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate,
      oldestEntryAgeMs,
    };
  }

  /**
   * Get cached paragraph indices for a URL
   */
  getCachedParagraphs(url: string, provider: string, voice: string): number[] {
    const indices: number[] = [];

    if (this._isInMemoryMode) {
      for (const entry of this.memoryCache.values()) {
        if (entry.url === url && entry.provider === provider && entry.voice === voice) {
          indices.push(entry.paragraphIndex);
        }
      }
    }

    return indices.sort((a, b) => a - b);
  }

  /**
   * Evict entries if cache is over threshold
   */
  async evictIfNeeded(): Promise<EvictionResult> {
    const stats = this.getStats();
    const usagePercent = (stats.totalSize / this.config.maxSizeBytes) * 100;

    if (usagePercent < this.config.evictionThresholdPercent) {
      return {
        triggered: false,
        entriesEvicted: 0,
        bytesFreed: 0,
      };
    }

    const targetSize = (this.config.evictionTargetPercent / 100) * this.config.maxSizeBytes;
    let bytesFreed = 0;
    let entriesEvicted = 0;

    if (this._isInMemoryMode) {
      // Sort by last accessed time (oldest first)
      const entries = [...this.memoryCache.entries()].sort(
        ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt,
      );

      for (const [key, entry] of entries) {
        if (stats.totalSize - bytesFreed <= targetSize) break;
        this.memoryCache.delete(key);
        bytesFreed += entry.compressedSize;
        entriesEvicted++;
      }
    }

    return {
      triggered: true,
      entriesEvicted,
      bytesFreed,
      reason: 'size_limit',
    };
  }

  /**
   * Run cleanup to remove stale/corrupt entries
   */
  async cleanup(): Promise<CleanupResult> {
    const startTime = Date.now();
    let entriesRemoved = 0;
    let staleEntriesRemoved = 0;
    const corruptEntriesRemoved = 0; // In-memory mode doesn't have corrupt entries
    let bytesFreed = 0;

    const now = Date.now();

    if (this._isInMemoryMode) {
      for (const [key, entry] of this.memoryCache.entries()) {
        // Check for stale entries
        if (now - entry.createdAt > this.config.maxAgeMs) {
          this.memoryCache.delete(key);
          bytesFreed += entry.compressedSize;
          staleEntriesRemoved++;
          entriesRemoved++;
        }
      }
    }

    return {
      entriesRemoved,
      staleEntriesRemoved,
      corruptEntriesRemoved,
      bytesFreed,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Destroy the cache store and release resources
   */
  destroy(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.memoryCache.clear();
    this._isInitialized = false;
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let cacheStoreInstance: AudioCacheStore | null = null;

/**
 * Get the singleton cache store instance
 */
export function getCacheStore(): AudioCacheStore {
  if (!cacheStoreInstance) {
    cacheStoreInstance = new AudioCacheStore();
  }
  return cacheStoreInstance;
}

/**
 * Reset the singleton cache store (for testing)
 */
export function resetCacheStore(): void {
  if (cacheStoreInstance) {
    cacheStoreInstance.destroy();
    cacheStoreInstance = null;
  }
}

/**
 * Create a new cache store instance with custom config
 */
export function createAudioCacheStore(config?: Partial<CacheConfig>): AudioCacheStore {
  return new AudioCacheStore(config);
}
