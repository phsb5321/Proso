import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MinifluxReadingSourceAdapter } from '../../../../src/adapters/reading-source/miniflux.adapter';
import {
  installSourceCrypto,
  sourceEntry,
  sourceRawResponse,
  sourceResponse,
} from '../../../helpers/reading-source-http';

installSourceCrypto();
const connection = {
  connectionId: 'fixture',
  baseUrl: 'https://miniflux.test:8443/reader/',
  token: 'synthetic-secret',
};
const source = {
  provider: 'miniflux' as const,
  connectionId: 'fixture',
  itemId: '1',
  canonicalUrl: 'https://publisher.test/1',
};
function makeAdapter(fetcher: typeof fetch) {
  const result = MinifluxReadingSourceAdapter.create(connection, {
    fetch: fetcher,
    now: () => 1000,
  });
  if (!result.ok) throw new Error('Invalid fixture');
  return result.value;
}
afterEach(() => {
  jest.useRealTimers();
});

describe('Miniflux list/get synthetic HTTP boundary', () => {
  it('uses only prefixed instance endpoints, no cookies/redirects or publisher fetch; list/get make no status write', async () => {
    const fetcher = jest
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        String(url).includes('?')
          ? sourceResponse({ total: 1, entries: [sourceEntry()] })
          : sourceResponse(sourceEntry()),
      );
    const adapter = makeAdapter(fetcher);
    expect((await adapter.list()).ok).toBe(true);
    const result = await adapter.get(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks[0].originalText).toBe('Hi.');
    expect(result.value.fetchedAt).toBe(1000);
    expect(result.value.author).toBeNull();
    expect(JSON.stringify(result)).not.toContain(connection.token);
    // T009: the acknowledge stub is gone; its wire contract now lives in
    // tests/contract/reading-source.contract.test.ts. list/get still never write status.
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url).startsWith('https://miniflux.test:8443/reader/v1/entries')).toBe(true);
      expect(init).toMatchObject({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: { 'X-Auth-Token': connection.token },
      });
      expect(init?.body).toBeUndefined();
    }
  });
  it('caps pages at 50/two per refresh and deduplicates IDs across pages', async () => {
    const fetcher = jest.fn<typeof fetch>().mockImplementation(async (input) => {
      const offset = new URL(String(input)).searchParams.get('offset') === '50' ? 49 : 0;
      return sourceResponse({
        total: 1000,
        entries: Array.from({ length: 50 }, (_, i) => sourceEntry(offset + i + 1)),
      });
    });
    const adapter = makeAdapter(fetcher);
    const first = await adapter.list();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.items).toHaveLength(50);
    expect(first.value.cursor).toBeDefined();
    const second = await adapter.list({ cursor: first.value.cursor });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.items).toHaveLength(49);
    expect(second.value.cursor).toBeUndefined();
    expect(await adapter.list({ cursor: 'https://evil.test/v1/entries' })).toEqual({
      ok: false,
      error: { type: 'SOURCE_BINDING' },
    });
    expect(await adapter.list({ cursor: first.value.cursor })).toEqual({
      ok: false,
      error: { type: 'SOURCE_BINDING' },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['http://miniflux.test', 'SOURCE_BINDING'],
    ['https://user:pass@miniflux.test', 'SOURCE_BINDING'],
    ['https://miniflux.test/?token=x', 'SOURCE_BINDING'],
    ['https://miniflux.test/#fragment', 'SOURCE_BINDING'],
    ['not a url', 'SOURCE_BINDING'],
  ])('rejects unsafe config %s without requests', (baseUrl, type) => {
    const fetcher = jest.fn<typeof fetch>();
    expect(
      MinifluxReadingSourceAdapter.create(
        { ...connection, baseUrl },
        { fetch: fetcher, now: () => 0 },
      ),
    ).toEqual({ ok: false, error: { type } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '01', '1.5', '9007199254740992', '1?token=x', '../1'])(
    'rejects unsafe ID %s before fetch',
    async (itemId) => {
      const fetcher = jest.fn<typeof fetch>();
      expect(await makeAdapter(fetcher).get({ ...source, itemId })).toEqual({
        ok: false,
        error: { type: 'SOURCE_BINDING' },
      });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'UNAUTHORIZED'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMIT'],
    [500, 'SOURCE_UNAVAILABLE'],
    [503, 'SOURCE_UNAVAILABLE'],
    [301, 'REDIRECT_REJECTED'],
    [302, 'REDIRECT_REJECTED'],
    [303, 'REDIRECT_REJECTED'],
    [307, 'REDIRECT_REJECTED'],
    [308, 'REDIRECT_REJECTED'],
  ])('maps HTTP %s to a redacted %s without retry', async (status, type) => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue(
      sourceResponse({ secret: connection.token }, Number(status), {
        Location: 'https://evil.test/',
      }),
    );
    expect(await makeAdapter(fetcher).get(source)).toEqual({ ok: false, error: { type } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains valid Retry-After not-before without polling', async () => {
    expect(
      await makeAdapter(async () => sourceResponse({}, 429, { 'Retry-After': '120' })).list(),
    ).toEqual({ ok: false, error: { type: 'RATE_LIMIT', notBefore: 121000 } });
  });
  it('rejects malformed JSON, wrong identity, invalid URLs, unsafe wire IDs and missing body', async () => {
    for (const response of [
      sourceRawResponse('{broken'),
      sourceResponse({ ...sourceEntry(), id: 2 }),
      sourceResponse({ ...sourceEntry(), id: Number.MAX_SAFE_INTEGER + 1 }),
      sourceResponse({ ...sourceEntry(), url: 'not a URL' }),
      sourceResponse({ id: 1, title: '', url: source.canonicalUrl }),
    ]) {
      expect(await makeAdapter(async () => response).get(source)).toEqual({
        ok: false,
        error: { type: 'INVALID_RESPONSE' },
      });
    }
  });
  it('rejects invalid pages and empty/unsupported content honestly', async () => {
    for (const page of [
      { entries: [] },
      { total: -1, entries: [] },
      { total: 1, entries: [{ ...sourceEntry(), status: 'read' }] },
    ])
      expect((await makeAdapter(async () => sourceResponse(page)).list()).ok).toBe(false);
    expect(
      await makeAdapter(async () => sourceResponse({ ...sourceEntry(), content: '' })).get(source),
    ).toEqual({ ok: false, error: { type: 'UNREADABLE' } });
    const result = await makeAdapter(async () =>
      sourceResponse({ ...sourceEntry(), content: '<p>Hi.<img src="https://evil.test/"></p>' }),
    ).get(source);
    expect(result.ok && result.value.coverage.status).toBe('partial');
  });
  it('enforces both declared and streamed byte limits without partial success', async () => {
    for (const response of [
      sourceResponse(sourceEntry(), 200, { 'Content-Length': String(2 * 1024 * 1024 + 1) }),
      sourceRawResponse('x'.repeat(2 * 1024 * 1024 + 1)),
    ]) {
      expect(await makeAdapter(async () => response).get(source)).toEqual({
        ok: false,
        error: { type: 'LIMIT' },
      });
    }
    expect(
      await makeAdapter(async () => sourceRawResponse('x'.repeat(4 * 1024 * 1024 + 1))).list(),
    ).toEqual({ ok: false, error: { type: 'LIMIT' } });
  });
  it('times out fetch and stalled response bodies at 15 seconds even if fetch ignores abort', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const pending = makeAdapter(fetcher).get(source);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ ok: false, error: { type: 'TIMEOUT' } });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    const stalled = new ReadableStream<Uint8Array>();
    const response = { ...sourceResponse({}), body: stalled as unknown as Response['body'] };
    const bodyPending = makeAdapter(async () => response).list();
    await jest.advanceTimersByTimeAsync(15_000);
    expect(await bodyPending).toEqual({ ok: false, error: { type: 'TIMEOUT' } });
    expect(jest.getTimerCount()).toBe(0);
  });
  it('handles pre-abort and in-flight abort without retries or leaked errors', async () => {
    const controller = new AbortController();
    const fetcher = jest.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const adapter = makeAdapter(fetcher);
    const pending = adapter.get(source, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: { type: 'ABORTED' } });
    expect(await adapter.list({}, controller.signal)).toEqual({
      ok: false,
      error: { type: 'ABORTED' },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      await makeAdapter(async () => {
        throw new Error(connection.token);
      }).get(source),
    ).toEqual({ ok: false, error: { type: 'NETWORK' } });
  });
});

describe('Miniflux malformed stream and connection isolation', () => {
  it('rejects oversized entry arrays and truncated declared bodies', async () => {
    expect(
      await makeAdapter(async () =>
        sourceResponse({
          total: 51,
          entries: Array.from({ length: 51 }, (_, index) => sourceEntry(index + 1)),
        }),
      ).list(),
    ).toEqual({ ok: false, error: { type: 'LIMIT' } });
    expect(
      await makeAdapter(async () =>
        sourceResponse(sourceEntry(), 200, { 'Content-Length': '1000' }),
      ).get(source),
    ).toEqual({ ok: false, error: { type: 'INVALID_RESPONSE' } });
  });
  it('rejects malformed UTF-8 instead of replacing source bytes', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff]));
        controller.close();
      },
    });
    const response = { ...sourceResponse({}), body: body as unknown as Response['body'] };
    expect(await makeAdapter(async () => response).get(source)).toEqual({
      ok: false,
      error: { type: 'INVALID_RESPONSE' },
    });
  });
  it('keeps equal item IDs/URLs on different connections distinct and rejects substitutions', async () => {
    const fetcher = jest
      .fn<typeof fetch>()
      .mockImplementation(async () => sourceResponse(sourceEntry()));
    const first = makeAdapter(fetcher);
    const secondResult = MinifluxReadingSourceAdapter.create(
      { ...connection, connectionId: 'second', token: 'second-synthetic-token' },
      { fetch: fetcher, now: () => 1000 },
    );
    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) return;
    expect(await secondResult.value.get(source)).toEqual({
      ok: false,
      error: { type: 'SOURCE_BINDING' },
    });
    expect(fetcher).not.toHaveBeenCalled();
    const a = await first.get(source);
    const b = await secondResult.value.get({ ...source, connectionId: 'second' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.revision).toBe(b.value.revision);
    expect(a.value.source).not.toEqual(b.value.source);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'X-Auth-Token': connection.token });
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      'X-Auth-Token': 'second-synthetic-token',
    });
  });
  it('rejects same-origin redirect responses without following Location', async () => {
    const fetcher = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        sourceResponse({}, 302, { Location: 'https://miniflux.test:8443/reader/login' }),
      );
    expect(await makeAdapter(fetcher).list()).toEqual({
      ok: false,
      error: { type: 'REDIRECT_REJECTED' },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
