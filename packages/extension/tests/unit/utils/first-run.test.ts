/**
 * First-run decisions (PROSO-134 / #27) — tests written RED-first.
 *
 * The classifier keys on the REAL server copy (packages/server/src/core/tts/
 * tts.service.ts) and the local gate's marker (composition/factories.ts). If
 * either string drifts, a class silently becomes `unconfigured` and a reader
 * gets the wrong surface — so the markers are pinned here before the module
 * exists.
 *
 * @module tests/unit/utils/first-run
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    permissions: { request: jest.fn() },
    storage: { local: { get: jest.fn(), set: jest.fn() } },
    runtime: { sendMessage: jest.fn() },
  },
}));

const { browser } = await import('wxt/browser');
// The module under test is deps-injected (no wxt/browser import of its own),
// so it is imported statically — the dynamic-import-after-mock pattern is only
// for modules that consume the browser shim.
import {
  classifyFailure,
  connectLocalHost,
  isUnconfigured,
  saveByokKey,
  validateHostUrl,
  type ByokSaveDeps,
  FIX_ACTION,
} from '../../../src/utils/first-run';

const GATE_MARKER = 'no access to the configured host origin';
const TIER_COPY =
  'Managed TTS is not included in this tier. Attach your own provider API key in settings (free on every tier), or use a local synthesis host you run yourself.';
const DEFAULT_SERVER_URL = 'https://api.proso.com.br';

describe('isUnconfigured (R-1)', () => {
  it('empty storage is unconfigured', () => {
    expect(isUnconfigured({})).toBe(true);
  });

  it('any BYOK key ends the first-run state', () => {
    expect(isUnconfigured({ groqApiKey: 'gsk-x' })).toBe(false);
  });

  it('an enabled local host ends it', () => {
    expect(isUnconfigured({ localHostEnabled: true })).toBe(false);
  });

  it('a license key ends it', () => {
    expect(isUnconfigured({ licenseKey: 'lic-1' })).toBe(false);
  });

  it('the canonical managed server URL is product configuration, not a reader route', () => {
    expect(isUnconfigured({ serverUrl: DEFAULT_SERVER_URL })).toBe(true);
    expect(isUnconfigured({ serverUrl: `${DEFAULT_SERVER_URL}/` })).toBe(true);
    expect(isUnconfigured({ serverUrl: 'HTTPS://API.PROSO.COM.BR' })).toBe(true);
    expect(isUnconfigured({ serverUrl: 'https://api.proso.com.br:443' })).toBe(true);
  });

  it('a genuinely custom managed server origin preserves the configured reader player', () => {
    expect(isUnconfigured({ provider: 'openai', serverUrl: 'http://127.0.0.1:46121' })).toBe(false);
    expect(isUnconfigured({ serverUrl: 'https://api.proso.com.br:444' })).toBe(false);
  });
});

describe('classifyFailure (R-2, R-6)', () => {
  it('the real server 402 copy is the entitlement marker — pinned, not guessed', () => {
    expect(classifyFailure(TIER_COPY, { hasHost: false, hasByok: false })).toBe('unconfigured');
    expect(classifyFailure(TIER_COPY, { hasHost: true, hasByok: false })).toBe('entitlement');
  });

  it('the local gate marker is grant-missing', () => {
    expect(classifyFailure(`x ${GATE_MARKER} y`, { hasHost: true, hasByok: false })).toBe(
      'grant-missing',
    );
  });

  it('host errors with a host configured are host-unreachable — SHIPPED shapes', () => {
    expect(
      classifyFailure('Host could not be resolved: getaddrinfo ENOTFOUND', {
        hasHost: true,
        hasByok: false,
      }),
    ).toBe('host-unreachable');
    expect(classifyFailure('Failed to fetch', { hasHost: true, hasByok: false })).toBe(
      'host-unreachable',
    );
  });

  it('credential-specific errors with a BYOK key are key-rejected', () => {
    expect(classifyFailure('Invalid API key for openai', { hasHost: false, hasByok: true })).toBe(
      'key-rejected',
    );
    expect(classifyFailure('invalid_credentials', { hasHost: false, hasByok: true })).toBe(
      'key-rejected',
    );
  });

  it('a generic provider outage is not mislabeled as a rejected key', () => {
    expect(
      classifyFailure('Provider unavailable: openai', { hasHost: false, hasByok: true }),
    ).not.toBe('key-rejected');
  });

  it('a managed-only reader (serverUrl, no key, no host) is ENTITLED on a 402 — never unconfigured', () => {
    expect(classifyFailure(TIER_COPY, { hasHost: false, hasByok: false, hasManaged: true })).toBe(
      'entitlement',
    );
  });

  it('every class has exactly one fix action (no dead end)', () => {
    expect(Object.keys(FIX_ACTION).sort()).toEqual(
      ['unconfigured', 'entitlement', 'grant-missing', 'host-unreachable', 'key-rejected'].sort(),
    );
  });
});

describe('validateHostUrl (R-3)', () => {
  it('accepts https origins', () => {
    expect(validateHostUrl('https://host.example')).toBe('https://host.example');
  });

  it('accepts http loopback only', () => {
    expect(validateHostUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(validateHostUrl('http://localhost')).toBe('http://localhost');
    expect(validateHostUrl('http://[::1]:8080')).toBe('http://[::1]:8080');
  });

  it('rejects plaintext http, paths, and junk', () => {
    expect(validateHostUrl('http://192.168.1.5')).toBeNull();
    expect(validateHostUrl('https://host.example/settings')).toBeNull();
    expect(validateHostUrl('not a url')).toBeNull();
  });
});

describe('connectLocalHost (R-3 order: validate → grant → test → save)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  interface Rigs {
    perms: { request: jest.Mock };
    storage: { set: jest.Mock };
    fetchFn: jest.Mock;
    order: string[];
  }

  /** Shared rig: every case builds the same three mocks, overridable per case. */
  function makeRig(
    overrides: {
      grant?: () => Promise<boolean> | boolean;
      fetch?: () => Promise<unknown>;
      set?: () => Promise<void>;
    } = {},
  ): Rigs {
    const order: string[] = [];
    const perms = {
      request: jest.fn(async () => {
        order.push('grant');
        return overrides.grant ? await overrides.grant() : true;
      }),
    };
    const storage = {
      set: jest.fn(async () => {
        order.push('save');
        await (overrides.set ?? (async () => undefined))();
      }),
    };
    const fetchFn = jest.fn(async () => {
      order.push('test');
      if (overrides.fetch) return overrides.fetch();
      return {
        ok: true,
        json: async () => ({ ready: true, tts: { voices: [{ id: 'en_US-v' }] } }),
      };
    });
    return { perms, storage, fetchFn, order };
  }

  const connect = (rig: Rigs, overrides: Partial<{ address: string; event: Event | null }> = {}) =>
    connectLocalHost({
      address: overrides.address ?? 'https://host.example',
      event: overrides.event === undefined ? new Event('click') : overrides.event,
      perms: rig.perms as never,
      storage: rig.storage as never,
      fetchFn: rig.fetchFn as never,
    });

  it('refuses a null event — the grant must originate from a click (falsifier D)', async () => {
    const rig = makeRig();
    const result = await connect(rig, { event: null });
    expect(result.ok).toBe(false);
    expect(rig.perms.request).not.toHaveBeenCalled();
  });

  it('invalid address fails before any permission or network (step order)', async () => {
    const rig = makeRig();
    const result = await connect(rig, { address: 'http://192.168.1.5' });
    expect(result.ok).toBe(false);
    expect(rig.perms.request).not.toHaveBeenCalled();
    expect(rig.fetchFn).not.toHaveBeenCalled();
  });

  it('grant → test → save, in that order, with the click event present', async () => {
    const rig = makeRig();
    const result = await connect(rig);
    expect(result.ok).toBe(true);
    expect(rig.order).toEqual(['grant', 'test', 'save']);
    expect(rig.perms.request).toHaveBeenCalledWith({ origins: ['https://host.example/*'] });
    expect(rig.storage.set).toHaveBeenCalledWith({
      localHostUrl: 'https://host.example',
      localHostEnabled: true,
      localHostVoice: null,
      provider: 'local',
      voice: null,
    });
  });

  it('a denied grant reports permission_denied and never touches the network', async () => {
    const rig = makeRig({ grant: async () => false });
    const result = await connect(rig);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.step).toBe('permission_denied');
    expect(rig.fetchFn).not.toHaveBeenCalled();
  });

  it('a non-host or not-ready answer reports the test step', async () => {
    const rig = makeRig({
      fetch: async () => ({ ok: true, json: async () => ({ ready: false }) }),
    });
    const result = await connect(rig);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.step).toBe('test');
  });

  it('an unreachable host reports test failure with the origin named', async () => {
    const rig = makeRig({
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const result = await connect(rig);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.step).toBe('test');
    expect(result.error.message).toContain('https://host.example');
  });
});

describe('saveByokKey (R-2 validate before persist)', () => {
  let validate: jest.MockedFunction<ByokSaveDeps['validate']>;
  let select: jest.MockedFunction<ByokSaveDeps['select']>;

  beforeEach(() => {
    validate = jest.fn<ByokSaveDeps['validate']>(async () => ({ success: true }));
    select = jest.fn<ByokSaveDeps['select']>(async () => undefined);
  });

  it('validates before it persists and selects an accepted candidate', async () => {
    const order: string[] = [];
    validate.mockImplementation(async () => {
      order.push('validate');
      return { success: true };
    });
    select.mockImplementation(async () => {
      order.push('select');
    });

    const result = await saveByokKey('openai', '  candidate-key  ', {
      validate,
      select,
    });

    expect(result.ok).toBe(true);
    expect(order).toEqual(['validate', 'select']);
    expect(validate).toHaveBeenCalledWith('openai', 'candidate-key');
    expect(select).toHaveBeenCalledWith('openai', 'candidate-key');
  });

  it('preserves a working key and provider when the candidate is typed invalid', async () => {
    validate.mockResolvedValue({
      success: false,
      reason: 'invalid',
      message: 'Credential check failed without a keyword',
    });

    const result = await saveByokKey('openai', 'candidate-key', {
      validate,
      select,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('invalid');
    expect(select).not.toHaveBeenCalled();
  });

  it('does not call an unavailable validator a rejected credential', async () => {
    validate.mockResolvedValue({
      success: false,
      reason: 'unavailable',
      message: 'Validation service timed out',
    });

    const result = await saveByokKey('groq', 'candidate-key', { validate, select });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      reason: 'unavailable',
      message: 'Validation service timed out',
    });
    expect(select).not.toHaveBeenCalled();
  });

  it('reports candidate adoption separately from validation failure', async () => {
    select.mockRejectedValue(new Error('Provider reconfigure failed'));

    const result = await saveByokKey('openai', 'candidate-key', { validate, select });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      reason: 'activation',
      message: 'Provider reconfigure failed',
    });
  });

  it('treats a thrown validator as unavailable and persists nothing', async () => {
    validate.mockRejectedValue(new Error('Validation bridge disconnected'));

    const result = await saveByokKey('cartesia', 'candidate-key', {
      validate,
      select,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      reason: 'unavailable',
      message: 'Validation bridge disconnected',
    });
    expect(select).not.toHaveBeenCalled();
  });
});
