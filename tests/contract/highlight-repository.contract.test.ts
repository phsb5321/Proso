/**
 * IHighlightRepository Contract Tests
 *
 * These tests define the contract that all highlight repository adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/highlight-repository
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type {
  IHighlightRepository,
  HighlightRepositoryError,
  HighlightQuery,
  HighlightUpdate,
} from '../../src/ports/highlight-repository.port';
import type { Result } from '../../src/core/shared/result';
import { Ok, Err, isOk, isErr } from '../../src/core/shared/result';
import type { Highlight, HighlightColor } from '../../src/utils/schemas/highlight.schema';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let idCounter = 0;

/** Generate a deterministic UUID v4 for test environments without crypto.randomUUID. */
function testUUID(): string {
  idCounter++;
  const hex = idCounter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

function createTestHighlight(overrides: Partial<Highlight> = {}): Highlight {
  const id = overrides.id ?? testUUID();
  const url = overrides.url ?? 'https://example.com/article';
  const now = new Date().toISOString();

  return {
    id,
    url,
    target: {
      source: url,
      selector: [
        {
          type: 'TextQuoteSelector',
          exact: 'highlighted text',
          prefix: 'some ',
          suffix: ' here',
        },
      ],
    },
    color: 'yellow',
    orphaned: false,
    created: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock in-memory adapter
// ---------------------------------------------------------------------------

/** Deep clone a plain data object (no Blobs/Dates/etc.). */
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * In-memory mock implementation of IHighlightRepository.
 *
 * Uses a Map<string, Highlight> to simulate storage without IndexedDB.
 */
class MockHighlightRepository implements IHighlightRepository {
  private store = new Map<string, Highlight>();

  async create(highlight: Highlight): Promise<Result<Highlight, HighlightRepositoryError>> {
    const copy = clone(highlight);
    this.store.set(copy.id, copy);
    return Ok(clone(copy));
  }

  async get(id: string): Promise<Result<Highlight, HighlightRepositoryError>> {
    const highlight = this.store.get(id);
    if (!highlight) {
      return Err({ type: 'NOT_FOUND', id });
    }
    return Ok(clone(highlight));
  }

  async update(
    id: string,
    update: HighlightUpdate,
  ): Promise<Result<Highlight, HighlightRepositoryError>> {
    const existing = this.store.get(id);
    if (!existing) {
      return Err({ type: 'NOT_FOUND', id });
    }

    const modified = new Date().toISOString();
    const updated: Highlight = { ...clone(existing), modified };

    if (update.color !== undefined) {
      updated.color = update.color;
    }

    if (update.orphaned !== undefined) {
      updated.orphaned = update.orphaned;
    }

    if (update.note !== undefined) {
      if (update.note.length === 0) {
        updated.body = undefined;
      } else {
        updated.body = {
          type: 'TextualBody',
          value: update.note,
          format: 'text/plain',
        };
      }
    }

    this.store.set(id, clone(updated));
    return Ok(clone(updated));
  }

  async delete(id: string): Promise<Result<void, HighlightRepositoryError>> {
    if (!this.store.has(id)) {
      return Err({ type: 'NOT_FOUND', id });
    }
    this.store.delete(id);
    return Ok(undefined);
  }

  async list(query?: HighlightQuery): Promise<Result<Highlight[], HighlightRepositoryError>> {
    let highlights = Array.from(this.store.values()).map((h) => clone(h));

    // Apply filters
    if (query?.url) {
      highlights = highlights.filter((h) => h.url === query.url);
    }
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

    // Pagination
    if (query?.offset) {
      highlights = highlights.slice(query.offset);
    }
    if (query?.limit) {
      highlights = highlights.slice(0, query.limit);
    }

    return Ok(highlights);
  }

  async getByUrl(url: string): Promise<Result<Highlight[], HighlightRepositoryError>> {
    return this.list({ url, sortBy: 'created', sortOrder: 'desc' });
  }

  async deleteByUrl(url: string): Promise<Result<number, HighlightRepositoryError>> {
    let count = 0;
    for (const [id, h] of this.store) {
      if (h.url === url) {
        this.store.delete(id);
        count++;
      }
    }
    return Ok(count);
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  /** Test helper: clear all data between tests. */
  clear(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Contract test suite
// ---------------------------------------------------------------------------

/**
 * Contract test suite for IHighlightRepository implementations.
 *
 * Usage:
 * ```typescript
 * runHighlightRepositoryContractTests(
 *   'HighlightIndexedDBAdapter',
 *   () => new HighlightIndexedDBAdapter(),
 * );
 * ```
 */
export function runHighlightRepositoryContractTests(
  adapterName: string,
  createAdapter: () => IHighlightRepository & { clear?: () => void | Promise<void> },
) {
  describe(`${adapterName} implements IHighlightRepository contract`, () => {
    let adapter: IHighlightRepository & { clear?: () => void | Promise<void> };

    beforeEach(async () => {
      adapter = createAdapter();
      idCounter = 0;
      // Clear data between tests if the adapter supports it
      if (typeof adapter.clear === 'function') {
        await adapter.clear();
      }
    });

    // -----------------------------------------------------------------
    // 1. Interface compliance
    // -----------------------------------------------------------------
    describe('interface compliance', () => {
      it('should have all required methods', () => {
        expect(typeof adapter.create).toBe('function');
        expect(typeof adapter.get).toBe('function');
        expect(typeof adapter.update).toBe('function');
        expect(typeof adapter.delete).toBe('function');
        expect(typeof adapter.list).toBe('function');
        expect(typeof adapter.getByUrl).toBe('function');
        expect(typeof adapter.deleteByUrl).toBe('function');
        expect(typeof adapter.count).toBe('function');
      });
    });

    // -----------------------------------------------------------------
    // 2. create()
    // -----------------------------------------------------------------
    describe('create()', () => {
      it('should return Result with ok:true containing created highlight', async () => {
        const highlight = createTestHighlight();
        const result = await adapter.create(highlight);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.id).toBe(highlight.id);
          expect(result.value.url).toBe(highlight.url);
          expect(result.value.color).toBe(highlight.color);
          expect(result.value.orphaned).toBe(false);
          expect(result.value.target.selector).toHaveLength(1);
          expect(result.value.target.selector[0].exact).toBe('highlighted text');
        }
      });
    });

    // -----------------------------------------------------------------
    // 3-4. get()
    // -----------------------------------------------------------------
    describe('get()', () => {
      it('should return Result with ok:true for existing highlight', async () => {
        const highlight = createTestHighlight();
        await adapter.create(highlight);

        const result = await adapter.get(highlight.id);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.id).toBe(highlight.id);
          expect(result.value.url).toBe(highlight.url);
          expect(result.value.color).toBe(highlight.color);
        }
      });

      it('should return NOT_FOUND error for non-existent id', async () => {
        const result = await adapter.get('non-existent-id');

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.type).toBe('NOT_FOUND');
          expect((result.error as { type: 'NOT_FOUND'; id: string }).id).toBe(
            'non-existent-id',
          );
        }
      });
    });

    // -----------------------------------------------------------------
    // 5-6. update()
    // -----------------------------------------------------------------
    describe('update()', () => {
      it('should return Result with updated highlight', async () => {
        const highlight = createTestHighlight();
        await adapter.create(highlight);

        const result = await adapter.update(highlight.id, {
          color: 'blue',
          note: 'test note',
        });

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.id).toBe(highlight.id);
          expect(result.value.color).toBe('blue');
          expect(result.value.body).toBeDefined();
          expect(result.value.body?.value).toBe('test note');
          expect(result.value.modified).toBeDefined();
        }
      });

      it('should return NOT_FOUND for non-existent id', async () => {
        const result = await adapter.update('non-existent-id', { color: 'green' });

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.type).toBe('NOT_FOUND');
        }
      });
    });

    // -----------------------------------------------------------------
    // 7-8. delete()
    // -----------------------------------------------------------------
    describe('delete()', () => {
      it('should return Result with ok:true for existing highlight', async () => {
        const highlight = createTestHighlight();
        await adapter.create(highlight);

        const result = await adapter.delete(highlight.id);

        expect(isOk(result)).toBe(true);

        // Verify it was actually removed
        const getResult = await adapter.get(highlight.id);
        expect(isErr(getResult)).toBe(true);
      });

      it('should return NOT_FOUND for non-existent id', async () => {
        const result = await adapter.delete('non-existent-id');

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.type).toBe('NOT_FOUND');
        }
      });
    });

    // -----------------------------------------------------------------
    // 9-10. list()
    // -----------------------------------------------------------------
    describe('list()', () => {
      it('should return all highlights when no query', async () => {
        const h1 = createTestHighlight();
        const h2 = createTestHighlight();
        await adapter.create(h1);
        await adapter.create(h2);

        const result = await adapter.list();

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toHaveLength(2);
        }
      });

      it('should filter by url', async () => {
        const h1 = createTestHighlight({ url: 'https://example.com/page-a' });
        // Ensure target.source matches url
        h1.target.source = h1.url;
        const h2 = createTestHighlight({ url: 'https://example.com/page-b' });
        h2.target.source = h2.url;

        await adapter.create(h1);
        await adapter.create(h2);

        const result = await adapter.list({ url: 'https://example.com/page-a' });

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toHaveLength(1);
          expect(result.value[0].url).toBe('https://example.com/page-a');
        }
      });

      it('should filter by color', async () => {
        const h1 = createTestHighlight({ color: 'yellow' });
        const h2 = createTestHighlight({ color: 'blue' });

        await adapter.create(h1);
        await adapter.create(h2);

        const result = await adapter.list({ color: 'blue' });

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toHaveLength(1);
          expect(result.value[0].color).toBe('blue');
        }
      });

      it('should respect limit and offset', async () => {
        // Create 3 highlights with staggered timestamps
        const highlights: Highlight[] = [];
        for (let i = 0; i < 3; i++) {
          const h = createTestHighlight({
            created: new Date(Date.now() + i * 1000).toISOString(),
          });
          highlights.push(h);
          await adapter.create(h);
        }

        const result = await adapter.list({
          sortBy: 'created',
          sortOrder: 'asc',
          limit: 2,
          offset: 1,
        });

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toHaveLength(2);
        }
      });
    });

    // -----------------------------------------------------------------
    // 11. getByUrl()
    // -----------------------------------------------------------------
    describe('getByUrl()', () => {
      it('should return highlights for specific url', async () => {
        const targetUrl = 'https://example.com/target';
        const h1 = createTestHighlight({ url: targetUrl });
        h1.target.source = targetUrl;
        const h2 = createTestHighlight({ url: targetUrl });
        h2.target.source = targetUrl;
        const h3 = createTestHighlight({ url: 'https://example.com/other' });
        h3.target.source = h3.url;

        await adapter.create(h1);
        await adapter.create(h2);
        await adapter.create(h3);

        const result = await adapter.getByUrl(targetUrl);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toHaveLength(2);
          expect(result.value.every((h) => h.url === targetUrl)).toBe(true);
        }
      });

      it('should return empty array for url with no highlights', async () => {
        const result = await adapter.getByUrl('https://example.com/nothing');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toHaveLength(0);
        }
      });
    });

    // -----------------------------------------------------------------
    // 12. deleteByUrl()
    // -----------------------------------------------------------------
    describe('deleteByUrl()', () => {
      it('should return count of deleted highlights', async () => {
        const targetUrl = 'https://example.com/delete-me';
        const h1 = createTestHighlight({ url: targetUrl });
        h1.target.source = targetUrl;
        const h2 = createTestHighlight({ url: targetUrl });
        h2.target.source = targetUrl;
        const h3 = createTestHighlight({ url: 'https://example.com/keep' });
        h3.target.source = h3.url;

        await adapter.create(h1);
        await adapter.create(h2);
        await adapter.create(h3);

        const result = await adapter.deleteByUrl(targetUrl);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(2);
        }

        // Verify remaining count
        const remaining = await adapter.count();
        expect(remaining).toBe(1);
      });

      it('should return 0 when url has no highlights', async () => {
        const result = await adapter.deleteByUrl('https://example.com/empty');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(0);
        }
      });
    });

    // -----------------------------------------------------------------
    // 13. count()
    // -----------------------------------------------------------------
    describe('count()', () => {
      it('should return 0 when empty', async () => {
        const count = await adapter.count();
        expect(count).toBe(0);
      });

      it('should return correct count after operations', async () => {
        const h1 = createTestHighlight();
        const h2 = createTestHighlight();
        const h3 = createTestHighlight();

        await adapter.create(h1);
        await adapter.create(h2);
        await adapter.create(h3);

        expect(await adapter.count()).toBe(3);

        await adapter.delete(h1.id);

        expect(await adapter.count()).toBe(2);
      });
    });

    // -----------------------------------------------------------------
    // Error type shape validation
    // -----------------------------------------------------------------
    describe('error types', () => {
      it('NOT_FOUND error should have type and id fields', async () => {
        const result = await adapter.get('missing-id');

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          const error = result.error;
          expect(error.type).toBe('NOT_FOUND');
          expect('id' in error).toBe(true);
          expect((error as { type: 'NOT_FOUND'; id: string }).id).toBe('missing-id');
        }
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Run contract tests against MockHighlightRepository
// ---------------------------------------------------------------------------

runHighlightRepositoryContractTests(
  'MockHighlightRepository',
  () => new MockHighlightRepository(),
);

/**
 * Placeholder test to satisfy Jest requirement.
 */
describe('IHighlightRepository Contract', () => {
  it('exports contract test helpers', () => {
    expect(typeof runHighlightRepositoryContractTests).toBe('function');
  });
});
