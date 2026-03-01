// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Highlight Repository Port Interface
 *
 * Defines the contract for persisting and retrieving highlights.
 * Primary adapter: HighlightIndexedDBAdapter
 *
 * @module ports/highlight-repository
 */

import type { Result } from '../core/shared/result';
import type { Highlight, HighlightColor } from '../utils/schemas/highlight.schema';

/**
 * Repository operation error types
 */
export type HighlightRepositoryError =
  | { type: 'NOT_FOUND'; id: string }
  | { type: 'STORAGE_ERROR'; message: string }
  | { type: 'VALIDATION_ERROR'; message: string }
  | { type: 'QUOTA_EXCEEDED'; message: string };

/**
 * Query options for listing highlights
 */
export interface HighlightQuery {
  /** Filter by URL */
  url?: string;

  /** Filter by color */
  color?: HighlightColor;

  /** Filter orphaned highlights */
  orphaned?: boolean;

  /** Sort field */
  sortBy?: 'created' | 'modified';

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';

  /** Maximum results */
  limit?: number;

  /** Skip results for pagination */
  offset?: number;
}

/**
 * Highlight update data (partial)
 */
export interface HighlightUpdate {
  /** Update color */
  color?: HighlightColor;

  /** Update note */
  note?: string;

  /** Update orphaned status */
  orphaned?: boolean;
}

/**
 * Port interface for highlight persistence.
 *
 * Implementation:
 * - HighlightIndexedDBAdapter - IndexedDB-based storage
 */
export interface IHighlightRepository {
  /**
   * Create a new highlight.
   *
   * @param highlight - Highlight to create
   * @returns Result with created highlight or error
   */
  create(highlight: Highlight): Promise<Result<Highlight, HighlightRepositoryError>>;

  /**
   * Get a highlight by ID.
   *
   * @param id - Highlight UUID
   * @returns Result with highlight or NOT_FOUND error
   */
  get(id: string): Promise<Result<Highlight, HighlightRepositoryError>>;

  /**
   * Update an existing highlight.
   *
   * @param id - Highlight UUID
   * @param update - Fields to update
   * @returns Result with updated highlight or error
   */
  update(id: string, update: HighlightUpdate): Promise<Result<Highlight, HighlightRepositoryError>>;

  /**
   * Delete a highlight.
   *
   * @param id - Highlight UUID
   * @returns Result with success or error
   */
  delete(id: string): Promise<Result<void, HighlightRepositoryError>>;

  /**
   * List highlights matching query.
   *
   * @param query - Query options
   * @returns Result with highlight array or error
   */
  list(query?: HighlightQuery): Promise<Result<Highlight[], HighlightRepositoryError>>;

  /**
   * Get all highlights for a specific URL.
   *
   * @param url - Page URL
   * @returns Result with highlight array or error
   */
  getByUrl(url: string): Promise<Result<Highlight[], HighlightRepositoryError>>;

  /**
   * Delete all highlights for a URL.
   *
   * @param url - Page URL
   * @returns Result with deleted count or error
   */
  deleteByUrl(url: string): Promise<Result<number, HighlightRepositoryError>>;

  /**
   * Get total highlight count.
   *
   * @returns Total number of highlights
   */
  count(): Promise<number>;
}
