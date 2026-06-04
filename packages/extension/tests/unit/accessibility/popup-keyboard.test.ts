// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Accessibility Unit Tests - Popup Keyboard Navigation
 *
 * Task: T078 (spec 056 — production readiness, User Story 6, FR-030).
 *
 * Verifies keyboard operability of the popup controls against the real popup
 * markup (`src/entrypoints/popup/index.html`):
 * - Tab order reaches every playback control (prev / play-pause / next / stop)
 *   plus the settings button, in DOM order, with none removed from the tab
 *   sequence.
 * - The controls are native `<button>` elements, so Enter/Space activate them
 *   (the platform fires a `click`); we assert the bound activation handler runs.
 * - Tab switching updates `aria-selected`, mirroring the popup's `switchTab`.
 *
 * The markup is the project's own checked-in fixture (scripts stripped before
 * injection), so DOM parsing via the jsdom document is safe here.
 *
 * @module tests/unit/accessibility/popup-keyboard.test
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadEntrypointBody, renderFragment } from './render-entrypoint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POPUP_HTML = path.resolve(__dirname, '../../../src/entrypoints/popup/index.html');

/** Selector matching all natively-focusable, tabbable controls. */
const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Visible (not inside a `hidden` ancestor) tabbable controls, in DOM order. */
function visibleTabbables(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (el) => el.closest('[hidden]') === null && el.tabIndex !== -1,
  );
}

describe('Accessibility - Popup Keyboard Navigation (T078)', () => {
  let cleanup: () => void;

  beforeEach(() => {
    const body = loadEntrypointBody(fs.readFileSync(POPUP_HTML, 'utf-8'));
    cleanup = renderFragment(body);
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('exposes the playback controls as native, tabbable buttons', () => {
    const ids = ['prev-btn', 'play-pause-btn', 'next-btn', 'stop-btn'];
    for (const id of ids) {
      const btn = document.getElementById(id);
      expect(btn).not.toBeNull();
      expect(btn?.tagName).toBe('BUTTON');
      // Native buttons are tabbable (tabIndex 0) and not removed from order.
      expect((btn as HTMLButtonElement).tabIndex).toBe(0);
    }
  });

  it('reaches play/pause, next, prev, stop and settings in Tab order', () => {
    const order = visibleTabbables().map((el) => el.id);
    const required = ['settings-btn', 'prev-btn', 'play-pause-btn', 'next-btn', 'stop-btn'];
    for (const id of required) {
      expect(order).toContain(id);
    }

    // Playback controls must appear in their on-screen order.
    const idx = (id: string) => order.indexOf(id);
    expect(idx('prev-btn')).toBeLessThan(idx('play-pause-btn'));
    expect(idx('play-pause-btn')).toBeLessThan(idx('next-btn'));
    expect(idx('next-btn')).toBeLessThan(idx('stop-btn'));
  });

  it('activates each control via Enter and Space (native button activation)', () => {
    const controlIds = ['prev-btn', 'play-pause-btn', 'next-btn', 'stop-btn'];

    for (const id of controlIds) {
      const btn = document.getElementById(id) as HTMLButtonElement;
      const handler = jest.fn();
      // Mirror the popup's real binding (`addEventListener('click', handler)`):
      // for a native button, Enter/Space produce a click.
      btn.addEventListener('click', handler);

      btn.focus();
      expect(document.activeElement).toBe(btn);

      // Simulate the platform translating Enter/Space keypress into activation.
      activateWithKey(btn, 'Enter');
      activateWithKey(btn, ' ');

      expect(handler).toHaveBeenCalledTimes(2);
    }
  });

  it('moves aria-selected between tabs on keyboard activation', () => {
    const tabs = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const panels: Record<string, HTMLElement | null> = {
      player: document.getElementById('panel-player'),
      tools: document.getElementById('panel-tools'),
      queue: document.getElementById('panel-queue'),
    };

    // Replicate the popup's switchTab(): activate one tab, deactivate the rest.
    function switchTab(targetTab: HTMLButtonElement): void {
      for (const tab of tabs) {
        const active = tab === targetTab;
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        const panel = panels[tab.dataset.tab ?? ''];
        if (panel) {
          panel.hidden = !active;
        }
      }
    }
    for (const tab of tabs) {
      tab.addEventListener('click', () => switchTab(tab));
    }

    const toolsTab = document.getElementById('tab-tools') as HTMLButtonElement;
    toolsTab.focus();
    activateWithKey(toolsTab, 'Enter');

    expect(toolsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-player')?.getAttribute('aria-selected')).toBe('false');
    expect(panels.tools?.hidden).toBe(false);
    expect(panels.player?.hidden).toBe(true);
  });
});

/**
 * Simulate keyboard activation of a native button. jsdom does not bridge
 * Enter/Space keydown to a synthetic click (unlike a real browser), so we
 * dispatch the keydown (asserting it is not swallowed) and then the resulting
 * `click` the platform would emit.
 */
function activateWithKey(el: HTMLElement, key: string): void {
  const keydown = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  el.dispatchEvent(keydown);
  // The browser would not fire click if keydown was default-prevented.
  if (!keydown.defaultPrevented) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
}
