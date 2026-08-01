// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Highlight Message Handlers
 *
 * Handlers for highlight CRUD operations using hexagonal architecture.
 * Implements message protocol for highlight.* messages.
 *
 * @module handlers/highlight
 */

import type { SafeParseReturnType, ZodError } from 'zod';
import { createHighlightRepository } from '../adapters/storage/highlight-indexeddb.adapter';
import { serializeHighlightAnchors } from '../core/highlight/highlight-export';
import { type HighlightColor, createHighlight } from '../core/highlight/highlight.entity';
import type { Result } from '../core/shared/result';
import { Ok, isOk } from '../core/shared/result';
import type {
  HighlightRepositoryError,
  IHighlightRepository,
} from '../ports/highlight-repository.port';
import type { HandlerRegistry } from './registry';
import {
  highlightCreateParamsSchema,
  highlightDeleteByUrlParamsSchema,
  highlightDeleteParamsSchema,
  highlightGetParamsSchema,
  highlightListParamsSchema,
  highlightReportAnchoringParamsSchema,
  highlightUpdateParamsSchema,
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

/**
 * What a handler answers when the only question is "did it work".
 *
 * `HighlightUpdateResponse` and `HighlightDeleteResponse` are both this shape.
 * The handler that serves both is typed against this instead of borrowing one
 * of their names, which would have it claim to answer the other's message.
 */
type AcknowledgedResponse = { success: boolean; error?: string };

export interface HighlightDeleteByUrlResponse {
  success: boolean;
  deletedCount: number;
  error?: string;
}

export interface HighlightExportResponse {
  success: boolean;
  /** The whole export document, ready to be written to disk verbatim. */
  json?: string;
  /** How many highlights the document holds, for the caller to report. */
  count?: number;
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

/**
 * Render a schema rejection as the error string handlers report.
 */
function validationError(error: ZodError): string {
  return 'Validation error: ' + error.issues.map((i) => i.message).join('; ');
}

/**
 * Describe something that was thrown rather than returned as a Result.
 *
 * Every handler here funnels throws into its own failure response, so the
 * wording lives in one place instead of being restated at each catch.
 */
function unexpectedError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
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
 * Register a handler whose answer is only "did it work, and if not why".
 *
 * `highlight.update` and `highlight.delete` differ solely in the schema they
 * accept and the repository call they make. Spelling the surrounding validate/
 * call/report dance out twice is how the two drift apart.
 */
function registerAcknowledged<T>(
  registry: HandlerRegistry,
  message: string,
  schema: { safeParse: (input: unknown) => SafeParseReturnType<unknown, T> },
  apply: (
    repo: IHighlightRepository,
    params: T,
  ) => Promise<Result<unknown, HighlightRepositoryError>>,
): void {
  registry.register(message, async (params: unknown): Promise<AcknowledgedResponse> => {
    const parsed = schema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: validationError(parsed.error) };
    }

    try {
      const result = await apply(getRepository(), parsed.data);

      return isOk(result)
        ? { success: true }
        : { success: false, error: formatError(result.error) };
    } catch (error) {
      return { success: false, error: unexpectedError(error) };
    }
  });
}

/**
 * Persist how each highlight anchored against the page.
 *
 * Runs the updates together and reports the first failure. The rest are not
 * rolled back and should not be: a highlight deleted from another tab
 * mid-render makes its own update fail without saying anything about the
 * others, whose new flags are correct and already written.
 *
 * Success is its own value rather than one of the updated highlights. Handing
 * back `applied[0]` would answer "did the batch work" with a record of one
 * particular highlight, and would depend on the batch being non-empty to
 * answer at all.
 */
async function applyAnchoringResults(
  repo: IHighlightRepository,
  results: readonly { id: string; orphaned: boolean }[],
): Promise<Result<unknown, HighlightRepositoryError>> {
  const applied = await Promise.all(
    results.map((result) => repo.update(result.id, { orphaned: result.orphaned })),
  );

  return applied.find((result) => !isOk(result)) ?? Ok(undefined);
}

/**
 * Register all highlight handlers.
 *
 * @param registry - Handler registry to register with
 */
export function registerHighlightHandlers(registry: HandlerRegistry): void {
  // CREATE
  registry.register(
    'highlight.create',
    async (params: unknown): Promise<HighlightCreateResponse> => {
      const parsed = highlightCreateParamsSchema.safeParse(params);
      if (!parsed.success) {
        return { success: false, error: validationError(parsed.error) };
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
        return { success: false, error: unexpectedError(error) };
      }
    },
  );

  // GET
  registry.register('highlight.get', async (params: unknown): Promise<HighlightGetResponse> => {
    const parsed = highlightGetParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, error: validationError(parsed.error) };
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
      return { success: false, error: unexpectedError(error) };
    }
  });

  // LIST
  registry.register('highlight.list', async (params: unknown): Promise<HighlightListResponse> => {
    const parsed = highlightListParamsSchema.safeParse(params);
    if (!parsed.success) {
      return { success: false, highlights: [], error: validationError(parsed.error) };
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
      return { success: false, highlights: [], error: unexpectedError(error) };
    }
  });

  // UPDATE
  registerAcknowledged(registry, 'highlight.update', highlightUpdateParamsSchema, (repo, params) =>
    repo.update(params.id, {
      color: params.color as HighlightColor | undefined,
      note: params.note,
    }),
  );

  // DELETE
  registerAcknowledged(registry, 'highlight.delete', highlightDeleteParamsSchema, (repo, params) =>
    repo.delete(params.id),
  );

  // ANCHORING RESULTS
  registerAcknowledged(
    registry,
    'highlight.reportAnchoring',
    highlightReportAnchoringParamsSchema,
    (repo, params) => applyAnchoringResults(repo, params.results),
  );

  // DELETE BY URL
  registry.register(
    'highlight.deleteByUrl',
    async (params: unknown): Promise<HighlightDeleteByUrlResponse> => {
      const parsed = highlightDeleteByUrlParamsSchema.safeParse(params);
      if (!parsed.success) {
        return { success: false, deletedCount: 0, error: validationError(parsed.error) };
      }

      try {
        const repo = getRepository();
        const result = await repo.deleteByUrl(parsed.data.url);

        if (isOk(result)) {
          return { success: true, deletedCount: result.value };
        }

        return { success: false, deletedCount: 0, error: formatError(result.error) };
      } catch (error) {
        return { success: false, deletedCount: 0, error: unexpectedError(error) };
      }
    },
  );

  // EXPORT
  // Highlights are otherwise reachable only from inside the profile's
  // IndexedDB. This is the one way out: every highlight, in the flat anchor
  // shape, serialised here so the file's contents are decided in one place
  // rather than by each caller that happens to write one.
  registry.register('highlight.export', async (): Promise<HighlightExportResponse> => {
    try {
      const repo = getRepository();
      // No query — an export that silently paginated would hand the consumer a
      // partial file that still looks complete.
      const result = await repo.list();

      if (isOk(result)) {
        return {
          success: true,
          json: serializeHighlightAnchors(result.value),
          count: result.value.length,
        };
      }

      return { success: false, error: formatError(result.error) };
    } catch (error) {
      return { success: false, error: unexpectedError(error) };
    }
  });
}
