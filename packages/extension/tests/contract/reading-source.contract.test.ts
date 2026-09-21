import { describe, expect, it, jest } from '@jest/globals';
import type { ReadableDocument } from '@proso/shared';
import {
  InMemoryReadingSourceAdapter,
  NoOpReadingSourceAdapter,
} from '../../src/adapters/reading-source';
import type { IReadingSource } from '../../src/ports/reading-source.port';

const document: ReadableDocument = {
  source: {
    provider: 'miniflux',
    connectionId: 'fixture',
    itemId: '1',
    canonicalUrl: 'https://publisher.test/a',
  },
  title: 'Short',
  author: null,
  language: null,
  revision: `r1-${'a'.repeat(64)}`,
  blocks: [{ id: `b1-${'b'.repeat(64)}`, kind: 'paragraph', originalText: 'Hi.' }],
  coverage: { status: 'full', reasons: [] },
  fetchedAt: 0,
};

function readingSourceContract(name: string, create: () => IReadingSource, disabled = false) {
  describe(`${name} reading-source contract`, () => {
    it('lists/gets without changing unread status', async () => {
      const adapter = create();
      const before = await adapter.list();
      const fetched = await adapter.get(document.source);
      const after = await adapter.list();
      expect(after).toEqual(before);
      if (disabled) {
        expect(before).toEqual({ ok: false, error: { type: 'NOT_CONFIGURED' } });
        expect(fetched).toEqual(before);
      } else {
        expect(before.ok).toBe(true);
        if (!before.ok) return;
        expect(before.value.items.map((item) => item.source.itemId)).toEqual(['1']);
        expect(fetched.ok).toBe(true);
        if (fetched.ok) expect(fetched.value.blocks[0].originalText).toBe('Hi.');
      }
    });
    it('rejects foreign identity, unsafe IDs, unknown items and cancelled operations', async () => {
      const adapter = create();
      for (const source of [
        { ...document.source, connectionId: 'other' },
        { ...document.source, itemId: '9007199254740992' },
        { ...document.source, itemId: '../1' },
      ]) {
        expect(await adapter.get(source)).toEqual({
          ok: false,
          error: { type: disabled ? 'NOT_CONFIGURED' : 'SOURCE_BINDING' },
        });
      }
      expect(await adapter.get({ ...document.source, itemId: '999' })).toEqual({
        ok: false,
        error: { type: disabled ? 'NOT_CONFIGURED' : 'NOT_FOUND' },
      });
      const controller = new AbortController();
      controller.abort();
      expect(await adapter.list({}, controller.signal)).toEqual({
        ok: false,
        error: { type: disabled ? 'NOT_CONFIGURED' : 'ABORTED' },
      });
      expect(await adapter.get(document.source, controller.signal)).toEqual({
        ok: false,
        error: { type: disabled ? 'NOT_CONFIGURED' : 'ABORTED' },
      });
    });
  });
}
readingSourceContract('InMemory', () => new InMemoryReadingSourceAdapter('fixture', [document]));
readingSourceContract('NoOp', () => new NoOpReadingSourceAdapter(), true);

describe('offline acknowledgement contract', () => {
  it('sets read idempotently in memory, retaining the document', async () => {
    const adapter = new InMemoryReadingSourceAdapter('fixture', [document]);
    expect(await adapter.acknowledge(document.source)).toEqual({ ok: true, value: undefined });
    expect(await adapter.acknowledge(document.source)).toEqual({ ok: true, value: undefined });
    expect(await adapter.list()).toEqual({ ok: true, value: { items: [] } });
    expect((await adapter.get(document.source)).ok).toBe(true);
  });
  it('NoOp never reports remote acknowledgement or performs networking', async () => {
    const fetchSpy = jest.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as typeof fetch;
    try {
      const adapter = new NoOpReadingSourceAdapter();
      await adapter.list();
      await adapter.get(document.source);
      expect(await adapter.acknowledge(document.source)).toEqual({
        ok: false,
        error: { type: 'NOT_CONFIGURED' },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it('injects repeatable typed faults without consuming state', async () => {
    const adapter = new InMemoryReadingSourceAdapter('fixture', [document]);
    adapter.failNext({ type: 'NETWORK' });
    expect(await adapter.acknowledge(document.source)).toEqual({
      ok: false,
      error: { type: 'NETWORK' },
    });
    expect((await adapter.list()).ok).toBe(true);
  });
});
