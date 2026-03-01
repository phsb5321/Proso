// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Dexie Database Schema - Smart Audio Cache
 *
 * IndexedDB wrapper using Dexie.js for audio cache persistence.
 * Provides type-safe operations and automatic versioning.
 *
 * @module utils/cache/db
 */

import Dexie, { type Table } from 'dexie';
import type { CachedAudioEntry } from './types';

/**
 * Database table schema definition
 * Matches the contract from specs/028-smart-audio-cache/contracts/cache-store.ts
 */
export const AUDIO_CACHE_SCHEMA = {
  // Primary key and indexes
  // &cacheKey = unique primary key
  // Other fields are indexed for efficient queries
  schema: '&cacheKey, url, lastAccessedAt, createdAt, [provider+voice]',
  name: 'audioCache',
  dbName: 'ProsoAudioCache',
  version: 1,
} as const;

/**
 * Proso Audio Cache Database
 *
 * Single table for storing cached audio entries.
 * Indexes:
 * - &cacheKey: Primary key (unique)
 * - url: For page-level queries (get all cached paragraphs for URL)
 * - lastAccessedAt: For LRU eviction
 * - createdAt: For age-based cleanup
 * - [provider+voice]: Compound index for provider clearing
 */
export class ProsoCacheDB extends Dexie {
  audioCache!: Table<CachedAudioEntry>;

  constructor() {
    super(AUDIO_CACHE_SCHEMA.dbName);

    // Version 1: Initial schema
    this.version(AUDIO_CACHE_SCHEMA.version).stores({
      [AUDIO_CACHE_SCHEMA.name]: AUDIO_CACHE_SCHEMA.schema,
    });
  }
}

/**
 * Singleton database instance
 * Lazy initialization - connection opens on first use
 */
let dbInstance: ProsoCacheDB | null = null;

/**
 * Get the database instance
 * Creates a new instance if one doesn't exist
 */
export function getDatabase(): ProsoCacheDB {
  if (!dbInstance) {
    dbInstance = new ProsoCacheDB();
  }
  return dbInstance;
}

/**
 * Close and release the database connection
 * Call this when the extension unloads or during cleanup
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Delete the entire database
 * Use with caution - this removes all cached data
 */
export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  await Dexie.delete(AUDIO_CACHE_SCHEMA.dbName);
}

/**
 * Check if IndexedDB is available
 * Returns false in Private Browsing mode or when IDB is disabled
 */
export async function isIndexedDBAvailable(): Promise<boolean> {
  try {
    // Try to open a test database
    const testDb = new Dexie('ProsoTestDB');
    testDb.version(1).stores({ test: '++id' });
    await testDb.open();
    testDb.close();
    await Dexie.delete('ProsoTestDB');
    return true;
  } catch {
    // IndexedDB not available (Private Browsing, disabled, etc.)
    return false;
  }
}

// Export default instance getter for convenience
export const cacheDB = {
  get instance() {
    return getDatabase();
  },
  close: closeDatabase,
  delete: deleteDatabase,
  isAvailable: isIndexedDBAvailable,
};
