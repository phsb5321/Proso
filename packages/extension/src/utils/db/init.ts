// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso IndexedDB Initialization
 *
 * Database initialization, migrations, and health checks.
 *
 * @module utils/db/init
 */

import { DB_NAME, DB_VERSION, getDB, isIndexedDBAvailable } from './schema';

/**
 * Database initialization result
 */
export interface DBInitResult {
  success: boolean;
  version: number;
  error?: string;
}

/**
 * Initialize the database and run any necessary migrations.
 *
 * @returns Initialization result
 */
export async function initDatabase(): Promise<DBInitResult> {
  // Check IndexedDB availability
  if (!isIndexedDBAvailable()) {
    return {
      success: false,
      version: 0,
      error: 'IndexedDB is not available in this environment',
    };
  }

  try {
    const db = getDB();

    // Open the database (triggers version upgrade if needed)
    await db.open();

    console.log(`[Proso:DB] Database initialized: ${DB_NAME} v${DB_VERSION}`);

    return {
      success: true,
      version: DB_VERSION,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error';
    console.error('[Proso:DB] Initialization failed:', message);

    return {
      success: false,
      version: 0,
      error: message,
    };
  }
}

/**
 * Database health check
 */
export interface DBHealthCheck {
  available: boolean;
  open: boolean;
  version: number;
  highlightCount: number;
  audioCacheCount: number;
  audioCacheSizeBytes: number;
}

/**
 * Perform a health check on the database.
 *
 * @returns Health check results
 */
export async function checkDatabaseHealth(): Promise<DBHealthCheck> {
  if (!isIndexedDBAvailable()) {
    return {
      available: false,
      open: false,
      version: 0,
      highlightCount: 0,
      audioCacheCount: 0,
      audioCacheSizeBytes: 0,
    };
  }

  try {
    const db = getDB();

    // Ensure database is open
    if (!db.isOpen()) {
      await db.open();
    }

    // Count records
    const highlightCount = await db.highlights.count();
    const audioCacheCount = await db.audioCache.count();

    // Estimate audio cache size
    let audioCacheSizeBytes = 0;
    await db.audioCache.each((chunk) => {
      if (chunk.audioBlob) {
        audioCacheSizeBytes += chunk.audioBlob.size;
      }
    });

    return {
      available: true,
      open: db.isOpen(),
      version: db.verno,
      highlightCount,
      audioCacheCount,
      audioCacheSizeBytes,
    };
  } catch (error) {
    console.error('[Proso:DB] Health check failed:', error);

    return {
      available: true,
      open: false,
      version: 0,
      highlightCount: 0,
      audioCacheCount: 0,
      audioCacheSizeBytes: 0,
    };
  }
}

/**
 * Clear all audio cache entries.
 *
 * @returns Number of entries cleared
 */
export async function clearAudioCache(): Promise<number> {
  try {
    const db = getDB();
    const count = await db.audioCache.count();
    await db.audioCache.clear();
    console.log(`[Proso:DB] Cleared ${count} audio cache entries`);
    return count;
  } catch (error) {
    console.error('[Proso:DB] Failed to clear audio cache:', error);
    return 0;
  }
}

/**
 * Clear audio cache entries older than specified age.
 *
 * @param maxAgeMs - Maximum age in milliseconds
 * @returns Number of entries cleared
 */
export async function evictOldAudioCache(maxAgeMs: number): Promise<number> {
  try {
    const db = getDB();
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

    const oldEntries = await db.audioCache.where('lastAccessed').below(cutoff).primaryKeys();

    await db.audioCache.bulkDelete(oldEntries);

    console.log(`[Proso:DB] Evicted ${oldEntries.length} old audio cache entries`);
    return oldEntries.length;
  } catch (error) {
    console.error('[Proso:DB] Failed to evict old audio cache:', error);
    return 0;
  }
}

/**
 * Perform LRU eviction to reduce cache size.
 *
 * @param targetSizeBytes - Target size in bytes
 * @returns Number of entries evicted
 */
export async function evictToTargetSize(targetSizeBytes: number): Promise<number> {
  try {
    const db = getDB();

    // Get all entries sorted by lastAccessed (oldest first)
    const entries = await db.audioCache.orderBy('lastAccessed').toArray();

    let currentSize = entries.reduce((sum, e) => sum + (e.audioBlob?.size ?? 0), 0);
    let evicted = 0;

    // Evict oldest entries until under target
    for (const entry of entries) {
      if (currentSize <= targetSizeBytes) break;

      await db.audioCache.delete(entry.id);
      currentSize -= entry.audioBlob?.size ?? 0;
      evicted++;
    }

    console.log(`[Proso:DB] LRU evicted ${evicted} entries, new size: ${currentSize} bytes`);
    return evicted;
  } catch (error) {
    console.error('[Proso:DB] LRU eviction failed:', error);
    return 0;
  }
}
