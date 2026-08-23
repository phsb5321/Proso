/**
 * Public-control primitives for driving a loaded Firefox extension.
 *
 * Extracted from `scripts/public-actor-gate.mjs` when a second gate
 * (`scripts/local-host-journey-gate.mjs`) needed the same actor vocabulary.
 * Every helper here addresses a control the way a person reaches it — the
 * toolbar's Unified Extensions button, the browser action's visible label, a
 * popup control's accessible name — never an internal id or a test hook.
 *
 * The plant hooks are options rather than a shared env var so each gate keeps
 * its own plant vocabulary while the mechanics stay in one place.
 *
 * @module scripts/lib/firefox-popup
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { waitFor } from './webdriver.mjs';

/** A missing prerequisite: the journey could not run. Never a pass. */
export class Blocked extends Error {}

export function blocked(message) {
  throw new Blocked(message);
}

/**
 * Firefox prefs every extension-journey gate needs.
 *
 * `extensions.webextensions.remote: false` is a deliberate relaxation of the
 * process model, documented in `docs/reading-journey-status.md`: WebDriver
 * exposes no window handle for an extension popup panel, and a remote popup's
 * document is opaque to the parent process, so running in-process is what
 * makes the popup's own DOM — and therefore its accessible names — readable at
 * all. The click, the listener and the rendered popup are real; only the
 * process boundary is relaxed.
 */
export const JOURNEY_PREFS = {
  'extensions.webextensions.remote': false,
  'media.autoplay.default': 0,
  'media.autoplay.blocking_policy': 0,
  'media.volume_scale': '0.0',
  'browser.shell.checkDefaultBrowser': false,
  'datareporting.policy.dataSubmissionEnabled': false,
  'extensions.autoDisableScopes': 0,
};

/**
 * Locate a Firefox to drive: `FIREFOX_BIN` wins, otherwise the first Firefox on
 * `PATH`. A missing browser is BLOCKED, never a skip.
 */
export function resolveFirefox() {
  const explicit = process.env.FIREFOX_BIN;
  if (explicit) {
    if (!existsSync(explicit)) blocked(`FIREFOX_BIN does not exist: ${explicit}`);
    return explicit;
  }
  for (const name of ['firefox', 'firefox-nightly', 'firefox-developer-edition']) {
    try {
      return execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
    } catch {
      // Not on PATH under this name; try the next.
    }
  }
  return blocked('No Firefox found on PATH. Set FIREFOX_BIN to a Firefox executable.');
}

/** Run `script` in the parent process with chrome privileges, then restore content context. */
export async function chromeEval(driver, script, args = []) {
  await driver.session('POST', '/moz/context', { context: 'chrome' });
  try {
    return await driver.execute(script, args);
  } finally {
    await driver.session('POST', '/moz/context', { context: 'content' });
  }
}

/**
 * Open an in-extension page and focus it.
 *
 * Firefox refuses `moz-extension://` navigation driven from content context, so
 * the tab is opened from chrome context with the system principal. This is
 * setup, not an actor action — the actor never opens a settings tab.
 */
export async function openExtensionPage(driver, url) {
  const before = await driver.session('GET', '/window/handles');
  await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const tab = win.gBrowser.addTab(arguments[0], {
       triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
     });
     win.gBrowser.selectedTab = tab;
     return true;`,
    [url],
  );
  const handle = await waitFor('the extension page tab', async () => {
    const handles = await driver.session('GET', '/window/handles');
    return handles.find((h) => !before.includes(h)) ?? null;
  });
  await driver.session('POST', '/window', { handle });
  await waitFor('the extension page to load', async () => {
    const state = await driver.execute(
      'return JSON.stringify({ href: location.href, api: typeof browser });',
    );
    if (typeof state !== 'string') return false;
    const { href, api } = JSON.parse(state);
    return href.startsWith(url) && api === 'object';
  });
  return handle;
}

/**
 * Click the toolbar's Unified Extensions button — the public entry point to an
 * unpinned browser action in Firefox 109+.
 *
 * @param {object} [options]
 * @param {boolean} [options.hideButton] Plant: hide the toolbar button first.
 */
export async function openExtensionsPanel(driver, { hideButton = false } = {}) {
  if (hideButton) {
    await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       const btn = win.document.getElementById('unified-extensions-button');
       if (btn) btn.hidden = true;
       return true;`,
    );
  }

  const outcome = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const btn = win.document.getElementById('unified-extensions-button');
     const panel = win.document.getElementById('unified-extensions-panel');
     if (!btn) return 'no unified-extensions-button in the toolbar';
     if (btn.hidden) return 'the Unified Extensions button is hidden';
     if (panel?.state === 'open') return 'ok';
     btn.click();
     return 'ok';`,
  );
  if (outcome !== 'ok') blocked(`Could not reach the Unified Extensions button: ${outcome}`);
  const state = await waitFor('the Unified Extensions panel to open', async () => {
    const open = await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       const panel = win.document.getElementById('unified-extensions-panel');
       return panel ? panel.state : 'missing';`,
    );
    return open === 'open' ? open : null;
  }).catch(() => null);
  if (!state) {
    const diagnostic = await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       const panel = win.document.getElementById('unified-extensions-panel');
       const openPanels = Array.from(win.document.querySelectorAll('panel'))
         .map((node) => ({ id: node.id, state: node.state }))
         .filter((node) => node.state && node.state !== 'closed');
       return JSON.stringify({ panelState: panel?.state ?? 'missing', openPanels });`,
    );
    blocked(`The Unified Extensions panel never opened (${diagnostic})`);
  }
}

/**
 * Click the Proso browser action inside the panel.
 *
 * The widget is addressed by the extension id Firefox itself stamps on the
 * item (`data-extensionid`) and verified by the visible label the user reads,
 * so a renamed internal widget id cannot silently pass.
 *
 * @param {object} [options]
 * @param {boolean} [options.removeWidget] Plant: delete the widget first.
 * @param {boolean} [options.useMenuButton] Plant: click the item's overflow
 *   menu instead of its action button — a real control, but not the one that
 *   opens the popup.
 * @returns {Promise<string>} the visible label that was clicked.
 */
export async function clickBrowserAction(
  driver,
  addonId,
  { removeWidget = false, useMenuButton = false } = {},
) {
  if (removeWidget) {
    await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       const node = win.document.querySelector('[data-extensionid="' + arguments[0] + '"]');
       node?.remove();
       return true;`,
      [addonId],
    );
  }

  const found = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const item = win.document.querySelector('toolbaritem[data-extensionid="' + arguments[0] + '"]');
     if (!item) return JSON.stringify({ ok: false, why: 'no browser action widget for the extension' });
     const action = item.querySelector('.unified-extensions-item-action-button');
     if (!action) return JSON.stringify({ ok: false, why: 'the widget exposes no action button' });
     if (action.disabled) return JSON.stringify({ ok: false, why: 'the browser action is disabled' });
     return JSON.stringify({ ok: true, label: action.getAttribute('label') });`,
    [addonId],
  );
  const widget = JSON.parse(found);
  if (!widget.ok) blocked(`Browser action unreachable: ${widget.why}`);
  if (!widget.label) blocked('The browser action carries no visible label');

  const selector = useMenuButton
    ? '.unified-extensions-item-menu-button'
    : '.unified-extensions-item-action-button';
  const clicked = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const item = win.document.querySelector('toolbaritem[data-extensionid="' + arguments[0] + '"]');
     const action = item.querySelector(arguments[1]);
     if (!action) return 'no element matched ' + arguments[1];
     action.click();
     return 'ok';`,
    [addonId, selector],
  );
  if (clicked !== 'ok') blocked(`Clicking the browser action failed: ${clicked}`);
  return widget.label;
}

/** True when the extension popup document is open and parsed. */
export async function popupOpen(driver) {
  const state = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const b = Array.from(win.document.querySelectorAll('browser'))
       .find((x) => x.currentURI && x.currentURI.spec.includes('/popup.html'));
     if (!b) return 'absent';
     if (!b.contentDocument) return 'opaque';
     return b.contentDocument.readyState;`,
  );
  return state === 'complete' || state === 'interactive';
}

/**
 * Open the popup through its public controls, reopening it if it dismissed
 * itself. `open` is supplied by the caller so each gate keeps its own plant
 * options on the panel and the browser action.
 */
export async function ensurePopupOpen(driver, open) {
  if (await popupOpen(driver)) return;
  await open();
  const ok = await waitFor('the Proso popup to open', async () =>
    (await popupOpen(driver)) ? true : null,
  ).catch(() => false);
  if (!ok) blocked('The browser action opened no popup document');
}

/**
 * Read the popup's public state: the accessible names it currently offers and
 * the status text it announces through `aria-live`.
 *
 * A control's accessible name is its `aria-label` when it has one and its own
 * text when it does not — the popup ships both kinds (`aria-label="Play"`, and
 * a "Grant access" button named only by its text), and a screen reader
 * announces both. `names` is the union, so a gate can address either.
 */
export async function readPopup(driver) {
  const raw = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const b = Array.from(win.document.querySelectorAll('browser'))
       .find((x) => x.currentURI && x.currentURI.spec.includes('/popup.html'));
     if (!b || !b.contentDocument) return JSON.stringify({ open: false });
     const doc = b.contentDocument;
     const visible = (el) => {
       const box = el.getBoundingClientRect();
       return box.width > 0 && box.height > 0;
     };
     const labelled = Array.from(doc.querySelectorAll('[aria-label]'))
       .filter((el) => el.getAttribute('aria-label') && visible(el))
       .map((el) => el.getAttribute('aria-label'));
     // Text-named controls only count while the user can actually see them:
     // the popup keeps hidden rows in the DOM (the grant affordance is one),
     // and a name nobody can reach is not a name the gate may address.
     const textNamed = Array.from(doc.querySelectorAll('button'))
       .filter((el) => !el.getAttribute('aria-label') && visible(el))
       .map((el) => el.textContent.replace(/\\s+/g, ' ').trim())
       .filter(Boolean);
     const status = doc.querySelector('[aria-live]');
     const selectedTab = doc.querySelector('[role="tab"][aria-selected="true"]');
     const visiblePanel = Array.from(doc.querySelectorAll('[role="tabpanel"]')).find(visible);
     const timingBasis = doc.getElementById('timing-basis');
     return JSON.stringify({
       open: true,
       names: Array.from(new Set([...labelled, ...textNamed])),
       // Double backslash: this script is a template literal, and an untagged
       // template turns \\s into a bare s, which would collapse the regex to /s+/g.
       status: status ? status.textContent.replace(/\\s+/g, ' ').trim() : null,
       selectedTab: selectedTab
         ? selectedTab.getAttribute('aria-label') || selectedTab.textContent.replace(/\\s+/g, ' ').trim()
         : null,
       visiblePanel: visiblePanel?.id ?? null,
       panelText: visiblePanel?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
       timingBasis: timingBasis && visible(timingBasis)
         ? timingBasis.textContent.replace(/\\s+/g, ' ').trim()
         : null,
     });`,
  );
  return JSON.parse(raw);
}

/**
 * Click a popup control by the accessible name a screen reader would announce,
 * matching an `aria-label` first and the control's own visible text second.
 *
 * A name that is absent, hidden, or disabled is BLOCKED: the actor could not
 * have used it either.
 */
export async function clickByName(driver, name, open) {
  await ensurePopupOpen(driver, open);
  const raw = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const b = Array.from(win.document.querySelectorAll('browser'))
       .find((x) => x.currentURI && x.currentURI.spec.includes('/popup.html'));
     if (!b || !b.contentDocument) return JSON.stringify({ ok: false, why: 'the popup is not open' });
     const doc = b.contentDocument;
     const wanted = arguments[0];
     const candidates = Array.from(doc.querySelectorAll('button')).filter(
       (node) =>
         node.getAttribute('aria-label') === wanted ||
         (!node.getAttribute('aria-label') &&
           node.textContent.replace(/\\s+/g, ' ').trim() === wanted),
     );
     const el = candidates.find((node) => {
       const box = node.getBoundingClientRect();
       return box.width > 0 && box.height > 0;
     });
     if (!el) return JSON.stringify({ ok: false, why: 'no visible control has that accessible name' });
     if (el.disabled) return JSON.stringify({ ok: false, why: 'the control is disabled' });
     el.click();
     return JSON.stringify({ ok: true, tag: el.tagName.toLowerCase() });`,
    [name],
  );
  const outcome = JSON.parse(raw);
  if (!outcome.ok) blocked(`Public control "${name}" is unusable: ${outcome.why}`);
}

/**
 * Read the reading state the user can see in the page.
 *
 * The sticky footer attaches a CLOSED shadow root by design, so the harness
 * reads what the page itself exposes: the footer container, the body padding
 * the footer reserves, and the paragraph highlight the reader watches move.
 */
export const READ_PAGE = `
  return {
    footer: Boolean(document.getElementById('proso-sticky-footer')),
    footerCount: document.querySelectorAll('#proso-sticky-footer').length,
    wordWrapperCount: document.querySelectorAll('.proso-w').length,
    bodyPadding: document.body.style.paddingBottom || null,
    highlighted: Array.from(document.querySelectorAll('.proso-highlight'))
      .map((el) => el.textContent.replace(/\\s+/g, ' ').trim())
      .filter(Boolean),
    activeWord: document.querySelector('.proso-w--active')?.textContent?.trim() || null,
  };
`;
