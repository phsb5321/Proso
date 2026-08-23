/**
 * Hexagonal DI Init Wiring Tests (T008)
 *
 * Verifies that initHexagonalArchitecture() actually performs the set*()
 * dependency wiring as a side effect — specifically that after init a
 * representative hexagonal handler (footer.show, which depends on the
 * highlight synchronizer wired via setHighlightSync()) executes WITHOUT the
 * "Highlight sync not initialized" guard firing.
 *
 * Strategy: mock the composition container (so no real TTS / IndexedDB
 * adapters are constructed) but let the REAL ../handlers set*() functions and
 * the REAL footer handler run. The footer module and init-hexagonal share the
 * same ../handlers module instance, so a successful setHighlightSync() is
 * observable through the footer handler's behavior.
 *
 * Uses jest.unstable_mockModule + dynamic import (ESM-compatible), mirroring
 * tests/unit/handlers/debug.handlers.test.ts.
 *
 * @module tests/unit/background/init-hexagonal
 * @feature 062-hexagonal-wiring-recovery
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Ok } from '../../../src/core/shared/result';
import type { IHighlightSynchronizer } from '../../../src/ports/highlight-sync.port';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// --- Fake adapters/services for the mocked container ------------------------

/**
 * Minimal highlight synchronizer stub whose methods all resolve Ok. Only the
 * methods footer.show touches (showFooter) need real behavior; the rest exist
 * to satisfy the port shape at the value level.
 */
function makeFakeHighlightSync(): IHighlightSynchronizer {
  const ok = async () => Ok(undefined);
  return {
    highlightParagraph: ok,
    setWordTimeline: ok,
    highlightWord: ok,
    sendAudioPosition: ok,
    clearHighlights: ok,
    showFooter: jest.fn(ok),
    hideFooter: ok,
    updateFooterState: ok,
  } as unknown as IHighlightSynchronizer;
}

const fakeHighlightSync = makeFakeHighlightSync();

const fakeContainer = {
  adapters: {
    settingsStore: { subscribe: jest.fn(() => () => undefined) },
    apiClient: {},
    highlightSync: fakeHighlightSync,
    audioGenerator: { generateAudio: jest.fn() },
  },
  services: {
    // subscribeToSettings() is invoked during init (T017) and must not throw.
    playback: {
      subscribeToSettings: jest.fn(),
      getState: jest.fn(() => ({ activeTabId: 7 })),
      stop: jest.fn(async () => ({ ok: true })),
    },
  },
};

let containerInitialized = false;

// --- Mock the composition module --------------------------------------------

jest.unstable_mockModule(resolve(srcDir, 'composition'), () => ({
  isContainerInitialized: jest.fn(() => containerInitialized),
  createContainer: jest.fn(() => {
    containerInitialized = true;
  }),
  getContainer: jest.fn(() => fakeContainer),
  // Footer handlers import these from ../composition; provide value stubs.
  getPlaybackService: jest.fn(() => fakeContainer.services.playback),
  isPlaybackServiceAvailable: jest.fn(() => true),
  // Other handlers in the loaded graph statically import these names; they
  // must exist on the mock for ESM linking to succeed.
  getContentExtractionService: jest.fn(() => ({})),
  isContentExtractionServiceAvailable: jest.fn(() => true),
  reconfigureAudioGenerator: jest.fn(),
}));

// Avoid constructing the real Dexie-backed highlight repository in jsdom.
jest.unstable_mockModule(resolve(srcDir, 'adapters/storage/highlight-indexeddb.adapter'), () => ({
  createHighlightRepository: jest.fn(() => ({})),
}));

// wxt/browser in the jest env lacks tabs.onActivated (T006 listener target) and
// returns nothing useful from storage. Provide the minimal surface init needs so
// the happy path runs to completion instead of bailing into the catch.
const onActivatedAddListener = jest.fn();
const onStorageChangedAddListener = jest.fn();
jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    storage: {
      local: { get: jest.fn(async () => ({})) },
      onChanged: { addListener: onStorageChangedAddListener },
    },
    tabs: { onActivated: { addListener: onActivatedAddListener } },
  },
}));

// --- Dynamic imports (after mocks) ------------------------------------------

const { initHexagonalArchitecture } = await import('../../../src/background/init-hexagonal');
const {
  getGlobalInstrumentedRegistry,
  resetGlobalInstrumentedRegistry,
  registerFooterHandlers,
  setHighlightSync,
} = await import('../../../src/handlers');

// --- Tests ------------------------------------------------------------------

const NOT_INITIALIZED = 'Highlight sync not initialized';

describe('initHexagonalArchitecture DI wiring (T008)', () => {
  beforeEach(() => {
    containerInitialized = false;
    jest.clearAllMocks();
    resetGlobalInstrumentedRegistry();
  });

  it('footer.show fails with "not initialized" BEFORE wiring (guard is real)', async () => {
    // Wire NOTHING — register the footer handler on a fresh registry and
    // dispatch. The highlight-sync guard must fire.
    const registry = getGlobalInstrumentedRegistry();
    registerFooterHandlers(registry);

    const result = await registry.dispatch('footer.show', { tabId: 7 });

    // The handler throws the guard error -> registry returns Err(execution_failed).
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.type).toBe('execution_failed');
      expect('message' in result.error ? result.error.message : '').toContain(NOT_INITIALIZED);
    }
  });

  it('completes the happy-path init and invokes the set*() wiring', async () => {
    await expect(initHexagonalArchitecture()).resolves.toBeDefined();

    // T017 side effect: PlaybackService.subscribeToSettings() was invoked.
    expect(fakeContainer.services.playback.subscribeToSettings).toHaveBeenCalledTimes(1);
    // T006 side effect: the tab-activation listener was registered, proving the
    // init body ran to completion rather than bailing into the catch block.
    expect(onActivatedAddListener).toHaveBeenCalledTimes(1);
    expect(onStorageChangedAddListener).toHaveBeenCalledTimes(1);
  });

  it('stops playback when browser focus activates a different tab', async () => {
    await initHexagonalArchitecture();
    const listener = onActivatedAddListener.mock.calls[0]?.[0] as
      | ((info: { tabId: number }) => void)
      | undefined;

    listener?.({ tabId: 9 });
    await Promise.resolve();

    expect(fakeContainer.services.playback.stop).toHaveBeenCalledTimes(1);
  });

  it('applies the disabled preference without a background restart', async () => {
    await initHexagonalArchitecture();
    const storageListener = onStorageChangedAddListener.mock.calls[0]?.[0] as
      | ((changes: Record<string, { newValue?: unknown }>, area: string) => void)
      | undefined;
    const activationListener = onActivatedAddListener.mock.calls[0]?.[0] as
      | ((info: { tabId: number }) => void)
      | undefined;

    storageListener?.({ stopPlaybackOnTabChange: { newValue: false } }, 'local');
    activationListener?.({ tabId: 9 });
    await Promise.resolve();

    expect(fakeContainer.services.playback.stop).not.toHaveBeenCalled();
  });

  it('footer.show executes WITHOUT the "not initialized" error AFTER init', async () => {
    // Run the real init path; it wires setHighlightSync(container.adapters.highlightSync).
    const registry = await initHexagonalArchitecture();

    // registerAllHandlers (called inside init) registered footer.show on the
    // global registry. Dispatch it with an explicit tab id.
    const result = await registry.dispatch<{ tabId: number }, { success: boolean; error?: string }>(
      'footer.show',
      { tabId: 7 },
    );

    // The guard must NOT have fired — the set*() side effect took.
    expect(result.ok).toBe(true);
    if (result.ok) {
      const response = result.value as { success: boolean; error?: string };
      expect(response.error ?? '').not.toContain(NOT_INITIALIZED);
      expect(response.success).toBe(true);
    }
    // And the wired synchronizer actually received the call.
    expect(fakeHighlightSync.showFooter).toHaveBeenCalledWith(7);
  });

  it('footer.show still works after an explicit setHighlightSync (idempotent wiring)', async () => {
    // Belt-and-suspenders: wiring the sync directly also satisfies the guard,
    // proving the seam the init path relies on.
    setHighlightSync(fakeHighlightSync);

    const registry = getGlobalInstrumentedRegistry();
    registerFooterHandlers(registry);

    const result = await registry.dispatch('footer.show', { tabId: 9 });

    expect(result.ok).toBe(true);
  });
});
