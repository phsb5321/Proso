// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Highlight IndexedDB Adapter
 *
 * Implements IHighlightRepository using Dexie.js for IndexedDB storage.
 * Provides CRUD operations and efficient URL-based queries.
 *
 * @module adapters/storage/highlight-indexeddb
 */

import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type {
  HighlightQuery,
  HighlightRepositoryError,
  HighlightUpdate,
  IHighlightRepository,
} from '../../ports/highlight-repository.port';
import { getDB } from '../../utils/db/schema';
import type { Highlight } from '../../utils/schemas/highlight.schema';
import { HighlightSchema } from '../../utils/schemas/highlight.schema';

/**
 * HighlightIndexedDBAdapter - IndexedDB-based highlight storage.
 *
 * Features:
 * - CRUD operations for highlights
 * - Efficient URL-based queries via index
 * - Sorting by created/modified date
 * - Pagination support
 */
export class HighlightIndexedDBAdapter implements IHighlightRepository {
  /**
   * Create a new highlight.
   */
  async create(highlight: Highlight): Promise<Result<Highlight, HighlightRepositoryError>> {
    try {
      // Validate against schema
      const validated = HighlightSchema.safeParse(highlight);
      if (!validated.success) {
        return Err({
          type: 'VALIDATION_ERROR',
          message: validated.error.message,
        });
      }

      const db = getDB();
      await db.highlights.add(validated.data);

      return Ok(validated.data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get a highlight by ID.
   */
  async get(id: string): Promise<Result<Highlight, HighlightRepositoryError>> {
    try {
      const db = getDB();
      const highlight = await db.highlights.get(id);

      if (!highlight) {
        return Err({ type: 'NOT_FOUND', id });
      }

      return Ok(highlight);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update an existing highlight.
   */
  async update(
    id: string,
    update: HighlightUpdate,
  ): Promise<Result<Highlight, HighlightRepositoryError>> {
    try {
      const db = getDB();

      // Get existing highlight
      const existing = await db.highlights.get(id);
      if (!existing) {
        return Err({ type: 'NOT_FOUND', id });
      }

      // Apply updates
      const modified = new Date().toISOString();
      const updated: Highlight = { ...existing, modified };

      if (update.color !== undefined) {
        updated.color = update.color;
      }

      if (update.orphaned !== undefined) {
        updated.orphaned = update.orphaned;
      }

      if (update.note !== undefined) {
        if (update.note === null || update.note.length === 0) {
          // Remove note
          updated.body = undefined;
        } else {
          updated.body = {
            type: 'TextualBody',
            value: update.note,
            format: 'text/plain',
          };
        }
      }

      // Validate and save
      const validated = HighlightSchema.safeParse(updated);
      if (!validated.success) {
        return Err({
          type: 'VALIDATION_ERROR',
          message: validated.error.message,
        });
      }

      await db.highlights.put(validated.data);

      return Ok(validated.data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete a highlight.
   */
  async delete(id: string): Promise<Result<void, HighlightRepositoryError>> {
    try {
      const db = getDB();

      // Check if exists
      const existing = await db.highlights.get(id);
      if (!existing) {
        return Err({ type: 'NOT_FOUND', id });
      }

      await db.highlights.delete(id);

      return Ok(undefined);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List highlights matching query.
   */
  async list(query?: HighlightQuery): Promise<Result<Highlight[], HighlightRepositoryError>> {
    try {
      const db = getDB();
      let collection = db.highlights.toCollection();

      // Apply filters
      if (query?.url) {
        collection = db.highlights.where('url').equals(query.url);
      }

      // Get all matching records
      let highlights = await collection.toArray();

      // Apply additional filters
      if (query?.color) {
        highlights = highlights.filter((h) => h.color === query.color);
      }

      if (query?.orphaned !== undefined) {
        highlights = highlights.filter((h) => h.orphaned === query.orphaned);
      }

      // Sort
      const sortBy = query?.sortBy ?? 'created';
      const sortOrder = query?.sortOrder ?? 'desc';

      highlights.sort((a, b) => {
        const aValue = sortBy === 'modified' ? (a.modified ?? a.created) : a.created;
        const bValue = sortBy === 'modified' ? (b.modified ?? b.created) : b.created;
        const comparison = new Date(aValue).getTime() - new Date(bValue).getTime();
        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Apply pagination
      if (query?.offset) {
        highlights = highlights.slice(query.offset);
      }

      if (query?.limit) {
        highlights = highlights.slice(0, query.limit);
      }

      return Ok(highlights);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get all highlights for a specific URL.
   */
  async getByUrl(url: string): Promise<Result<Highlight[], HighlightRepositoryError>> {
    return this.list({ url, sortBy: 'created', sortOrder: 'desc' });
  }

  /**
   * Delete all highlights for a URL.
   */
  async deleteByUrl(url: string): Promise<Result<number, HighlightRepositoryError>> {
    try {
      const db = getDB();

      // Get all highlights for URL
      const highlights = await db.highlights.where('url').equals(url).toArray();
      const ids = highlights.map((h) => h.id);

      // Delete all
      await db.highlights.bulkDelete(ids);

      return Ok(ids.length);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get total highlight count.
   */
  async count(): Promise<number> {
    try {
      const db = getDB();
      return await db.highlights.count();
    } catch {
      return 0;
    }
  }

  /**
   * Handle Dexie/IndexedDB errors.
   */
  private handleError(error: unknown): Result<never, HighlightRepositoryError> {
    const message = error instanceof Error ? error.message : String(error);

    // Check for quota exceeded
    if (
      message.includes('QuotaExceeded') ||
      message.includes('storage quota') ||
      message.includes('disk space')
    ) {
      return Err({ type: 'QUOTA_EXCEEDED', message });
    }

    return Err({ type: 'STORAGE_ERROR', message });
  }
}

/**
 * Factory function to create HighlightIndexedDBAdapter.
 */
export function createHighlightRepository(): IHighlightRepository {
  return new HighlightIndexedDBAdapter();
}
