// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Database - Barrel Export
 *
 * @module utils/db
 */

// Schema and database instance
export {
  ProsoDB,
  getDB,
  closeDB,
  deleteDB,
  isIndexedDBAvailable,
  DB_NAME,
  DB_VERSION,
} from './schema';

// Initialization and utilities
export {
  initDatabase,
  checkDatabaseHealth,
  clearAudioCache,
  evictOldAudioCache,
  evictToTargetSize,
  type DBInitResult,
  type DBHealthCheck,
} from './init';
