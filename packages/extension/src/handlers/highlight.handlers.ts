// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

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
import {
  highlightCreateParamsSchema,
  highlightGetParamsSchema,
  highlightListParamsSchema,
  highlightUpdateParamsSchema,
  highlightDeleteParamsSchema,
  highlightDeleteByUrlParamsSchema,
} from './schemas/misc.schemas';

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
  registry.register('highlight.create', async (params: unknown): Promise<HighlightCreateResponse> => {
    const parsed = highlightCreateParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
    }

    try {
      const repo = getRepository();

      // Create highlight entity
      const highlight = createHighlight({
        url: parsed.data.url,
        exact: parsed.data.exact,
        prefix: parsed.data.prefix,
        suffix: parsed.data.suffix,
        color: (parsed.data.color as HighlightColor) ?? 'yellow',
        note: parsed.data.note,
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
  registry.register('highlight.get', async (params: unknown): Promise<HighlightGetResponse> => {
    const parsed = highlightGetParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
    }

    try {
      const repo = getRepository();
      const result = await repo.get(parsed.data.id);

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
  registry.register('highlight.list', async (params: unknown): Promise<HighlightListResponse> => {
    const parsed = highlightListParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, highlights: [], error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
    }

    try {
      const repo = getRepository();
      const result = await repo.getByUrl(parsed.data.url);

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
  registry.register('highlight.update', async (params: unknown): Promise<HighlightUpdateResponse> => {
    const parsed = highlightUpdateParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
    }

    try {
      const repo = getRepository();

      const result = await repo.update(parsed.data.id, {
        color: parsed.data.color as HighlightColor | undefined,
        note: parsed.data.note,
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
  registry.register('highlight.delete', async (params: unknown): Promise<HighlightDeleteResponse> => {
    const parsed = highlightDeleteParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
    }

    try {
      const repo = getRepository();
      const result = await repo.delete(parsed.data.id);

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
  registry.register('highlight.deleteByUrl', async (params: unknown): Promise<HighlightDeleteByUrlResponse> => {
    const parsed = highlightDeleteByUrlParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, deletedCount: 0, error: 'Validation error: ' + parsed.error.issues.map(i => i.message).join('; ') };
    }

    try {
      const repo = getRepository();
      const result = await repo.deleteByUrl(parsed.data.url);

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
