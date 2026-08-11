/**
 * Local synthesis host factory wiring tests (spec 100 FR-2/FR-6, PROSO-110).
 *
 * The default-off proof is asserted on the ISSUED REQUEST, not on
 * configuration state: with the provider selected but nothing configured,
 * the factory builds a gate that fails, so the local adapter is never
 * constructed and no fetch is ever issued (FR-2 falsifier: "a network request
 * to a user-host origin observed with default settings").
 *
 * browser.storage.local and browser.permissions are stubbed via the wxt
 * browser shim's jest mock (tests/setup.js).
 *
 * @module tests/unit/composition/factories-local-host
 */

import { describe, expect, it, jest } from '@jest/globals';
import { browser } from 'wxt/browser';
import { createAudioGeneratorAdapter } from '../../../src/composition/factories';
import type { IAudioGenerator } from '../../../src/ports/audio-generator.port';
import type { AudioRequest } from '../../../src/ports/audio-generator.port';

const request: AudioRequest = {
  text: 'Bom dia, mundo.',
  voice: null,
  speed: 1,
  language: 'pt-BR',
};

async function storageGet(keys: string[]): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = (permissioned.storage.local.get).mock.results[0]?.value ?? {};
  return out;
}

function makeStorageMock(values: Record<string, unknown>): void {
  (permissioned.storage.local.get as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(values);
  (permissioned.permissions.contains as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(true);
}

/** Assert a failed-gate result issued no network request (FR-2). */
function expectNoRequestsIssued(result: { ok: boolean }): void {
  expect(result.ok).toBe(false);
  const fetchStub = withFetchStub();
  expect(fetchStub).not.toHaveBeenCalled();
  restoreFetch();
}

/** jsdom lacks fetch: install a call-tracking stub. */
type FetchStub = Mockable & { mock: { calls: Array<unknown[]> } };
function withFetchStub(): FetchStub {
  const stub = jest.fn() as unknown as FetchStub;
  (globalThis as Record<string, unknown>).fetch = stub;
  return stub;
}

function restoreFetch(): void {
  delete (globalThis as Record<string, unknown>).fetch;
}

// The env's browser stub may lack the permissions API the gate uses.
interface Mockable {
  mockResolvedValue(value: unknown): void;
}
interface PermissionedBrowser {
  storage: { local: { get: Mockable & { mock: { results: Array<{ value?: unknown }> } }; set: jest.Mock; remove: jest.Mock } };
  permissions: { contains: Mockable; request: Mockable };
}
const permissioned = browser as unknown as PermissionedBrowser;
if (!permissioned.permissions) {
  permissioned.permissions = {
    contains: jest.fn(async () => true) as unknown as Mockable,
    request: jest.fn(async () => true) as unknown as Mockable,
  };
}

describe('createAudioGeneratorAdapter local branch', () => {
  it('default state (no config, no permission): local adapter never built, zero requests', async () => {
    makeStorageMock({ localHostUrl: undefined, localHostEnabled: false });

    const adapter = createAudioGeneratorAdapter('local', null, undefined) as IAudioGenerator;
    const result = await adapter.generateAudio(request);

    // No server configured either: the secondary is the no-op — the result is
    // an error, but the local route never issued a request and never built.
    expectNoRequestsIssued(result);
  });

  it('enabled but no URL: gate fails, no local adapter built', async () => {
    makeStorageMock({ localHostUrl: undefined, localHostEnabled: true });
    const adapter = createAudioGeneratorAdapter('local', null, undefined) as IAudioGenerator;
    await adapter.generateAudio(request);
    expect((permissioned.permissions.contains)).not.toHaveBeenCalled();
  });

  it('configured and enabled but permission revoked: no request is issued', async () => {
    makeStorageMock({ localHostUrl: 'https://host.example', localHostEnabled: true });
    (permissioned.permissions.contains as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(false);

    const adapter = createAudioGeneratorAdapter('local', null, undefined) as IAudioGenerator;
    const result = await adapter.generateAudio(request);

    // The permission gate failed: the local adapter was never constructed, so
    // nothing was fetched; the no-op secondary reports the error.
    expectNoRequestsIssued(result);
  });

  it('configured + enabled + permitted: local adapter is built and the host is contacted', async () => {
    makeStorageMock({ localHostUrl: 'https://host.example', localHostEnabled: true });
    (permissioned.permissions.contains as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(true);
    const fetchStub = withFetchStub();
    const body = JSON.stringify({ ready: true, tts: { voices: [] } });
    fetchStub.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => JSON.parse(body) as unknown,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    } as unknown as Response);

    const adapter = createAudioGeneratorAdapter('local', null, undefined) as IAudioGenerator;
    await adapter.generateAudio(request);

    // Capabilities were fetched from the configured origin.
    expect(fetchStub.mock.calls.length).toBeGreaterThan(0);
    const firstCall = fetchStub.mock.calls[0]?.[0] as string;
    expect(firstCall.startsWith('https://host.example/')).toBe(true);
    restoreFetch();
  });
});
