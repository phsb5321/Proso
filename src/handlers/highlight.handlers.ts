// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Highlight Message Handlers
 *
 * Handlers for highlight CRUD operations using hexagonal architecture.
 * Implements message protocol for highlight.* messages.
 *
 * @module handlers/highlight
 */

import type { HandlerRegistry } from './registry';
import type { IHighlightRepository } from '../ports/highlight-repository.port';
import { createHighlight, type HighlightColor } from '../core/highlight/highlight.entity';
import { isOk } from '../core/shared/result';
import { createHighlightRepository } from '../adapters/storage/highlight-indexeddb.adapter';

/**
 * Highlight handler error types
 */
export type HighlightHandlerError =
  | { type: 'NOT_FOUND'; id: string }
  | { type: 'STORAGE_ERROR'; message: string }
  | { type: 'VALIDATION_ERROR'; message: string };

/**
 * Response types for highlight handlers
 */
export interface HighlightCreateResponse {
  success: boolean;
  id?: string;
  error?: string;
}

export interface HighlightGetResponse {
  success: boolean;
  highlight?: {
    id: string;
    url: string;
    exact: string;
    prefix?: string;
    suffix?: string;
    color: HighlightColor;
    note?: string;
    orphaned: boolean;
    created: string;
    modified?: string;
  };
  error?: string;
}

export interface HighlightListResponse {
  success: boolean;
  highlights: Array<{
    id: string;
    url: string;
    exact: string;
    color: HighlightColor;
    orphaned: boolean;
    created: string;
  }>;
  error?: string;
}

export interface HighlightUpdateResponse {
  success: boolean;
  error?: string;
}

export interface HighlightDeleteResponse {
  success: boolean;
  error?: string;
}

export interface HighlightDeleteByUrlResponse {
  success: boolean;
  deletedCount: number;
  error?: string;
}

/**
 * Format repository error to string.
 */
function formatError(error: { type: string; message?: string; id?: string }): string {
  if (error.type === 'NOT_FOUND') {
    return `Highlight not found: ${error.id ?? 'unknown'}`;
  }
  return (error as { message?: string }).message ?? `Error: ${error.type}`;
}

// Repository instance (singleton)
let highlightRepository: IHighlightRepository | null = null;

/**
 * Get the highlight repository, creating if needed.
 */
function getRepository(): IHighlightRepository {
  if (!highlightRepository) {
    highlightRepository = createHighlightRepository();
  }
  return highlightRepository;
}

/**
 * Set the highlight repository (for testing).
 */
export function setHighlightRepository(repo: IHighlightRepository): void {
  highlightRepository = repo;
}

/**
 * Register all highlight handlers.
 *
 * @param registry - Handler registry to register with
 */
export function registerHighlightHandlers(registry: HandlerRegistry): void {
  // CREATE
  registry.register('highlight.create', async (params: {
    url: string;
    exact: string;
    prefix?: string;
    suffix?: string;
    color?: HighlightColor;
    note?: string;
  }): Promise<HighlightCreateResponse> => {
    try {
      const repo = getRepository();

      // Create highlight entity
      const highlight = createHighlight({
        url: params.url,
        exact: params.exact,
        prefix: params.prefix,
        suffix: params.suffix,
        color: params.color ?? 'yellow',
        note: params.note,
      });

      // Save to repository
      const result = await repo.create(highlight);

      if (isOk(result)) {
        return { success: true, id: result.value.id };
      }

      return {
        success: false,
        error: formatError(result.error),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // GET
  registry.register('highlight.get', async (params: {
    id: string;
  }): Promise<HighlightGetResponse> => {
    try {
      const repo = getRepository();
      const result = await repo.get(params.id);

      if (isOk(result)) {
        const h = result.value;
        const selector = h.target.selector[0];

        return {
          success: true,
          highlight: {
            id: h.id,
            url: h.url,
            exact: selector.exact,
            prefix: selector.prefix,
            suffix: selector.suffix,
            color: h.color,
            note: h.body?.value,
            orphaned: h.orphaned,
            created: h.created,
            modified: h.modified,
          },
        };
      }

      return { success: false, error: formatError(result.error) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // LIST
  registry.register('highlight.list', async (params: {
    url: string;
  }): Promise<HighlightListResponse> => {
    try {
      const repo = getRepository();
      const result = await repo.getByUrl(params.url);

      if (isOk(result)) {
        const highlights = result.value.map((h) => ({
          id: h.id,
          url: h.url,
          exact: h.target.selector[0].exact,
          color: h.color,
          orphaned: h.orphaned,
          created: h.created,
        }));

        return { success: true, highlights };
      }

      return { success: false, highlights: [], error: formatError(result.error) };
    } catch (error) {
      return {
        success: false,
        highlights: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // UPDATE
  registry.register('highlight.update', async (params: {
    id: string;
    color?: HighlightColor;
    note?: string;
  }): Promise<HighlightUpdateResponse> => {
    try {
      const repo = getRepository();

      const result = await repo.update(params.id, {
        color: params.color,
        note: params.note,
      });

      if (isOk(result)) {
        return { success: true };
      }

      return { success: false, error: formatError(result.error) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // DELETE
  registry.register('highlight.delete', async (params: {
    id: string;
  }): Promise<HighlightDeleteResponse> => {
    try {
      const repo = getRepository();
      const result = await repo.delete(params.id);

      if (isOk(result)) {
        return { success: true };
      }

      return { success: false, error: formatError(result.error) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // DELETE BY URL
  registry.register('highlight.deleteByUrl', async (params: {
    url: string;
  }): Promise<HighlightDeleteByUrlResponse> => {
    try {
      const repo = getRepository();
      const result = await repo.deleteByUrl(params.url);

      if (isOk(result)) {
        return { success: true, deletedCount: result.value };
      }

      return { success: false, deletedCount: 0, error: formatError(result.error) };
    } catch (error) {
      return {
        success: false,
        deletedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}
