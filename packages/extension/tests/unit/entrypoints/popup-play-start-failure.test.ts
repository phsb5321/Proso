// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Popup play-button failure paths.
 *
 * Covers the two `showPlaybackStartFailure` call sites inside `handlePlayPause`
 * (`main.ts` — error-shaped `playback.start` result, and a thrown error). Both are
 * reached through the real play button, because calling `showPlaybackStartFailure`
 * directly exercises the renderer and not the decision to call it.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const here = dirname(fileURLToPath(import.meta.url));
const popupHtml = readFileSync(resolve(here, '../../../src/entrypoints/popup/index.html'), 'utf-8');
const popupBody = popupHtml.slice(
  popupHtml.indexOf('<body>') + '<body>'.length,
  popupHtml.indexOf('</body>'),
);

type Message = { type?: string };

/**
 * Route background messages. `playback.start` is supplied per test; everything
 * else returns the minimum shape `init()` needs so the popup reaches a stopped,
 * idle state before the button is clicked.
 */
function makeBrowser(onStart: () => Promise<unknown>) {
  return {
    runtime: {
      getManifest: () => ({ version: '0.0.0-test' }),
      sendMessage: jest.fn(async (message: Message) => {
        if (message.type === 'playback.start') return onStart();
        if (message.type === 'playback.getState') {
          return {
            status: 'stopped',
            currentParagraph: 0,
            totalParagraphs: 0,
            progress: 0,
            speed: 1,
            provider: 'elevenlabs',
          };
        }
        return {};
      }),
      onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    },
    storage: {
      local: {
        get: jest.fn(async () => ({ telemetryEnabled: false })),
        set: jest.fn(async () => undefined),
      },
    },
    tabs: {
      query: jest.fn(async () => []),
      sendMessage: jest.fn(async () => ({ success: false })),
    },
  };
}

/** Load the popup entrypoint against a fresh DOM, then click Play. */
async function clickPlayWith(onStart: () => Promise<unknown>): Promise<{
  statusDot: HTMLElement;
  statusText: HTMLElement;
}> {
  jest.resetModules();
  document.body.innerHTML = popupBody;

  jest.unstable_mockModule('wxt/browser', () => ({ browser: makeBrowser(onStart) }));
  await import('../../../src/entrypoints/popup/main');

  const statusDot = document.getElementById('status-dot') as HTMLElement;
  const statusText = document.getElementById('status-text') as HTMLElement;

  // `init()` runs on import and awaits several background round trips.
  await waitFor(() => statusDot.getAttribute('data-status') === 'stopped');

  (document.getElementById('play-pause-btn') as HTMLButtonElement).click();
  // The handler passes through 'loading' before it settles on the failure.
  await waitFor(() => statusText.textContent !== 'Loading...');

  return { statusDot, statusText };
}

/**
 * Poll until `done()`, so the test costs what it needs and not a fixed budget.
 * The budget sits under each test's own timeout, so a stall reports which state
 * never arrived rather than Jest's generic timeout.
 */
async function waitFor(done: () => boolean, timeoutMs = 12000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for popup state');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('popup play button — playback.start failures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('leaves playback stopped and shows the server message when start returns an error', async () => {
    const remedy =
      'Managed TTS is not included in this tier. Add a provider API key in settings, or use a plan that includes managed TTS.';

    const { statusDot, statusText } = await clickPlayWith(async () => ({
      _hexError: true,
      error: remedy,
    }));

    expect(statusDot.getAttribute('data-status')).toBe('stopped');
    expect(statusText.textContent).toBe(remedy);
  }, 15000);

  it('handles an error-only result, which carries no _hexError marker', async () => {
    const remedy = 'Add a provider API key in settings.';

    // The guard accepts either marker. This is the branch a plain server error
    // response takes, and it is not the one the _hexError case exercises.
    const { statusDot, statusText } = await clickPlayWith(async () => ({ error: remedy }));

    expect(statusDot.getAttribute('data-status')).toBe('stopped');
    expect(statusText.textContent).toBe(remedy);
  }, 15000);

  it('leaves playback stopped and shows the message when start throws', async () => {
    const message = 'Background disconnected before playback started';

    const { statusDot, statusText } = await clickPlayWith(async () => {
      throw new Error(message);
    });

    expect(statusDot.getAttribute('data-status')).toBe('stopped');
    expect(statusText.textContent).toBe(message);
  }, 15000);
});
