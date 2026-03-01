// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso IndexedDB Schema
 *
 * Database schema definition for Proso data persistence.
 * Uses Dexie.js for IndexedDB abstraction.
 *
 * @module utils/db/schema
 */

import Dexie, { type Table } from 'dexie';
import type { Highlight } from '../schemas/highlight.schema';
import type { AudioChunk } from '../schemas/audio-chunk.schema';

/**
 * Database version history:
 * - v1: Initial schema with highlights and audioCache
 */
export const DB_VERSION = 1;

/**
 * Database name
 */
export const DB_NAME = 'proso';

/**
 * Proso Database class extending Dexie
 */
export class ProsoDB extends Dexie {
  /**
   * Highlights table - User-created text annotations
   *
   * Indexes:
   * - id (primary key)
   * - url (for listing highlights per page)
   * - created (for chronological listing)
   */
  highlights!: Table<Highlight, string>;

  /**
   * Audio cache table - Cached TTS audio segments
   *
   * Indexes:
   * - id (primary key, composite: urlHash:paragraphIndex:voiceId)
   * - url (for clearing page cache)
   * - lastAccessed (for LRU eviction)
   */
  audioCache!: Table<AudioChunk, string>;

  constructor() {
    super(DB_NAME);

    // Define schema with indexes
    this.version(DB_VERSION).stores({
      // Highlight indexes: id (primary), url, created
      highlights: 'id, url, created',

      // AudioChunk indexes: id (primary), url, lastAccessed
      audioCache: 'id, url, lastAccessed',
    });
  }
}

/**
 * Singleton database instance
 */
let dbInstance: ProsoDB | null = null;

/**
 * Get the database instance (singleton)
 */
export function getDB(): ProsoDB {
  if (!dbInstance) {
    dbInstance = new ProsoDB();
  }
  return dbInstance;
}

/**
 * Close and reset the database instance
 * Useful for testing and cleanup
 */
export async function closeDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Delete the entire database
 * Useful for testing and complete reset
 */
export async function deleteDB(): Promise<void> {
  await closeDB();
  await Dexie.delete(DB_NAME);
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}
