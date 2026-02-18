// In-memory cache adapter — simple Map-based implementation
// TODO: Swap for Redis (ioredis) when ready for production deployment
//
// Enforces:
//   INV-006: Cached content never re-charges (via CacheStorePort contract)

import { Injectable } from '@nestjs/common';
import { CacheStorePort } from '../../ports/cache-store.port';

interface CacheEntry {
  data: Buffer;
  expiresAt: number | null;
  createdAt: number;
}

@Injectable()
export class InMemoryCacheAdapter extends CacheStorePort {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    super();
    this.maxEntries = maxEntries;
  }

  async get(key: string): Promise<Buffer | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  async set(key: string, data: Buffer, ttlSeconds?: number): Promise<void> {
    // Evict oldest entry if at capacity (simple LRU-style)
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      this.evictOldest();
    }

    const expiresAt =
      ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : null;

    this.store.set(key, {
      data,
      expiresAt,
      createdAt: Date.now(),
    });
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Evict the oldest entry by creation time.
   * Simple FIFO eviction — sufficient for an in-memory placeholder.
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.store.delete(oldestKey);
    }
  }
}
