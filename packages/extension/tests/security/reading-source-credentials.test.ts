import { describe, expect, it, jest } from '@jest/globals';
import type { Result, SourceRef } from '@proso/shared';
import { Err } from '@proso/shared';
import {
  BrowserConnectionCredentialsStore,
  BrowserHostPermissions,
  MinifluxReadingSourceAdapter,
} from '../../src/adapters/reading-source';
import {
  READING_SOURCE_LIVE_TRAFFIC_ENABLED,
  authorizeSourceRequest,
  parseConnectionConfig,
  toPublicSummary,
} from '../../src/core/reading-source/connection-credentials';
import type { IConnectionCredentialsStore } from '../../src/ports/connection-credentials.port';
import type { StoredConnectionCredential } from '../../src/ports/connection-credentials.port';
import type { IHostPermissions } from '../../src/ports/host-permission.port';
import type { ReadingSourceError } from '../../src/ports/reading-source.port';
import {
  installSourceCrypto,
  sourceEntry,
  sourceRawResponse,
  sourceResponse,
} from '../helpers/reading-source-http';

installSourceCrypto();

const CONNECTION_ID = 'fixture';
const BASE_URL = 'https://miniflux.test:8443/reader';
const TOKEN = 'synthetic-secret-token';
const EXACT_PATTERN = 'https://miniflux.test:8443/*';
const credential: StoredConnectionCredential = {
  connectionId: CONNECTION_ID,
  baseUrl: BASE_URL,
  token: TOKEN,
};
const source: SourceRef = {
  provider: 'miniflux',
  connectionId: CONNECTION_ID,
  itemId: '1',
  canonicalUrl: 'https://publisher.test/1',
};

interface BrowserStub {
  storage: { local: { get: unknown; set: unknown; remove: unknown } };
  permissions: { contains: unknown };
}

function browserStub(): BrowserStub {
  // setup.js guarantees a global browser object; cast because tests compile
  // without the wxt ambient global declaration.
  return (globalThis as unknown as { browser: BrowserStub }).browser;
}

function installBrowserStorage(options: { readonly broken?: boolean } = {}): Map<string, unknown> {
  const map = new Map<string, unknown>();
  const api = browserStub();
  api.storage.local = {
    get: async (keys: string | string[] | null) => {
      if (options.broken) throw new Error('storage unavailable');
      if (keys === null || keys === undefined) return Object.fromEntries(map.entries());
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of list) if (map.has(key)) out[key] = map.get(key);
      return out;
    },
    set: async (entries: Record<string, unknown>) => {
      if (options.broken) throw new Error('storage unavailable');
      for (const [key, value] of Object.entries(entries)) map.set(key, value);
    },
    remove: async (keys: string | string[]) => {
      if (options.broken) throw new Error('storage unavailable');
      for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key);
    },
  };
  return map;
}

function installBrowserPermissions() {
  const granted = new Set<string>();
  let failNext = false;
  const contains = jest.fn(async (permission: { origins: readonly string[] }) => {
    if (failNext) {
      failNext = false;
      throw new Error('permissions api unavailable');
    }
    return permission.origins.every((pattern) => granted.has(pattern));
  });
  browserStub().permissions = { contains };
  return {
    granted,
    contains,
    failNextOnce: () => {
      failNext = true;
    },
  };
}

/**
 * Mirror of the admission order the T024 composition must wire: governance,
 * credential, exact-origin runtime permission, then adapter construction.
 * The governance flag defaults to the hard-disabled production constant; the
 * enabled variant exists only to exercise the layers behind the gate.
 */
async function guardedList(
  store: IConnectionCredentialsStore,
  permissions: IHostPermissions,
  connectionId: string,
  fetcher: typeof fetch,
  governanceEnabled: boolean = READING_SOURCE_LIVE_TRAFFIC_ENABLED,
): Promise<Result<unknown, ReadingSourceError>> {
  if (!governanceEnabled) return Err({ type: 'GOVERNANCE_DISABLED' });
  const loaded = await store.load(connectionId);
  if (!loaded.ok) return loaded;
  if (!loaded.value) return Err({ type: 'NOT_CONFIGURED' });
  const origin = parseConnectionConfig(loaded.value.baseUrl);
  if (!origin.ok) return origin;
  const gate = authorizeSourceRequest({
    governanceEnabled: true,
    credentialPresent: true,
    permissionContains: await permissions.contains(origin.value.originPattern),
  });
  if (!gate.ok) return gate;
  const adapter = MinifluxReadingSourceAdapter.create(
    { connectionId, baseUrl: loaded.value.baseUrl, token: loaded.value.token },
    { now: () => 0, fetch: fetcher },
  );
  if (!adapter.ok) return adapter;
  return adapter.value.list();
}

describe('reading-source credential security (T013, REQ-002/011)', () => {
  it('makes zero requests and zero permission probes while governance-disabled', async () => {
    installBrowserStorage();
    const { contains } = installBrowserPermissions();
    const store = new BrowserConnectionCredentialsStore();
    expect(await store.save(credential)).toEqual({ ok: true, value: undefined });
    const fetcher = jest.fn<typeof fetch>();
    const result = await guardedList(
      store,
      new BrowserHostPermissions(),
      CONNECTION_ID,
      fetcher as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, error: { type: 'GOVERNANCE_DISABLED' } });
    expect(fetcher).not.toHaveBeenCalled();
    expect(contains).not.toHaveBeenCalled();
  });

  it('makes zero requests when the runtime permission is denied', async () => {
    installBrowserStorage();
    const { granted } = installBrowserPermissions();
    granted.add('https://elsewhere.test/*');
    const store = new BrowserConnectionCredentialsStore();
    await store.save(credential);
    const fetcher = jest.fn<typeof fetch>();
    const result = await guardedList(
      store,
      new BrowserHostPermissions(),
      CONNECTION_ID,
      fetcher as unknown as typeof fetch,
      true,
    );
    expect(result).toEqual({ ok: false, error: { type: 'PERMISSION_DENIED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('binds the exact HTTPS origin/port: a same-host default-port grant does not satisfy 8443', async () => {
    installBrowserStorage();
    const { contains, granted } = installBrowserPermissions();
    const store = new BrowserConnectionCredentialsStore();
    await store.save(credential);
    granted.add('https://miniflux.test/*');
    const fetcher = jest.fn<typeof fetch>();
    const denied = await guardedList(
      store,
      new BrowserHostPermissions(),
      CONNECTION_ID,
      fetcher as unknown as typeof fetch,
      true,
    );
    expect(denied).toEqual({ ok: false, error: { type: 'PERMISSION_DENIED' } });
    expect(contains).toHaveBeenCalledWith({ origins: [EXACT_PATTERN] });
    expect(fetcher).not.toHaveBeenCalled();

    granted.add(EXACT_PATTERN);
    fetcher.mockImplementation(async () => sourceResponse({ total: 0, entries: [] }));
    const allowed = await guardedList(
      store,
      new BrowserHostPermissions(),
      CONNECTION_ID,
      fetcher as unknown as typeof fetch,
      true,
    );
    expect(allowed.ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0]).startsWith(`${BASE_URL}/v1/entries`)).toBe(true);
  });

  it('rejects redirects without ever forwarding the token to the redirect target', async () => {
    installBrowserStorage();
    const { granted } = installBrowserPermissions();
    granted.add(EXACT_PATTERN);
    const store = new BrowserConnectionCredentialsStore();
    await store.save(credential);
    const fetcher = jest
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        sourceRawResponse('', 302, { Location: 'https://attacker.test/collect' }),
      );
    const result = await guardedList(
      store,
      new BrowserHostPermissions(),
      CONNECTION_ID,
      fetcher as unknown as typeof fetch,
      true,
    );
    expect(result).toEqual({ ok: false, error: { type: 'REDIRECT_REJECTED' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0]).startsWith('https://miniflux.test:8443/')).toBe(true);
    const headers = fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['X-Auth-Token']).toBe(TOKEN);
  });

  it('disconnect deletes the credential and storage key; replacing a token overwrites', async () => {
    const map = installBrowserStorage();
    installBrowserPermissions();
    const store = new BrowserConnectionCredentialsStore();
    expect(await store.save({ ...credential, token: 'previous-token' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await store.save(credential)).toEqual({ ok: true, value: undefined });
    expect(map.size).toBe(1);
    expect(await store.load(CONNECTION_ID)).toEqual({ ok: true, value: credential });
    expect(await store.delete(CONNECTION_ID)).toEqual({ ok: true, value: undefined });
    expect(map.has(`readingSourceConnection:${CONNECTION_ID}`)).toBe(false);
    expect(await store.load(CONNECTION_ID)).toEqual({ ok: true, value: null });
    const fetcher = jest.fn<typeof fetch>();
    expect(
      await guardedList(
        store,
        new BrowserHostPermissions(),
        CONNECTION_ID,
        fetcher as unknown as typeof fetch,
        true,
      ),
    ).toEqual({ ok: false, error: { type: 'NOT_CONFIGURED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the token out of public DTOs, error payloads and TTS-bound document content', async () => {
    installBrowserStorage();
    installBrowserPermissions();
    const store = new BrowserConnectionCredentialsStore();
    await store.save(credential);
    const loaded = await store.load(CONNECTION_ID);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.value) return;
    const origin = parseConnectionConfig(loaded.value.baseUrl);
    expect(origin.ok).toBe(true);
    if (!origin.ok) return;
    expect(JSON.stringify(toPublicSummary(loaded.value, origin.value))).not.toContain(TOKEN);
    for (const error of [
      { type: 'GOVERNANCE_DISABLED' },
      { type: 'NOT_CONFIGURED' },
      { type: 'PERMISSION_DENIED' },
      { type: 'UNREADABLE' },
      { type: 'SOURCE_BINDING' },
    ] as const) {
      expect(JSON.stringify(error)).not.toContain(TOKEN);
    }
    // What the speech pipeline would consume: the normalized document blocks.
    const adapter = MinifluxReadingSourceAdapter.create(
      { connectionId: CONNECTION_ID, baseUrl: BASE_URL, token: TOKEN },
      { now: () => 0, fetch: async () => sourceResponse(sourceEntry()) },
    );
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;
    const document = await adapter.value.get(source);
    expect(document.ok).toBe(true);
    if (document.ok) expect(JSON.stringify(document.value)).not.toContain(TOKEN);
  });

  it('fails closed when storage is unreadable or the permission API errors', async () => {
    installBrowserStorage({ broken: true });
    const store = new BrowserConnectionCredentialsStore();
    expect(await store.load(CONNECTION_ID)).toEqual({ ok: false, error: { type: 'UNREADABLE' } });
    expect(await store.save(credential)).toEqual({ ok: false, error: { type: 'UNREADABLE' } });
    expect(await store.delete(CONNECTION_ID)).toEqual({ ok: false, error: { type: 'UNREADABLE' } });
    const { failNextOnce } = installBrowserPermissions();
    failNextOnce();
    await expect(new BrowserHostPermissions().contains(EXACT_PATTERN)).resolves.toBe(false);
  });
});
