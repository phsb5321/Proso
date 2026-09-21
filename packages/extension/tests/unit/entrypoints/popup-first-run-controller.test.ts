// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Feature 169 public-popup controller regressions.
 *
 * Imports the shipped popup entrypoint against the real popup markup and drives
 * only its public controls. Storage, background messages, permission prompts,
 * and host capabilities are observer fixtures; no handler is invoked directly.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const popupHtml = readFileSync(
  path.resolve(here, '../../../src/entrypoints/popup/index.html'),
  'utf8',
);
const popupCss = readFileSync(
  path.resolve(here, '../../../src/entrypoints/popup/style.css'),
  'utf8',
);
const popupBody = popupHtml.slice(
  popupHtml.indexOf('<body>') + '<body>'.length,
  popupHtml.indexOf('</body>'),
);

const DEFAULT_SERVER_URL = 'https://api.proso.com.br';
const TIER_COPY =
  'Managed TTS is not included in this tier. Attach your own provider API key in settings (free on every tier), or use a local synthesis host you run yourself.';

// Coverage instrumentation and full-suite CPU contention make module startup
// materially slower than focused runs; assertions retain their own deadlines.
jest.setTimeout(30_000);

type Stored = Record<string, unknown>;
type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type StorageChangedListener = (changes: StorageChanges, areaName: string) => void;
type RuntimeMessageListener = (message: Record<string, unknown>) => unknown;
type Message = {
  type?: string;
  provider?: string;
  apiKey?: string;
  validatedApiKey?: string;
  data?: unknown;
  id?: string;
  url?: string;
  title?: string;
  excerpt?: string;
};

interface RigOptions {
  readonly stored?: Stored;
  readonly onStart?: () => Promise<unknown>;
  readonly onValidate?: (message: Message) => Promise<unknown>;
  readonly onProviderSelect?: (message: Message) => Promise<unknown>;
  readonly grant?: boolean;
  readonly grantError?: Error;
  readonly fetchResponse?: () => Promise<unknown>;
  readonly initialPlaybackStatus?: 'stopped' | 'loading' | 'playing' | 'paused' | 'error';
  readonly activeTab?: {
    readonly id: number;
    readonly url: string;
    readonly title: string;
    readonly favIconUrl?: string;
  };
}

interface PopupRig {
  readonly storage: Stored;
  readonly sendMessage: jest.MockedFunction<(message: Message) => Promise<unknown>>;
  readonly storageGet: jest.MockedFunction<(keys: string | string[] | null) => Promise<Stored>>;
  readonly storageSet: jest.MockedFunction<(items: Stored) => Promise<void>>;
  readonly storageOnChangedAddListener: jest.MockedFunction<
    (listener: StorageChangedListener) => void
  >;
  readonly runtimeOnMessageAddListener: jest.MockedFunction<
    (listener: RuntimeMessageListener) => void
  >;
  readonly permissionsRequest: jest.MockedFunction<() => Promise<boolean>>;
  readonly fetchFn: jest.MockedFunction<() => Promise<unknown>>;
  readonly emitRuntimeMessage: (message: Record<string, unknown>) => void;
}

function storageKeys(keys: string | string[] | null, stored: Stored): Stored {
  if (keys === null) return { ...stored };
  const names = Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(
    names.filter((name) => name in stored).map((name) => [name, stored[name]]),
  );
}

function makeRig(options: RigOptions = {}): PopupRig {
  const storage: Stored = { telemetryEnabled: false, ...options.stored };
  const storageChangeListeners: StorageChangedListener[] = [];
  const storageOnChangedAddListener = jest.fn((listener: StorageChangedListener) => {
    storageChangeListeners.push(listener);
  });
  const applyStorage = (items: Stored): void => {
    const changes = Object.fromEntries(
      Object.entries(items).map(([key, newValue]) => [key, { oldValue: storage[key], newValue }]),
    );
    Object.assign(storage, items);
    for (const listener of storageChangeListeners) listener(changes, 'local');
  };
  const storageGet = jest.fn<(keys: string | string[] | null) => Promise<Stored>>(async (keys) =>
    storageKeys(keys, storage),
  );
  const storageSet = jest.fn<(items: Stored) => Promise<void>>(async (items) => {
    applyStorage(items);
  });
  const runtimeMessageListeners: RuntimeMessageListener[] = [];
  const runtimeOnMessageAddListener = jest.fn((listener: RuntimeMessageListener) => {
    runtimeMessageListeners.push(listener);
  });
  const emitRuntimeMessage = (message: Record<string, unknown>): void => {
    for (const listener of runtimeMessageListeners) listener(message);
  };
  const permissionsRequest = jest.fn<() => Promise<boolean>>(async () => {
    if (options.grantError) throw options.grantError;
    return options.grant ?? true;
  });
  const queueItems: Array<Record<string, unknown>> = [];
  const fetchFn = jest.fn<() => Promise<unknown>>(
    options.fetchResponse ??
      (async () => ({
        ok: true,
        json: async () => ({ ready: true, tts: { voices: [{ id: 'en_US-v' }] } }),
      })),
  );
  const sendMessage = jest.fn<(message: Message) => Promise<unknown>>(async (message) => {
    switch (message.type) {
      case 'playback.getState':
        return {
          status: options.initialPlaybackStatus ?? 'stopped',
          audioLive: options.initialPlaybackStatus === 'playing',
          currentParagraph: 0,
          totalParagraphs: 0,
          progress: 0,
          speed: 1,
          provider: String(storage.provider ?? 'elevenlabs'),
        };
      case 'playback.start':
        return options.onStart?.() ?? {};
      case 'settings.testApiKey': {
        const request =
          message.data && typeof message.data === 'object' ? (message.data as Message) : message;
        return options.onValidate?.(request) ?? { success: true, message: 'API key is valid' };
      }
      case 'provider.select': {
        const response =
          options.onProviderSelect?.(message) ??
          Promise.resolve({ success: true, provider: message.provider });
        const result = await response;
        if (
          result &&
          typeof result === 'object' &&
          !('error' in result) &&
          typeof message.provider === 'string'
        ) {
          const keyName = `${message.provider}ApiKey`;
          applyStorage({
            ...(typeof message.validatedApiKey === 'string'
              ? { [keyName]: message.validatedApiKey }
              : {}),
            provider: message.provider,
          });
        }
        return result;
      }
      case 'queue.add': {
        const id = `queue-${queueItems.length + 1}`;
        queueItems.push({
          id,
          url: message.url,
          title: message.title,
          domain: new URL(message.url ?? 'https://invalid.test').hostname,
          excerpt: message.excerpt,
          status: 'pending',
          progress: 0,
          addedAt: Date.now(),
          position: queueItems.length,
        });
        return { id, position: queueItems.length - 1 };
      }
      case 'queue.remove': {
        const index = queueItems.findIndex((item) => item.id === message.id);
        if (index >= 0) queueItems.splice(index, 1);
        return { success: true };
      }
      case 'queue.getState':
        return {
          items: queueItems,
          metadata: { count: queueItems.length, lastModified: Date.now() },
        };
      default:
        return {};
    }
  });

  return {
    storage,
    sendMessage,
    storageGet,
    storageSet,
    storageOnChangedAddListener,
    runtimeOnMessageAddListener,
    permissionsRequest,
    fetchFn,
    emitRuntimeMessage,
  };
}

async function mountPopup(options: RigOptions = {}): Promise<PopupRig> {
  jest.resetModules();
  document.head.innerHTML = '';
  document.body.innerHTML = popupBody;
  const style = document.createElement('style');
  style.textContent = popupCss;
  document.head.appendChild(style);

  const rig = makeRig(options);
  jest.unstable_mockModule('wxt/browser', () => ({
    browser: {
      runtime: {
        getManifest: () => ({ version: '0.0.0-test' }),
        sendMessage: rig.sendMessage,
        onMessage: {
          addListener: rig.runtimeOnMessageAddListener,
          removeListener: jest.fn(),
        },
      },
      storage: {
        local: {
          get: rig.storageGet,
          set: rig.storageSet,
        },
        onChanged: {
          addListener: rig.storageOnChangedAddListener,
          removeListener: jest.fn(),
        },
      },
      permissions: {
        request: rig.permissionsRequest,
      },
      tabs: {
        query: jest.fn(async () => (options.activeTab ? [options.activeTab] : [])),
        sendMessage: jest.fn(async () => ({ text: 'Article excerpt' })),
      },
    },
  }));
  globalThis.fetch = rig.fetchFn as unknown as typeof fetch;
  await import('../../../src/entrypoints/popup/main');
  const initialStatus = options.initialPlaybackStatus ?? 'stopped';
  await waitFor(
    () => document.getElementById('status-dot')?.getAttribute('data-status') === initialStatus,
  );
  // Initialization continues beyond playback.getState through route
  // classification. Wait until the route-key read happened, then yield once
  // for refreshFirstRun to apply its result.
  await waitFor(() =>
    rig.storageGet.mock.calls.some(
      ([keys]) => Array.isArray(keys) && keys.includes('serverUrl') && keys.includes('licenseKey'),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  return rig;
}

function mountConfiguredLocalPopup(options: RigOptions = {}): Promise<PopupRig> {
  return mountPopup({
    ...options,
    stored: {
      provider: 'local',
      localHostEnabled: true,
      localHostUrl: 'http://127.0.0.1:5301',
      ...options.stored,
    },
  });
}

async function waitFor(done: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for popup first-run state');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

function countMessages(rig: PopupRig, type: string): number {
  return rig.sendMessage.mock.calls.filter(([message]) => (message as Message).type === type)
    .length;
}

function deferredStart(): { promise: Promise<unknown>; resolve(value: unknown): void } {
  let complete: ((value: unknown) => void) | undefined;
  const promise = new Promise((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: (value) => complete?.(value) };
}

function firstRunPanel(): HTMLElement {
  return document.getElementById('first-run-panel') as HTMLElement;
}

function isRendered(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function renderedTabStops(): string[] {
  const candidates = document.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  );
  return Array.from(candidates)
    .filter((candidate) => {
      const disabled =
        (candidate instanceof HTMLButtonElement ||
          candidate instanceof HTMLInputElement ||
          candidate instanceof HTMLSelectElement ||
          candidate instanceof HTMLTextAreaElement) &&
        candidate.disabled;
      return !disabled && candidate.tabIndex >= 0 && isRendered(candidate);
    })
    .map((candidate) => candidate.id)
    .filter((id) => id.length > 0);
}

async function connectHost(address = 'https://host.example'): Promise<void> {
  const input = document.getElementById('first-run-host-url') as HTMLInputElement;
  input.value = address;
  (document.getElementById('first-run-host-connect') as HTMLButtonElement).click();
  await waitFor(() =>
    (document.getElementById('first-run-host-status')?.textContent ?? '').startsWith('Connected'),
  );
}

async function saveKey(provider = 'openai', key = 'candidate-key'): Promise<void> {
  (document.getElementById('first-run-byok-provider') as HTMLSelectElement).value = provider;
  (document.getElementById('first-run-byok-key') as HTMLInputElement).value = key;
  (document.getElementById('first-run-byok-save') as HTMLButtonElement).click();
}

describe('Feature 169 popup first-run controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows onboarding for a migration-persisted default and hides cost UI', async () => {
    await mountPopup({ stored: { _configVersion: 8, serverUrl: `${DEFAULT_SERVER_URL}/` } });

    expect(firstRunPanel().hidden).toBe(false);
    expect(document.getElementById('panel-player')?.classList).toContain(
      'proso-popup__panel--firstrun',
    );
    expect(getComputedStyle(document.getElementById('cost-section') as HTMLElement).display).toBe(
      'none',
    );
    expect((document.getElementById('grant-access-row') as HTMLElement).hidden).toBe(true);
    const disclosure = document.querySelector(
      '[data-testid="popup-first-run-data-disclosure"]',
    )?.textContent;
    expect(disclosure).toContain('only the text you ask to hear');
    expect(disclosure).toContain('no usage telemetry');
  });

  it('keeps configured readers on the player with onboarding absent from focus order', async () => {
    await mountPopup({ stored: { serverUrl: 'http://127.0.0.1:46121' } });

    expect(firstRunPanel().hidden).toBe(true);
    expect(getComputedStyle(firstRunPanel()).display).toBe('none');
    expect(document.getElementById('panel-player')?.classList).not.toContain(
      'proso-popup__panel--firstrun',
    );
    expect((document.getElementById('grant-access-row') as HTMLElement).hidden).toBe(true);

    const tabStops = renderedTabStops();
    expect(tabStops).toContain('play-pause-btn');
    expect(tabStops).not.toContain('first-run-host-url');
    expect(tabStops).not.toContain('first-run-host-connect');
    expect(tabStops).not.toContain('first-run-byok-provider');
    expect(tabStops).not.toContain('first-run-byok-key');
    expect(tabStops).not.toContain('first-run-byok-save');

    const cost = document.getElementById('cost-section') as HTMLElement;
    await waitFor(() => cost.hidden);
    expect(getComputedStyle(cost).display).toBe('none');
  });

  it('turns a default-only 402 into neutral free-route guidance', async () => {
    const rig = await mountPopup({
      stored: { serverUrl: DEFAULT_SERVER_URL },
      onStart: async () => ({ error: TIER_COPY }),
    });

    (document.getElementById('play-pause-btn') as HTMLButtonElement).click();
    await waitFor(
      () =>
        document.getElementById('first-run-subtitle')?.textContent ===
        'Choose a free route below to start listening.',
    );

    const subtitle = document.getElementById('first-run-subtitle')?.textContent ?? '';
    expect(subtitle).toBe('Choose a free route below to start listening.');
    expect(subtitle).not.toContain('Managed TTS is not included');
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('proactive host Connect saves automatic voice and starts playback exactly once', async () => {
    const rig = await mountPopup({ stored: { serverUrl: DEFAULT_SERVER_URL } });
    const origin = 'http://127.0.0.1:45019';

    await connectHost(origin);
    await waitFor(() => countMessages(rig, 'playback.start') === 1);

    expect(rig.permissionsRequest).toHaveBeenCalledWith({ origins: ['http://127.0.0.1/*'] });
    expect(rig.storage).toMatchObject({
      localHostUrl: origin,
      localHostEnabled: true,
      provider: 'local',
      voice: null,
    });
    expect(countMessages(rig, 'provider.select')).toBe(1);
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('coalesces a rapid duplicate host submit into one grant, save, and start', async () => {
    const rig = await mountPopup({ stored: { serverUrl: DEFAULT_SERVER_URL } });
    const input = document.getElementById('first-run-host-url') as HTMLInputElement;
    const form = document.getElementById('first-run-host-form') as HTMLFormElement;
    input.value = 'https://host.example';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => countMessages(rig, 'playback.start') === 1);

    expect(rig.permissionsRequest).toHaveBeenCalledTimes(1);
    expect(rig.storageSet).toHaveBeenCalledTimes(1);
    expect(countMessages(rig, 'provider.select')).toBe(1);
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('locks both route controls until host activation and playback complete', async () => {
    let markActivationStarted: (() => void) | undefined;
    let releaseActivation: (() => void) | undefined;
    const activationStarted = new Promise<void>((resolve) => {
      markActivationStarted = resolve;
    });
    const activationGate = new Promise<void>((resolve) => {
      releaseActivation = resolve;
    });
    const rig = await mountPopup({
      stored: { serverUrl: DEFAULT_SERVER_URL },
      onProviderSelect: async () => {
        markActivationStarted?.();
        await activationGate;
        return { success: true, provider: 'local' };
      },
    });
    const hostInput = document.getElementById('first-run-host-url') as HTMLInputElement;
    const hostForm = document.getElementById('first-run-host-form') as HTMLFormElement;
    const byokProvider = document.getElementById('first-run-byok-provider') as HTMLSelectElement;
    const byokKey = document.getElementById('first-run-byok-key') as HTMLInputElement;
    const byokSave = document.getElementById('first-run-byok-save') as HTMLButtonElement;
    hostInput.value = 'https://host.example';

    hostForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await activationStarted;
    expect((document.getElementById('first-run-host-connect') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(byokSave.disabled).toBe(true);

    hostForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    byokProvider.value = 'openai';
    byokKey.value = 'candidate-key';
    byokSave.click();
    await Promise.resolve();
    releaseActivation?.();
    await waitFor(() => countMessages(rig, 'playback.start') === 1);

    expect(rig.permissionsRequest).toHaveBeenCalledTimes(1);
    expect(countMessages(rig, 'settings.testApiKey')).toBe(0);
    expect(countMessages(rig, 'provider.select')).toBe(1);
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('requires Stop before setup can replace an existing reading', async () => {
    const rig = await mountPopup({
      stored: { serverUrl: DEFAULT_SERVER_URL },
      initialPlaybackStatus: 'playing',
    });

    await connectHost();
    await waitFor(() => document.getElementById('status-text')?.textContent?.includes('Stop the current reading') === true);

    expect(countMessages(rig, 'playback.pause')).toBe(0);
    expect(countMessages(rig, 'playback.start')).toBe(0);
  });

  it('a host activation failure stays visible and does not start playback', async () => {
    const rig = await mountPopup({
      stored: { serverUrl: DEFAULT_SERVER_URL },
      onProviderSelect: async () => ({ success: false, error: 'Reconfigure failed' }),
    });

    const input = document.getElementById('first-run-host-url') as HTMLInputElement;
    input.value = 'https://host.example';
    (document.getElementById('first-run-host-connect') as HTMLButtonElement).click();
    await waitFor(() =>
      (document.getElementById('first-run-host-status')?.textContent ?? '').includes(
        'could not activate',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(firstRunPanel().hidden).toBe(false);
    expect(countMessages(rig, 'provider.select')).toBe(1);
    expect(countMessages(rig, 'playback.start')).toBe(0);
  });

  it('a failed Play followed by Connect adds exactly one recovery start', async () => {
    let starts = 0;
    const rig = await mountPopup({
      stored: { serverUrl: 'http://127.0.0.1:46121' },
      onStart: async () => {
        starts += 1;
        return starts === 1 ? { error: TIER_COPY } : {};
      },
    });

    (document.getElementById('play-pause-btn') as HTMLButtonElement).click();
    await waitFor(() => !firstRunPanel().hidden);
    await connectHost();
    await waitFor(() => countMessages(rig, 'playback.start') === 2);

    expect(countMessages(rig, 'playback.start')).toBe(2);
  });

  it('validates a proactive BYOK candidate before save/select and starts once', async () => {
    const rig = await mountPopup({ stored: { serverUrl: DEFAULT_SERVER_URL } });

    await saveKey('openai', 'candidate-key');
    await waitFor(() =>
      (document.getElementById('first-run-byok-status')?.textContent ?? '').startsWith('Key saved'),
    );
    await waitFor(() => countMessages(rig, 'playback.start') === 1);

    const types = rig.sendMessage.mock.calls.map(([message]) => (message as Message).type);
    expect(types.indexOf('settings.testApiKey')).toBeLessThan(types.indexOf('provider.select'));
    expect(rig.storage.openaiApiKey).toBe('candidate-key');
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('coalesces a rapid duplicate BYOK click into one validation, save, and start', async () => {
    const rig = await mountPopup({ stored: { serverUrl: DEFAULT_SERVER_URL } });
    const provider = document.getElementById('first-run-byok-provider') as HTMLSelectElement;
    const key = document.getElementById('first-run-byok-key') as HTMLInputElement;
    const save = document.getElementById('first-run-byok-save') as HTMLButtonElement;
    provider.value = 'openai';
    key.value = 'candidate-key';

    save.click();
    save.click();
    await waitFor(() => countMessages(rig, 'playback.start') === 1);

    expect(countMessages(rig, 'settings.testApiKey')).toBe(1);
    expect(rig.storage.openaiApiKey).toBe('candidate-key');
    expect(countMessages(rig, 'provider.select')).toBe(1);
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('keeps both route controls locked while BYOK playback is starting', async () => {
    let markStartEntered: (() => void) | undefined;
    let releaseStart: (() => void) | undefined;
    const startEntered = new Promise<void>((resolve) => {
      markStartEntered = resolve;
    });
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const rig = await mountPopup({
      stored: { serverUrl: DEFAULT_SERVER_URL },
      onStart: async () => {
        markStartEntered?.();
        await startGate;
        return {};
      },
    });

    await saveKey('openai', 'candidate-key');
    await startEntered;
    const hostInput = document.getElementById('first-run-host-url') as HTMLInputElement;
    const hostForm = document.getElementById('first-run-host-form') as HTMLFormElement;
    const byokSave = document.getElementById('first-run-byok-save') as HTMLButtonElement;
    hostInput.value = 'https://host.example';
    expect(byokSave.disabled).toBe(true);
    expect((document.getElementById('first-run-host-connect') as HTMLButtonElement).disabled).toBe(
      true,
    );

    byokSave.click();
    hostForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    releaseStart?.();
    await waitFor(() => !byokSave.disabled);

    expect(countMessages(rig, 'settings.testApiKey')).toBe(1);
    expect(countMessages(rig, 'provider.select')).toBe(1);
    expect(rig.permissionsRequest).not.toHaveBeenCalled();
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('a failed candidate adoption reports not saved and starts nothing', async () => {
    const rig = await mountPopup({
      stored: { serverUrl: DEFAULT_SERVER_URL, openaiApiKey: 'working-key' },
      onProviderSelect: async () => ({ success: false, error: '[object Object]' }),
    });

    await saveKey('openai', 'candidate-key');
    await waitFor(() =>
      (document.getElementById('first-run-byok-status')?.textContent ?? '').includes('not saved'),
    );

    const status = document.getElementById('first-run-byok-status')?.textContent ?? '';
    expect(status).toContain('was verified');
    expect(status).not.toContain('could not be verified');
    expect(status).not.toContain('[object Object]');
    expect(rig.storage.openaiApiKey).toBe('working-key');
    expect(countMessages(rig, 'provider.select')).toBe(1);
    expect(countMessages(rig, 'playback.start')).toBe(0);
  });

  it('invalid BYOK candidate preserves the working key and starts nothing', async () => {
    const rig = await mountPopup({
      stored: { serverUrl: DEFAULT_SERVER_URL, openaiApiKey: 'working-key' },
      onValidate: async () => ({
        success: false,
        error: 'Credential check failed without a keyword',
        failure: 'invalid',
      }),
    });
    // Force the corrective panel to model Edit-key recovery for a configured reader.
    (document.getElementById('grant-access-btn') as HTMLButtonElement).textContent = 'Edit key';
    firstRunPanel().hidden = false;
    document.getElementById('panel-player')?.classList.add('proso-popup__panel--firstrun');

    await saveKey('openai', 'candidate-key');
    await waitFor(
      () =>
        (document.getElementById('first-run-byok-status')?.textContent ?? '') !==
        'Checking the key…',
    );

    expect(rig.storage.openaiApiKey).toBe('working-key');
    expect(rig.storageSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ openaiApiKey: 'candidate-key' }),
    );
    expect(countMessages(rig, 'provider.select')).toBe(0);
    expect(countMessages(rig, 'playback.start')).toBe(0);
  });

  it('validation transport failure says not saved, never rejected', async () => {
    await mountPopup({
      stored: { serverUrl: DEFAULT_SERVER_URL },
      onValidate: async () => ({
        success: false,
        error: 'Validation service timed out',
        failure: 'unavailable',
      }),
    });

    await saveKey('groq', 'candidate-key');
    await waitFor(
      () =>
        (document.getElementById('first-run-byok-status')?.textContent ?? '') !==
        'Checking the key…',
    );

    const status = document.getElementById('first-run-byok-status')?.textContent ?? '';
    expect(status).toContain('not saved');
    expect(status).not.toContain('rejected');
  });

  it('a playback credential rejection exposes and clears the Edit key repair', async () => {
    let starts = 0;
    const rig = await mountPopup({
      stored: { openaiApiKey: 'working-key', provider: 'openai' },
      onStart: async () => {
        starts += 1;
        return starts === 1 ? { error: 'Invalid API key for openai' } : {};
      },
    });

    (document.getElementById('play-pause-btn') as HTMLButtonElement).click();
    await waitFor(() => document.getElementById('grant-access-btn')?.textContent === 'Edit key');
    expect(countMessages(rig, 'playback.start')).toBe(1);

    (document.getElementById('grant-access-btn') as HTMLButtonElement).click();
    await waitFor(() => !firstRunPanel().hidden);
    expect(document.getElementById('first-run-subtitle')?.textContent).toBe(
      'Edit your provider key below to start listening.',
    );

    await saveKey('openai', 'replacement-key');
    await waitFor(() => countMessages(rig, 'playback.start') === 2);
    expect(firstRunPanel().hidden).toBe(true);
    expect((document.getElementById('grant-access-row') as HTMLElement).hidden).toBe(true);
    expect(document.getElementById('grant-access-btn')?.textContent).toBe('Grant access');
  });

  it('surfaces a rejected browser permission request without an unhandled action', async () => {
    const rig = await mountPopup({
      stored: { localHostEnabled: true, localHostUrl: 'http://[::1]:45019' },
      grantError: new Error('IPv6 patterns are unavailable'),
      onStart: async () => ({ error: 'The extension has no access to the configured host origin' }),
    });

    (document.getElementById('play-pause-btn') as HTMLButtonElement).click();
    await waitFor(
      () =>
        !(document.getElementById('grant-access-row') as HTMLElement).hidden &&
        (document.getElementById('grant-access-reason')?.textContent ?? '').includes(
          'http://[::1]:45019',
        ),
    );
    (document.getElementById('grant-access-btn') as HTMLButtonElement).click();
    await waitFor(() =>
      (document.getElementById('grant-access-reason')?.textContent ?? '').includes(
        'IPv6 patterns are unavailable',
      ),
    );

    expect(rig.permissionsRequest).toHaveBeenCalledWith({ origins: ['http://[::1]/*'] });
    expect((document.getElementById('grant-access-row') as HTMLElement).hidden).toBe(false);
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('routes an ungrantable saved host back to editable onboarding', async () => {
    const rig = await mountPopup({
      stored: { localHostEnabled: true, localHostUrl: 'file:///tmp/synthesis-host' },
      onStart: async () => ({ error: 'The extension has no access to the configured host origin' }),
    });

    (document.getElementById('play-pause-btn') as HTMLButtonElement).click();
    await waitFor(() => !firstRunPanel().hidden);

    expect(document.getElementById('first-run-subtitle')?.textContent).toContain(
      'saved host address cannot receive browser access',
    );
    expect((document.getElementById('grant-access-row') as HTMLElement).hidden).toBe(true);
    expect(rig.permissionsRequest).not.toHaveBeenCalled();
  });

  it('a stale Retry action resets atomically to a usable grant for the exact destination', async () => {
    const rig = await mountPopup({
      stored: { localHostEnabled: true, localHostUrl: 'http://127.0.0.1:45019' },
      onStart: async () => ({ error: 'Host could not be resolved: getaddrinfo ENOTFOUND' }),
    });
    const play = document.getElementById('play-pause-btn') as HTMLButtonElement;
    play.click();
    await waitFor(() => document.getElementById('grant-access-btn')?.textContent === 'Retry');

    rig.sendMessage.mockImplementation(async (message: Message) => {
      if (message.type === 'playback.start') {
        return { error: 'The extension has no access to the configured host origin' };
      }
      if (message.type === 'playback.getState') {
        return {
          status: 'stopped',
          currentParagraph: 0,
          totalParagraphs: 0,
          progress: 0,
          speed: 1,
          provider: 'local',
        };
      }
      if (message.type === 'queue.getState') {
        return { items: [], metadata: { count: 0, lastModified: 0 } };
      }
      return {};
    });
    rig.emitRuntimeMessage({ type: 'playbackStateUpdate', state: { status: 'playing' } });
    const repair = document.getElementById('grant-access-btn') as HTMLButtonElement;
    repair.click();
    await waitFor(
      () => document.getElementById('grant-access-btn')?.textContent === 'Grant access',
    );

    expect(countMessages(rig, 'playback.pause')).toBe(0);
    expect(countMessages(rig, 'playback.start')).toBe(2);
    repair.click();
    await waitFor(() => rig.permissionsRequest.mock.calls.length === 1);
    await waitFor(() => countMessages(rig, 'playback.start') === 3);
    expect(rig.permissionsRequest).toHaveBeenCalledWith({ origins: ['http://127.0.0.1/*'] });
    expect(document.getElementById('grant-access-reason')?.textContent).toContain(
      'only to http://127.0.0.1:45019',
    );
    expect(countMessages(rig, 'playback.pause')).toBe(0);
    expect(countMessages(rig, 'playback.start')).toBe(3);
  });

  it('renders the timing basis from authoritative playback state', async () => {
    const rig = await mountConfiguredLocalPopup();

    expect(document.getElementById('timing-basis')?.textContent).toContain('approximate');
    rig.emitRuntimeMessage({
      type: 'playbackStateUpdate',
      state: { status: 'playing', timingBasis: 'provider' },
    });
    expect(document.getElementById('timing-basis')?.textContent).toContain('provider timed');
  });

  it('adds and removes the active page through the real Queue panel contract', async () => {
    const rig = await mountConfiguredLocalPopup({
      activeTab: {
        id: 42,
        url: 'https://example.com/article',
        title: 'Queue contract article',
      },
    });

    (document.getElementById('tab-queue') as HTMLButtonElement).click();
    (document.getElementById('add-to-queue-btn') as HTMLButtonElement).click();
    await waitFor(() => document.querySelector('[aria-label="Remove from queue"]') !== null);

    expect(countMessages(rig, 'queue.add')).toBe(1);
    expect(document.getElementById('queue-count')?.textContent).toBe('1 item');

    (document.querySelector('[aria-label="Remove from queue"]') as HTMLButtonElement).click();
    await waitFor(() => document.getElementById('queue-empty-message')?.hidden === false);
    expect(countMessages(rig, 'queue.remove')).toBe(1);
    expect(document.getElementById('queue-count')?.textContent).toBe('0 items');
  });

  it('allows only one playback start while the first Play action is pending', async () => {
    const pendingStart = deferredStart();
    const rig = await mountConfiguredLocalPopup({
      onStart: async () => pendingStart.promise,
    });
    const play = document.getElementById('play-pause-btn') as HTMLButtonElement;
    const stop = document.getElementById('stop-btn') as HTMLButtonElement;

    play.click();
    play.click();
    await waitFor(() => countMessages(rig, 'playback.start') >= 1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(countMessages(rig, 'playback.start')).toBe(1);
    expect(play.disabled).toBe(true);
    expect(play.getAttribute('aria-busy')).toBe('true');
    expect(stop.disabled).toBe(false);

    rig.emitRuntimeMessage({ type: 'playbackStateUpdate', state: { status: 'stopped' } });
    rig.emitRuntimeMessage({ type: 'playbackStateUpdate', state: { status: 'playing' } });
    play.click();
    expect(countMessages(rig, 'playback.start')).toBe(1);
    expect(play.disabled).toBe(true);

    pendingStart.resolve({ success: true });
    await waitFor(() => !play.disabled);
    expect(play.hasAttribute('aria-busy')).toBe(false);
  });

  it('releases an unowned loading latch on authoritative error', async () => {
    const rig = await mountConfiguredLocalPopup({ initialPlaybackStatus: 'loading' });
    const play = document.getElementById('play-pause-btn') as HTMLButtonElement;
    expect(play.disabled).toBe(true);

    rig.emitRuntimeMessage({ type: 'playbackStateUpdate', state: { status: 'error' } });

    expect(play.disabled).toBe(false);
    expect(document.getElementById('status-text')?.textContent).toBe('Error');
  });

  it('treats Stop during pending Play as reader intent rather than route failure', async () => {
    const pendingStart = deferredStart();
    const rig = await mountConfiguredLocalPopup({
      onStart: async () => pendingStart.promise,
    });
    const play = document.getElementById('play-pause-btn') as HTMLButtonElement;
    play.click();
    await waitFor(() => countMessages(rig, 'playback.start') === 1);

    (document.getElementById('stop-btn') as HTMLButtonElement).click();
    pendingStart.resolve({ error: 'Request aborted' });
    await waitFor(() => !play.disabled);

    expect(document.getElementById('status-text')?.textContent).toBe('Ready');
    expect(firstRunPanel().hidden).toBe(true);
    expect(countMessages(rig, 'playback.start')).toBe(1);
  });

  it('operates the real Player, Tools, and Queue tabs with roving arrow/Home/End focus', async () => {
    await mountConfiguredLocalPopup();
    const player = document.getElementById('tab-player') as HTMLButtonElement;
    const tools = document.getElementById('tab-tools') as HTMLButtonElement;
    const queue = document.getElementById('tab-queue') as HTMLButtonElement;

    player.focus();
    player.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(tools);
    expect(tools.getAttribute('aria-selected')).toBe('true');
    expect((document.getElementById('panel-tools') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('panel-player') as HTMLElement).hidden).toBe(true);

    tools.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(queue);
    expect(queue.getAttribute('aria-selected')).toBe('true');
    expect((document.getElementById('panel-queue') as HTMLElement).hidden).toBe(false);

    queue.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(player);
    expect(player.getAttribute('aria-selected')).toBe('true');
    expect(player.tabIndex).toBe(0);
    expect(tools.tabIndex).toBe(-1);
    expect(queue.tabIndex).toBe(-1);
  });
});
