import { createHash } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { Ok, unwrap } from '@proso/shared';
import { InMemoryListeningQueueStoreAdapter } from '../../../../src/adapters/listening-queue/in-memory-listening-queue-store.adapter';
import {
  createQueueEnvelope,
  createQueueItem,
  queueFence,
  recoverQueueSession,
  refreshQueue,
  reorderQueue,
  replaceQueueOwner,
  setQueueSettings,
  stopQueue,
} from '../../../../src/core/listening-queue';
import type {
  QueueEnvelope,
  QueueItem,
  QueueSettings,
  QueueTransition,
} from '../../../../src/core/listening-queue';
import { createReadableDocument } from '../../../../src/core/reading-source/document-identity';
import { sourceIdentity } from '../../../../src/core/reading-source/source-binding';

const SESSION = '0123456789abcdef0123456789abcdef';
const NEXT_SESSION = 'fedcba9876543210fedcba9876543210';
const digest = async (text: string) => Ok(createHash('sha256').update(text).digest('hex'));

async function item(id: string, publishedAt: number | null = 1, connectionId = 'reader-a') {
  const document = unwrap(
    await createReadableDocument(
      {
        source: {
          provider: 'miniflux',
          connectionId,
          itemId: id,
          canonicalUrl: 'https://publisher.test/same-url',
        },
        title: `Article ${id}`,
        author: null,
        language: null,
        fetchedAt: 100,
      },
      {
        blocks: [{ kind: 'paragraph', originalText: 'Read this article.', parentOrdinal: null }],
        coverage: { status: 'full', reasons: [] },
      },
      digest,
    ),
  );
  return unwrap(await createQueueItem(document, publishedAt, 100, digest));
}

function imported(items: readonly QueueItem[]) {
  return unwrap(refreshQueue(createQueueEnvelope(), items));
}

function started(items: readonly QueueItem[]) {
  const queue = unwrap(recoverQueueSession(imported(items), SESSION));
  return unwrap(replaceQueueOwner(queue, { kind: 'queue', key: sourceIdentity(items[0].source) }));
}

describe('queue envelope v1 (T010, REQ-004/REQ-009)', () => {
  it('starts empty and disabled with the four specified defaults', () => {
    expect(createQueueEnvelope()).toMatchObject({
      schemaVersion: 1,
      minReaderVersion: 1,
      commitSequence: 0,
      settings: {
        ordering: 'oldest-first',
        continuousPlayback: false,
        markReadOnCompletion: false,
        prefetchBudget: 10_000,
      },
      items: [],
      order: [],
      activeOwner: null,
      sessionId: null,
      generation: 0,
      connectionEpochs: [],
      deletionTombstones: [],
      migration: null,
    });
  });

  it('uses the source tuple, not URL or item ID, for membership', async () => {
    const a = await item('1');
    const b = await item('1', 1, 'reader-b');
    const c = await item('2');
    const queue = imported([a, b, c]);
    expect(queue.items).toHaveLength(3);
    expect(new Set(queue.order).size).toBe(3);
    expect(queue.order).toContain('["miniflux","reader-b","1"]');
    const alias = {
      ...a,
      source: { ...a.source, canonicalUrl: 'https://publisher.test/new-url' },
      snapshot: {
        ...a.snapshot,
        source: { ...a.source, canonicalUrl: 'https://publisher.test/new-url' },
      },
    };
    expect(unwrap(refreshQueue(queue, [alias])).items).toEqual(queue.items);
  });

  it('orders dates and ties deterministically regardless of page arrival order; unknown dates last', async () => {
    const a = await item('1', 20);
    const b = await item('2', 10);
    const c = await item('3', 10);
    const unknown = await item('4', null);
    const expected = [b, c, a, unknown].map((entry) => sourceIdentity(entry.source));
    expect(imported([a, c, unknown, b]).order).toEqual(expected);
    expect(imported([unknown, b, c, a]).order).toEqual(expected);
    const newest = unwrap(
      setQueueSettings(imported([a, b, unknown, c]), { ordering: 'newest-first' }),
    );
    expect(newest.order).toEqual([a, b, c, unknown].map((entry) => sourceIdentity(entry.source)));
  });

  it('manual refresh appends new tuples without erasing absent work or resetting progress/expiry', async () => {
    const a = await item('1', 30);
    const b = await item('2', 20);
    const c = await item('3', 10);
    let queue = unwrap(setQueueSettings(imported([a, b]), { ordering: 'manual' }));
    queue = unwrap(reorderQueue(queue, [sourceIdentity(a.source), sourceIdentity(b.source)]));
    const resumed = {
      ...a,
      listeningState: 'paused' as const,
      checkpoint: {
        documentRevision: a.snapshot.revision,
        blockId: a.snapshot.blocks[0].id,
        sourceOffset: 4,
        audioOffsetMs: 0,
      },
    };
    queue = {
      ...queue,
      items: queue.items.map((entry) => (entry.source.itemId === '1' ? resumed : entry)),
    };
    const before = queue;
    queue = unwrap(refreshQueue(queue, [c, { ...a, expiresAt: a.expiresAt + 1000 }, c]));
    expect(queue.order).toEqual([a, b, c].map((entry) => sourceIdentity(entry.source)));
    expect(
      queue.items.find((entry) => sourceIdentity(entry.source) === sourceIdentity(a.source)),
    ).toEqual(resumed);
    expect(before.items).toHaveLength(2);
  });

  it('refresh and sorting never replace or interrupt the current owner', async () => {
    const a = await item('1', 30);
    const b = await item('2', 10);
    const queue = started([a]);
    const refreshed = unwrap(refreshQueue(queue, [b]));
    expect(refreshed.activeOwner).toEqual(queue.activeOwner);
    expect(refreshed.generation).toBe(queue.generation);
    expect(refreshed.items.find((entry) => entry.source.itemId === '1')).toEqual(queue.items[0]);
    expect(refreshed.order[0]).toBe(sourceIdentity(b.source));
  });

  it('reordering requires manual mode, exact membership, and a fixed owner position', async () => {
    const a = await item('1');
    const b = await item('2');
    const queue = started([a, b]);
    expect(reorderQueue(queue, [...queue.order].reverse()).ok).toBe(false);
    const manual = unwrap(setQueueSettings(queue, { ordering: 'manual' }));
    expect(reorderQueue(manual, [...manual.order].reverse()).ok).toBe(false);
    expect(reorderQueue(manual, [manual.order[0], manual.order[0]]).ok).toBe(false);
    expect(reorderQueue(manual, [manual.order[0]]).ok).toBe(false);
    expect(reorderQueue(manual, manual.order).ok).toBe(true);
  });

  it.each([
    { prefetchBudget: -1 },
    { prefetchBudget: 50_001 },
    { prefetchBudget: 0.5 },
    { prefetchBudget: Number.NaN },
    { prefetchBudget: Number.POSITIVE_INFINITY },
  ])('rejects invalid settings %j atomically', (settings) => {
    const queue = createQueueEnvelope();
    expect(setQueueSettings(queue, settings).ok).toBe(false);
    expect(queue.settings.prefetchBudget).toBe(10_000);
  });

  it('rejects unknown enums, nonboolean settings and extra fields at runtime', () => {
    for (const patch of [
      { ordering: 'random' },
      { continuousPlayback: 'yes' },
      { markReadOnCompletion: 1 },
      { token: 'not-a-setting' },
    ]) {
      expect(
        setQueueSettings(createQueueEnvelope(), patch as unknown as Partial<QueueSettings>).ok,
      ).toBe(false);
    }
  });

  it('rejects conflicting duplicate imports and capacity overflow without truncating', async () => {
    const a = await item('1');
    expect(refreshQueue(createQueueEnvelope(), [a, { ...a, publishedAt: 99 }]).ok).toBe(false);
    const entries = Array.from({ length: 101 }, (_, index) => {
      const source = { ...a.source, itemId: String(index + 1) };
      return { ...a, source, snapshot: { ...a.snapshot, source } };
    });
    expect(refreshQueue(createQueueEnvelope(), entries)).toEqual({
      ok: false,
      error: { type: 'LIMIT' },
    });
    expect(unwrap(refreshQueue(createQueueEnvelope(), entries.slice(0, 100))).items).toHaveLength(
      100,
    );
  });

  it('accepts budget endpoints without starting work or manufacturing completion', async () => {
    const queue = imported([await item('1')]);
    for (const prefetchBudget of [0, 50_000]) {
      const updated = unwrap(
        setQueueSettings(queue, { prefetchBudget, markReadOnCompletion: true }),
      );
      expect(updated.activeOwner).toBeNull();
      expect(updated.items[0].ackIntent).toBeNull();
      expect(updated.items[0].completionId).toBeNull();
    }
  });

  it('replaces queue/page ownership, pauses the old item, and fences late events', async () => {
    const a = await item('1');
    const b = await item('2');
    const first = started([a, b]);
    const second = unwrap(
      replaceQueueOwner(first, { kind: 'queue', key: sourceIdentity(b.source) }),
    );
    expect(second.items.filter((entry) => entry.listeningState === 'playing')).toHaveLength(1);
    expect(second.items.find((entry) => entry.source.itemId === '1')?.listeningState).toBe(
      'paused',
    );
    expect(second.generation).toBe(first.generation + 1);
    const page = unwrap(replaceQueueOwner(second, { kind: 'page', tabId: 7 }));
    expect(page.items.some((entry) => entry.listeningState === 'playing')).toBe(false);
    expect(page.activeOwner).toEqual({ kind: 'page', tabId: 7 });
    expect(page.generation).toBe(second.generation + 1);
    const stopped = unwrap(stopQueue(page));
    expect(stopped.activeOwner).toBeNull();
    expect(stopped.generation).toBe(page.generation + 1);
    expect(
      stopped.items.every((entry) => entry.completionId === null && entry.ackIntent === null),
    ).toBe(true);
  });

  it('requires a new valid session on recovery and restores persisted playing as paused', async () => {
    const playing = started([await item('1')]);
    expect(recoverQueueSession(playing, SESSION).ok).toBe(false);
    expect(recoverQueueSession(playing, 'not-random-128-bit').ok).toBe(false);
    const restored = unwrap(recoverQueueSession(playing, NEXT_SESSION));
    expect(restored.sessionId).toBe(NEXT_SESSION);
    expect(restored.activeOwner).toEqual(playing.activeOwner);
    expect(restored.items[0].listeningState).toBe('paused');
    expect(restored.items[0].checkpoint).toEqual(playing.items[0].checkpoint);
    expect(restored.items[0].completionId).toBeNull();
  });

  it('fails closed on missing owner/session, blocked data and generation overflow', async () => {
    const queue = imported([await item('1')]);
    expect(replaceQueueOwner(queue, { kind: 'page', tabId: 1 }).ok).toBe(false);
    const live = unwrap(recoverQueueSession(queue, SESSION));
    expect(replaceQueueOwner(live, { kind: 'queue', key: 'missing' }).ok).toBe(false);
    expect(stopQueue({ ...live, generation: Number.MAX_SAFE_INTEGER }).ok).toBe(false);
    expect(refreshQueue({ ...live, schemaVersion: 2 }, []).ok).toBe(false);
    expect(
      replaceQueueOwner(
        { ...live, migration: { fromVersion: 1, toVersion: 2, startedAt: 100 } },
        { kind: 'page', tabId: 1 },
      ).ok,
    ).toBe(false);
  });

  it('validates snapshot digests and source binding rather than trusting revision-shaped strings', async () => {
    const a = await item('1');
    const tampered = {
      ...a.snapshot,
      blocks: [{ ...a.snapshot.blocks[0], originalText: 'Different.' }],
    };
    expect((await createQueueItem(tampered, 1, 100, digest)).ok).toBe(false);
    expect(
      refreshQueue(createQueueEnvelope(), [{ ...a, source: { ...a.source, itemId: 'other' } }]).ok,
    ).toBe(false);
  });

  it('returns deep-frozen snapshots without freezing or retaining caller-owned objects', async () => {
    const a = await item('1');
    const input = { ...a, source: { ...a.source } };
    const queue = imported([input]);
    input.source.itemId = 'changed-by-caller';
    expect(queue.items[0].source.itemId).toBe('1');
    expect(Object.isFrozen(queue)).toBe(true);
    expect(Object.isFrozen(queue.order)).toBe(true);
    expect(Object.isFrozen(queue.items[0].snapshot.blocks[0])).toBe(true);
  });
});

describe('InMemory listening queue store (test-only port semantics)', () => {
  it('commits the whole envelope once and rejects concurrent stale writers', async () => {
    const store = new InMemoryListeningQueueStoreAdapter(digest);
    const initial = unwrap(await store.load());
    const a = await item('1');
    const results = await Promise.all([
      store.transact(queueFence(initial), (queue) => refreshQueue(queue, [a])),
      store.transact(queueFence(initial), (queue) =>
        setQueueSettings(queue, { continuousPlayback: true }),
      ),
    ]);
    expect(results.map((result) => result.ok)).toEqual([true, false]);
    expect(results[1]).toEqual({ ok: false, error: { type: 'STALE_WRITE' } });
    const saved = unwrap(await store.load());
    expect(saved.commitSequence).toBe(1);
    expect(saved.items).toHaveLength(1);
    expect(saved.settings.continuousPlayback).toBe(false);
  });

  it('rolls back faults after transition and does not report a volatile successful save', async () => {
    const store = new InMemoryListeningQueueStoreAdapter(digest);
    const before = unwrap(await store.load());
    store.failNext({ type: 'PERSISTENCE_FAILED' });
    const result = await store.transact(queueFence(before), (queue) =>
      setQueueSettings(queue, { prefetchBudget: 0 }),
    );
    expect(result).toEqual({ ok: false, error: { type: 'PERSISTENCE_FAILED' } });
    expect(unwrap(await store.load())).toEqual(before);
    expect(
      (
        await store.transact(queueFence(before), (queue) =>
          setQueueSettings(queue, { prefetchBudget: 0 }),
        )
      ).ok,
    ).toBe(true);
  });

  it('rejects stale session/generation/connection epochs even with the current sequence', async () => {
    const seed = started([await item('1')]);
    const store = new InMemoryListeningQueueStoreAdapter(digest, seed);
    const fence = queueFence(seed);
    for (const wrong of [
      { ...fence, sessionId: NEXT_SESSION },
      { ...fence, generation: fence.generation + 1 },
      { ...fence, connectionEpochs: [{ connectionId: 'reader-a', epoch: 99 }] },
    ]) {
      expect(await store.transact(wrong, (queue) => Ok(queue))).toEqual({
        ok: false,
        error: { type: 'STALE_WRITE' },
      });
    }
    expect(unwrap(await store.load())).toEqual(seed);
  });

  it('never accepts two playing items, ownerless playback, or caller-written commit sequences', async () => {
    const seed = started([await item('1'), await item('2')]);
    const store = new InMemoryListeningQueueStoreAdapter(digest, seed);
    const candidates: QueueEnvelope[] = [
      { ...seed, items: seed.items.map((entry) => ({ ...entry, listeningState: 'playing' })) },
      { ...seed, activeOwner: null },
      { ...seed, commitSequence: 99 },
    ];
    for (const candidate of candidates) {
      expect((await store.transact(queueFence(seed), () => Ok(candidate))).ok).toBe(false);
      expect(unwrap(await store.load())).toEqual(seed);
    }
  });

  it('rejects corrupt/future seed data without replacing it with empty defaults', async () => {
    const seed = imported([await item('1')]);
    for (const corrupt of [
      { ...seed, minReaderVersion: 2 },
      { ...seed, order: [] },
      {
        ...seed,
        items: [
          {
            ...seed.items[0],
            snapshot: { ...seed.items[0].snapshot, revision: `r1-${'0'.repeat(64)}` },
          },
        ],
      },
    ]) {
      const store = new InMemoryListeningQueueStoreAdapter(digest, corrupt);
      expect((await store.load()).ok).toBe(false);
      expect((await store.transact(queueFence(seed), () => Ok(createQueueEnvelope()))).ok).toBe(
        false,
      );
      expect((await store.load()).ok).toBe(false);
    }
  });

  it('rejects async callbacks and candidate generation/epoch rollback without publishing', async () => {
    const seed = started([await item('1')]);
    const store = new InMemoryListeningQueueStoreAdapter(digest, seed);
    const asynchronous = (async () => Ok(seed)) as unknown as QueueTransition;
    expect((await store.transact(queueFence(seed), asynchronous)).ok).toBe(false);
    for (const candidate of [
      {
        ...seed,
        activeOwner: null,
        items: seed.items.map((entry) => ({ ...entry, listeningState: 'paused' as const })),
        generation: 0,
      },
      { ...seed, connectionEpochs: [] },
      {
        ...seed,
        sessionId: NEXT_SESSION,
        items: seed.items.map((entry) => ({ ...entry, sessionId: NEXT_SESSION })),
      },
    ]) {
      expect((await store.transact(queueFence(seed), () => Ok(candidate))).ok).toBe(false);
    }
    expect(unwrap(await store.load())).toEqual(seed);
  });

  it('blocks sequence overflow and redacts thrown boundary failures', async () => {
    const full = { ...createQueueEnvelope(), commitSequence: Number.MAX_SAFE_INTEGER };
    const exhausted = new InMemoryListeningQueueStoreAdapter(digest, full);
    expect(await exhausted.transact(queueFence(full), (queue) => Ok(queue))).toEqual({
      ok: false,
      error: { type: 'LIMIT' },
    });
    const store = new InMemoryListeningQueueStoreAdapter(digest);
    const initial = unwrap(await store.load());
    expect(
      await store.transact(queueFence(initial), () => {
        throw new Error('must not escape');
      }),
    ).toEqual({ ok: false, error: { type: 'PERSISTENCE_FAILED' } });
    expect(unwrap(await store.load())).toEqual(initial);
  });
});
