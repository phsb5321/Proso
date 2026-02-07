// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.

/**
 * Unit tests for highlight message handlers.
 *
 * Tests all six highlight handlers registered via registerHighlightHandlers:
 *   - highlight.create
 *   - highlight.get
 *   - highlight.list
 *   - highlight.update
 *   - highlight.delete
 *   - highlight.deleteByUrl
 *
 * @module tests/unit/handlers/highlight.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Highlight, HighlightColor } from '../../../src/utils/schemas/highlight.schema';
import type { IHighlightRepository } from '../../../src/ports/highlight-repository.port';
import type { Result } from '../../../src/core/shared/result';
import type {
  HighlightCreateResponse,
  HighlightGetResponse,
  HighlightListResponse,
  HighlightUpdateResponse,
  HighlightDeleteResponse,
  HighlightDeleteByUrlResponse,
} from '../../../src/handlers/highlight.handlers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// ---------------------------------------------------------------------------
// Mocks (must precede dynamic imports)
// ---------------------------------------------------------------------------

jest.unstable_mockModule(
  resolve(srcDir, 'adapters/storage/highlight-indexeddb.adapter'),
  () => ({
    HighlightIndexedDBAdapter: jest.fn(),
    createHighlightRepository: jest.fn(),
  }),
);

// Dynamic imports after mocks are wired
const { registerHighlightHandlers, setHighlightRepository } = await import(
  '../../../src/handlers/highlight.handlers'
);
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okResult<T>(value: T): { ok: true; value: T } {
  return { ok: true as const, value };
}

function errResult<E>(error: E): { ok: false; error: E } {
  return { ok: false as const, error };
}

/**
 * Unwrap the dispatch envelope. `registry.dispatch` wraps the handler return
 * in its own Result. The highlight handlers return raw response objects (not
 * Result), so we just need to assert the outer dispatch succeeded.
 */
function unwrapDispatch<T>(outer: Result<T, unknown>): T {
  expect(outer.ok).toBe(true);
  if (!outer.ok) throw new Error('dispatch failed');
  return outer.value;
}

/**
 * Build a mock Highlight entity matching the W3C Web Annotation shape.
 */
function makeHighlight(overrides: Partial<{
  id: string;
  url: string;
  exact: string;
  prefix: string;
  suffix: string;
  color: HighlightColor;
  note: string;
  orphaned: boolean;
  created: string;
  modified: string;
}> = {}): Highlight {
  const id = overrides.id ?? 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const url = overrides.url ?? 'https://example.com/page';
  const exact = overrides.exact ?? 'highlighted text';
  const now = new Date().toISOString();

  const highlight: Highlight = {
    id,
    url,
    target: {
      source: url,
      selector: [
        {
          type: 'TextQuoteSelector',
          exact,
          prefix: overrides.prefix,
          suffix: overrides.suffix,
        },
      ],
    },
    color: overrides.color ?? 'yellow',
    orphaned: overrides.orphaned ?? false,
    created: overrides.created ?? now,
  };

  if (overrides.modified) {
    highlight.modified = overrides.modified;
  }

  if (overrides.note) {
    highlight.body = {
      type: 'TextualBody',
      value: overrides.note,
      format: 'text/plain',
    };
  }

  return highlight;
}

/**
 * Create a fresh mock repository with all IHighlightRepository methods.
 */
function createMockRepository(): jest.Mocked<IHighlightRepository> {
  return {
    create: jest.fn<IHighlightRepository['create']>(),
    get: jest.fn<IHighlightRepository['get']>(),
    update: jest.fn<IHighlightRepository['update']>(),
    delete: jest.fn<IHighlightRepository['delete']>(),
    list: jest.fn<IHighlightRepository['list']>(),
    getByUrl: jest.fn<IHighlightRepository['getByUrl']>(),
    deleteByUrl: jest.fn<IHighlightRepository['deleteByUrl']>(),
    count: jest.fn<IHighlightRepository['count']>(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('highlight.handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;
  let mockRepo: jest.Mocked<IHighlightRepository>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    mockRepo = createMockRepository();
    setHighlightRepository(mockRepo);
    registerHighlightHandlers(registry);
    jest.clearAllMocks();

    // Polyfill crypto.randomUUID for jsdom (used by createHighlight entity)
    if (!globalThis.crypto?.randomUUID) {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: () => '00000000-0000-4000-8000-000000000000',
        configurable: true,
      });
    }
  });

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('registration', () => {
    it('should register all six highlight handlers', () => {
      expect(registry.has('highlight.create')).toBe(true);
      expect(registry.has('highlight.get')).toBe(true);
      expect(registry.has('highlight.list')).toBe(true);
      expect(registry.has('highlight.update')).toBe(true);
      expect(registry.has('highlight.delete')).toBe(true);
      expect(registry.has('highlight.deleteByUrl')).toBe(true);
    });

    it('should register exactly 6 handlers', () => {
      expect(registry.size).toBe(6);
    });
  });

  // -----------------------------------------------------------------------
  // highlight.create
  // -----------------------------------------------------------------------

  describe('highlight.create', () => {
    it('should create a highlight and return success with id', async () => {
      const savedHighlight = makeHighlight({ id: 'new-uuid-1234' });
      mockRepo.create.mockResolvedValue(okResult(savedHighlight));

      const outer = await registry.dispatch('highlight.create', {
        url: 'https://example.com/page',
        exact: 'some text',
        color: 'blue',
      });
      const result = unwrapDispatch(outer) as HighlightCreateResponse;

      expect(result.success).toBe(true);
      expect(result.id).toBe('new-uuid-1234');
      expect(mockRepo.create).toHaveBeenCalledTimes(1);

      // Verify the highlight passed to create has expected shape
      const passedHighlight = mockRepo.create.mock.calls[0][0];
      expect(passedHighlight.url).toBe('https://example.com/page');
      expect(passedHighlight.target.selector[0].exact).toBe('some text');
      expect(passedHighlight.color).toBe('blue');
    });

    it('should default color to yellow when not specified', async () => {
      const savedHighlight = makeHighlight();
      mockRepo.create.mockResolvedValue(okResult(savedHighlight));

      await registry.dispatch('highlight.create', {
        url: 'https://example.com/page',
        exact: 'text',
      });

      const passedHighlight = mockRepo.create.mock.calls[0][0];
      expect(passedHighlight.color).toBe('yellow');
    });

    it('should include prefix and suffix when provided', async () => {
      const savedHighlight = makeHighlight({
        prefix: 'before ',
        suffix: ' after',
      });
      mockRepo.create.mockResolvedValue(okResult(savedHighlight));

      await registry.dispatch('highlight.create', {
        url: 'https://example.com/page',
        exact: 'text',
        prefix: 'before ',
        suffix: ' after',
      });

      const passedHighlight = mockRepo.create.mock.calls[0][0];
      expect(passedHighlight.target.selector[0].prefix).toBe('before ');
      expect(passedHighlight.target.selector[0].suffix).toBe(' after');
    });

    it('should include note when provided', async () => {
      const savedHighlight = makeHighlight({ note: 'my note' });
      mockRepo.create.mockResolvedValue(okResult(savedHighlight));

      await registry.dispatch('highlight.create', {
        url: 'https://example.com/page',
        exact: 'text',
        note: 'my note',
      });

      const passedHighlight = mockRepo.create.mock.calls[0][0];
      expect(passedHighlight.body?.value).toBe('my note');
    });

    it('should return failure when repository returns error', async () => {
      mockRepo.create.mockResolvedValue(
        errResult({ type: 'STORAGE_ERROR' as const, message: 'disk full' }),
      );

      const outer = await registry.dispatch('highlight.create', {
        url: 'https://example.com/page',
        exact: 'text',
      });
      const result = unwrapDispatch(outer) as HighlightCreateResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('disk full');
      expect(result.id).toBeUndefined();
    });

    it('should return failure when repository throws', async () => {
      mockRepo.create.mockRejectedValue(new Error('connection lost'));

      const outer = await registry.dispatch('highlight.create', {
        url: 'https://example.com/page',
        exact: 'text',
      });
      const result = unwrapDispatch(outer) as HighlightCreateResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('connection lost');
    });

    it('should handle non-Error thrown values', async () => {
      mockRepo.create.mockRejectedValue('string error');

      const outer = await registry.dispatch('highlight.create', {
        url: 'https://example.com/page',
        exact: 'text',
      });
      const result = unwrapDispatch(outer) as HighlightCreateResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  // -----------------------------------------------------------------------
  // highlight.get
  // -----------------------------------------------------------------------

  describe('highlight.get', () => {
    it('should return a highlight by id', async () => {
      const highlight = makeHighlight({
        id: 'test-id-123',
        url: 'https://example.com/page',
        exact: 'found text',
        color: 'green',
        note: 'important',
        orphaned: false,
        created: '2025-01-01T00:00:00.000Z',
        modified: '2025-06-01T00:00:00.000Z',
      });
      mockRepo.get.mockResolvedValue(okResult(highlight));

      const outer = await registry.dispatch('highlight.get', { id: 'test-id-123' });
      const result = unwrapDispatch(outer) as HighlightGetResponse;

      expect(result.success).toBe(true);
      expect(result.highlight).toBeDefined();
      expect(result.highlight!.id).toBe('test-id-123');
      expect(result.highlight!.url).toBe('https://example.com/page');
      expect(result.highlight!.exact).toBe('found text');
      expect(result.highlight!.color).toBe('green');
      expect(result.highlight!.note).toBe('important');
      expect(result.highlight!.orphaned).toBe(false);
      expect(result.highlight!.created).toBe('2025-01-01T00:00:00.000Z');
      expect(result.highlight!.modified).toBe('2025-06-01T00:00:00.000Z');
      expect(mockRepo.get).toHaveBeenCalledWith('test-id-123');
    });

    it('should return highlight without note when body is undefined', async () => {
      const highlight = makeHighlight({ id: 'no-note-id' });
      // Ensure no body
      delete (highlight as Partial<Highlight>).body;
      mockRepo.get.mockResolvedValue(okResult(highlight));

      const outer = await registry.dispatch('highlight.get', { id: 'no-note-id' });
      const result = unwrapDispatch(outer) as HighlightGetResponse;

      expect(result.success).toBe(true);
      expect(result.highlight!.note).toBeUndefined();
    });

    it('should return failure when highlight not found', async () => {
      mockRepo.get.mockResolvedValue(
        errResult({ type: 'NOT_FOUND' as const, id: 'missing-id' }),
      );

      const outer = await registry.dispatch('highlight.get', { id: 'missing-id' });
      const result = unwrapDispatch(outer) as HighlightGetResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Highlight not found: missing-id');
      expect(result.highlight).toBeUndefined();
    });

    it('should return failure when repository throws', async () => {
      mockRepo.get.mockRejectedValue(new Error('db error'));

      const outer = await registry.dispatch('highlight.get', { id: 'any-id' });
      const result = unwrapDispatch(outer) as HighlightGetResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('db error');
    });
  });

  // -----------------------------------------------------------------------
  // highlight.list
  // -----------------------------------------------------------------------

  describe('highlight.list', () => {
    it('should return highlights for a given URL', async () => {
      const h1 = makeHighlight({
        id: 'id-1',
        url: 'https://example.com/page',
        exact: 'first',
        color: 'yellow',
        created: '2025-01-01T00:00:00.000Z',
      });
      const h2 = makeHighlight({
        id: 'id-2',
        url: 'https://example.com/page',
        exact: 'second',
        color: 'blue',
        created: '2025-02-01T00:00:00.000Z',
      });
      mockRepo.getByUrl.mockResolvedValue(okResult([h1, h2]));

      const outer = await registry.dispatch('highlight.list', {
        url: 'https://example.com/page',
      });
      const result = unwrapDispatch(outer) as HighlightListResponse;

      expect(result.success).toBe(true);
      expect(result.highlights).toHaveLength(2);
      expect(result.highlights[0].id).toBe('id-1');
      expect(result.highlights[0].exact).toBe('first');
      expect(result.highlights[0].color).toBe('yellow');
      expect(result.highlights[1].id).toBe('id-2');
      expect(result.highlights[1].exact).toBe('second');
      expect(mockRepo.getByUrl).toHaveBeenCalledWith('https://example.com/page');
    });

    it('should return empty array when no highlights exist for URL', async () => {
      mockRepo.getByUrl.mockResolvedValue(okResult([]));

      const outer = await registry.dispatch('highlight.list', {
        url: 'https://example.com/empty',
      });
      const result = unwrapDispatch(outer) as HighlightListResponse;

      expect(result.success).toBe(true);
      expect(result.highlights).toEqual([]);
    });

    it('should return failure with empty highlights when repository returns error', async () => {
      mockRepo.getByUrl.mockResolvedValue(
        errResult({ type: 'STORAGE_ERROR' as const, message: 'corrupt index' }),
      );

      const outer = await registry.dispatch('highlight.list', {
        url: 'https://example.com/page',
      });
      const result = unwrapDispatch(outer) as HighlightListResponse;

      expect(result.success).toBe(false);
      expect(result.highlights).toEqual([]);
      expect(result.error).toBe('corrupt index');
    });

    it('should return failure with empty highlights when repository throws', async () => {
      mockRepo.getByUrl.mockRejectedValue(new Error('timeout'));

      const outer = await registry.dispatch('highlight.list', {
        url: 'https://example.com/page',
      });
      const result = unwrapDispatch(outer) as HighlightListResponse;

      expect(result.success).toBe(false);
      expect(result.highlights).toEqual([]);
      expect(result.error).toBe('timeout');
    });
  });

  // -----------------------------------------------------------------------
  // highlight.update
  // -----------------------------------------------------------------------

  describe('highlight.update', () => {
    it('should update color and return success', async () => {
      const updated = makeHighlight({ id: 'upd-id', color: 'pink' });
      mockRepo.update.mockResolvedValue(okResult(updated));

      const outer = await registry.dispatch('highlight.update', {
        id: 'upd-id',
        color: 'pink',
      });
      const result = unwrapDispatch(outer) as HighlightUpdateResponse;

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockRepo.update).toHaveBeenCalledWith('upd-id', {
        color: 'pink',
        note: undefined,
      });
    });

    it('should update note and return success', async () => {
      const updated = makeHighlight({ id: 'upd-id', note: 'updated note' });
      mockRepo.update.mockResolvedValue(okResult(updated));

      const outer = await registry.dispatch('highlight.update', {
        id: 'upd-id',
        note: 'updated note',
      });
      const result = unwrapDispatch(outer) as HighlightUpdateResponse;

      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith('upd-id', {
        color: undefined,
        note: 'updated note',
      });
    });

    it('should update both color and note', async () => {
      const updated = makeHighlight({ id: 'upd-id', color: 'purple', note: 'new' });
      mockRepo.update.mockResolvedValue(okResult(updated));

      const outer = await registry.dispatch('highlight.update', {
        id: 'upd-id',
        color: 'purple',
        note: 'new',
      });
      const result = unwrapDispatch(outer) as HighlightUpdateResponse;

      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith('upd-id', {
        color: 'purple',
        note: 'new',
      });
    });

    it('should return failure when highlight not found', async () => {
      mockRepo.update.mockResolvedValue(
        errResult({ type: 'NOT_FOUND' as const, id: 'missing-id' }),
      );

      const outer = await registry.dispatch('highlight.update', {
        id: 'missing-id',
        color: 'green',
      });
      const result = unwrapDispatch(outer) as HighlightUpdateResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Highlight not found: missing-id');
    });

    it('should return failure when repository throws', async () => {
      mockRepo.update.mockRejectedValue(new Error('write failed'));

      const outer = await registry.dispatch('highlight.update', {
        id: 'any-id',
        color: 'green',
      });
      const result = unwrapDispatch(outer) as HighlightUpdateResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('write failed');
    });
  });

  // -----------------------------------------------------------------------
  // highlight.delete
  // -----------------------------------------------------------------------

  describe('highlight.delete', () => {
    it('should delete a highlight and return success', async () => {
      mockRepo.delete.mockResolvedValue(okResult(undefined));

      const outer = await registry.dispatch('highlight.delete', { id: 'del-id' });
      const result = unwrapDispatch(outer) as HighlightDeleteResponse;

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockRepo.delete).toHaveBeenCalledWith('del-id');
    });

    it('should return failure when highlight not found', async () => {
      mockRepo.delete.mockResolvedValue(
        errResult({ type: 'NOT_FOUND' as const, id: 'missing-id' }),
      );

      const outer = await registry.dispatch('highlight.delete', { id: 'missing-id' });
      const result = unwrapDispatch(outer) as HighlightDeleteResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Highlight not found: missing-id');
    });

    it('should return failure when repository returns storage error', async () => {
      mockRepo.delete.mockResolvedValue(
        errResult({ type: 'STORAGE_ERROR' as const, message: 'locked' }),
      );

      const outer = await registry.dispatch('highlight.delete', { id: 'any-id' });
      const result = unwrapDispatch(outer) as HighlightDeleteResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('locked');
    });

    it('should return failure when repository throws', async () => {
      mockRepo.delete.mockRejectedValue(new Error('permission denied'));

      const outer = await registry.dispatch('highlight.delete', { id: 'any-id' });
      const result = unwrapDispatch(outer) as HighlightDeleteResponse;

      expect(result.success).toBe(false);
      expect(result.error).toBe('permission denied');
    });
  });

  // -----------------------------------------------------------------------
  // highlight.deleteByUrl
  // -----------------------------------------------------------------------

  describe('highlight.deleteByUrl', () => {
    it('should delete all highlights for a URL and return count', async () => {
      mockRepo.deleteByUrl.mockResolvedValue(okResult(5));

      const outer = await registry.dispatch('highlight.deleteByUrl', {
        url: 'https://example.com/page',
      });
      const result = unwrapDispatch(outer) as HighlightDeleteByUrlResponse;

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(5);
      expect(result.error).toBeUndefined();
      expect(mockRepo.deleteByUrl).toHaveBeenCalledWith('https://example.com/page');
    });

    it('should return zero count when no highlights exist for URL', async () => {
      mockRepo.deleteByUrl.mockResolvedValue(okResult(0));

      const outer = await registry.dispatch('highlight.deleteByUrl', {
        url: 'https://example.com/empty',
      });
      const result = unwrapDispatch(outer) as HighlightDeleteByUrlResponse;

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });

    it('should return failure with zero count when repository returns error', async () => {
      mockRepo.deleteByUrl.mockResolvedValue(
        errResult({ type: 'STORAGE_ERROR' as const, message: 'transaction aborted' }),
      );

      const outer = await registry.dispatch('highlight.deleteByUrl', {
        url: 'https://example.com/page',
      });
      const result = unwrapDispatch(outer) as HighlightDeleteByUrlResponse;

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.error).toBe('transaction aborted');
    });

    it('should return failure with zero count when repository throws', async () => {
      mockRepo.deleteByUrl.mockRejectedValue(new Error('catastrophic'));

      const outer = await registry.dispatch('highlight.deleteByUrl', {
        url: 'https://example.com/page',
      });
      const result = unwrapDispatch(outer) as HighlightDeleteByUrlResponse;

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.error).toBe('catastrophic');
    });
  });

  // -----------------------------------------------------------------------
  // Repository not initialized (fallback to createHighlightRepository)
  // -----------------------------------------------------------------------

  describe('repository initialization', () => {
    it('should auto-create repository via createHighlightRepository when not set', async () => {
      // Use a fresh registry without calling setHighlightRepository.
      // The mock for createHighlightRepository returns undefined, so
      // getRepository() will set the singleton to the return value.
      // We need to reset the module-level singleton by setting it to a
      // mock repo, then testing normally. The auto-creation path is
      // implicitly tested by the fact that all tests above work after
      // calling setHighlightRepository.
      //
      // To explicitly test the error path when createHighlightRepository
      // fails, we import the mocked adapter and make it throw.
      const { createHighlightRepository } = await import(
        resolve(srcDir, 'adapters/storage/highlight-indexeddb.adapter')
      );
      const mockCreate = createHighlightRepository as jest.MockedFunction<
        typeof createHighlightRepository
      >;

      // Reset the singleton by setting null-ish repo
      setHighlightRepository(null as unknown as IHighlightRepository);

      // Make createHighlightRepository return a working repo
      const fallbackRepo = createMockRepository();
      fallbackRepo.get.mockResolvedValue(
        okResult(makeHighlight({ id: 'auto-id' })),
      );
      mockCreate.mockReturnValue(fallbackRepo);

      const freshRegistry = new HandlerRegistry();
      registerHighlightHandlers(freshRegistry);

      const outer = await freshRegistry.dispatch('highlight.get', { id: 'auto-id' });
      const result = unwrapDispatch(outer) as HighlightGetResponse;

      expect(result.success).toBe(true);
      expect(result.highlight!.id).toBe('auto-id');
      expect(mockCreate).toHaveBeenCalled();

      // Restore the mock repo for other tests
      setHighlightRepository(mockRepo);
    });
  });

  // -----------------------------------------------------------------------
  // Dispatch for unregistered handler
  // -----------------------------------------------------------------------

  describe('dispatch unknown handler', () => {
    it('should return not_found error for unregistered handler', async () => {
      const result = await registry.dispatch('highlight.nonexistent', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.handlerName).toBe('highlight.nonexistent');
      }
    });
  });
});
