/**
 * Feature 167 — the popup grant row must actually be hidden when hidden.
 *
 * Regression check for Plane PROSO-44 (observed in /tmp/proso-161-ux-receipt.md
 * ANOMALY-1): `.proso-popup__grant { display: flex }` overrides the platform
 * `hidden` attribute, so a fresh unconfigured reader sees an empty, focusable
 * "Grant access" action with empty reason text.
 *
 * This check proves BOTH directions against the real checked-in markup + CSS:
 *
 *   Direction A (fresh / unconfigured): the row carries `hidden` and computes
 *   `display: none` — no layout box (offsetParent null), and per the platform
 *   rule (HTML §6.4.5: computed display none ⇒ not in the sequential focus
 *   navigation order) the inner button is not focusable. The real-browser tab
 *   order proof lives in the Feature 167 Firefox journey.
 *
 *   Direction B (permission-needed): exactly what the controller does when the
 *   local-host gate reports "no access to the configured host origin" — set a
 *   nonempty reason and remove `hidden`. The row then computes `display: flex`
 *   (visible), the reason is named, and the button is present, named
 *   ("Grant access") and actionable (enabled, real <button>, no tabindex hack).
 *
 * Planted-bug falsifier: delete the `.proso-popup__grant[hidden] { display:
 * none }` rule from style.css and Direction A fails (computed display becomes
 * `flex`), reproducing ANOMALY-1 deterministically in jsdom.
 *
 * @module tests/unit/entrypoints/popup-hidden-attribute
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { loadEntrypointBody, renderFragment } from '../accessibility/render-entrypoint';

const __dirname = dirname(fileURLToPath(import.meta.url));

const POPUP_HTML_PATH = resolve(__dirname, '../../../src/entrypoints/popup/index.html');
const POPUP_CSS_PATH = resolve(__dirname, '../../../src/entrypoints/popup/style.css');
const POPUP_MAIN_PATH = resolve(__dirname, '../../../src/entrypoints/popup/main.ts');

const popupHtml = readFileSync(POPUP_HTML_PATH, 'utf8');
const popupCss = readFileSync(POPUP_CSS_PATH, 'utf8');
const popupMain = readFileSync(POPUP_MAIN_PATH, 'utf8');

/**
 * Mount the real popup body and inject the real stylesheet into the live
 * jsdom document so computed style is honest. Returns a cleanup that unmounts
 * the injected nodes.
 */
function mountPopup(): () => void {
  const cleanup = renderFragment(loadEntrypointBody(popupHtml));
  const style = document.createElement('style');
  style.textContent = popupCss;
  document.head.appendChild(style);
  return () => {
    style.remove();
    cleanup();
  };
}

describe('popup grant row — platform `hidden` wins over display:flex (Feature 167)', () => {
  it('Direction A: fresh/unconfigured — row is hidden, has no layout box, and is out of the focusable set', () => {
    const cleanup = mountPopup();
    try {
      const row = document.getElementById('grant-access-row') as HTMLDivElement | null;
      const btn = document.getElementById('grant-access-btn') as HTMLButtonElement | null;
      expect(row).not.toBeNull();
      expect(btn).not.toBeNull();

      // Fresh markup ships the platform `hidden` attribute on the row.
      expect(row!.hidden).toBe(true);
      expect(row!.hasAttribute('hidden')).toBe(true);

      // No layout box: the `[hidden]` rule beats `.proso-popup__grant`'s flex.
      expect(getComputedStyle(row!).display).toBe('none');
      expect(row!.offsetParent).toBeNull();

      // Not focusable: computed display none ⇒ out of the sequential focus
      // navigation order (HTML §6.4.5). No tabindex hack smuggles it back.
      expect(btn!.tabIndex).toBe(0);
      expect(btn!.hasAttribute('tabindex')).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('Direction B: permission-needed — reason is named and the action is visible, named and actionable', () => {
    const cleanup = mountPopup();
    try {
      const row = document.getElementById('grant-access-row') as HTMLDivElement;
      const reason = document.getElementById('grant-access-reason') as HTMLSpanElement;
      const btn = document.getElementById('grant-access-btn') as HTMLButtonElement;

      // Exactly what maybeShowGrantAffordance does for the gate marker:
      // a nonempty reason naming the host, then the platform unhide.
      reason.textContent = 'The local synthesis host needs access to http://127.0.0.1:8899.';
      row.hidden = false;

      expect(reason.textContent?.trim().length).toBeGreaterThan(0);
      expect(getComputedStyle(row).display).toBe('flex');
      expect(row.hidden).toBe(false);
      // Named: the button carries its own accessible text.
      expect(btn.textContent?.trim()).toBe('Grant access');
      expect(btn.getAttribute('aria-label') ?? btn.textContent?.trim()).toBe('Grant access');
      // Actionable: a real enabled <button>, wired to the user-gesture grant.
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.disabled).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('source guard: the shipped CSS keeps the [hidden] override and the markup keeps `hidden`', () => {
    // CSS: the fix rule exists and is scoped to the grant row class.
    expect(popupCss).toMatch(/\.proso-popup__grant\[hidden\]\s*\{\s*display:\s*none\s*;?\s*\}/);
    // Markup: the row is hidden by default (fresh state), not painted visible.
    expect(popupHtml).toMatch(/<div class="proso-popup__grant" id="grant-access-row" hidden>/);
    // Controller: the only unhide path is the permission-needed branch with a
    // reason set first — never a bare unconditional unhide at startup.
    expect(popupMain).toMatch(/elements\.grantRow\.hidden = false;/);
    expect(popupMain.indexOf('elements.grantRow.hidden = false;')).toBeGreaterThan(
      popupMain.indexOf('elements.grantReason.textContent ='),
    );
  });

  it('source guard: the grant action is actionable — host permission request is the first await (Feature 167)', () => {
    // Firefox rejects permissions.request once the handler yields; the handler
    // must not await storage before the helper invokes it. The helper's unit
    // test proves requester.request() runs synchronously before its first await.
    const clickStart = popupMain.indexOf('async function handleGrantAccessClick');
    const requestCall = popupMain.indexOf('requestHostPermissionForOrigin', clickStart);
    expect(clickStart).toBeGreaterThanOrEqual(0);
    expect(requestCall).toBeGreaterThan(clickStart);
    // No await STATEMENT (line-leading `await `) may appear between the handler
    // start and the helper call — comments mentioning "await" are mid-line
    // prose and do not match the statement pattern.
    const handlerHead = popupMain.slice(clickStart, requestCall);
    expect(/\n\s*await /.test(handlerHead)).toBe(false);
    // The origin the request uses is cached at affordance-show time, so no
    // storage read can intervene between the gesture and the request.
    expect(popupMain).toMatch(/pendingGrantOrigin = origin;/);
    expect(popupMain).toMatch(/const origin = pendingGrantOrigin;/);
  });
});
