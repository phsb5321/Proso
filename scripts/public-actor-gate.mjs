/**
 * `make public-actor-gate` — public-control acceptance harness for the reading
 * journey.
 *
 * This is the sibling of `scripts/smoke-reading.mjs`, not a replacement for it.
 * The smoke calls the extension's own `shortcuts.onCommand` entry point, which
 * proves the command listener and every link downstream of it but proves no
 * user-reachable control. This harness never touches `onCommand`. Every actor
 * action here is a click on a control a person can see:
 *
 *   Unified Extensions button -> Proso browser action -> popup "Play"
 *   -> page-visible reading state -> popup "Pause" -> popup "Play"
 *
 * and every control is located by its public accessible name, not by an
 * internal id or a test hook.
 *
 * What it does NOT prove: FR-1, the account-free read. Playback here is served
 * by the same local API stub `smoke-reading` uses, because on `main` a real
 * account-free read has no audio source at all — managed TTS answers 402 and
 * browser speech synthesis was removed. This harness proves the public control
 * path; the account-free claim waits on the local appliance provider.
 *
 * Verdicts are three-valued and none of them is silence:
 *   PASS (0)    every public control was found, driven, and observed.
 *   FAIL (1)    a control worked but the journey did not follow.
 *   BLOCKED (2) a browser, driver, button, popup, or accessible name was
 *               missing, so the journey never ran. Never reported as a pass.
 *
 * @module scripts/public-actor-gate
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARTICLE_PARAGRAPHS, startFixtureServer } from './lib/reading-fixture-server.mjs';
import { launch, sleep, waitFor } from './lib/webdriver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const buildDir = path.join(repoRoot, 'packages/extension/.output/firefox-mv2');
const artifactDir = path.join(repoRoot, '.artifacts/public-actor-gate');

/** Pinning the internal UUID makes `moz-extension://` addressable up front. */
const ADDON_ID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const ADDON_UUID = '8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90';

/**
 * Accessible names this harness addresses controls by. These are the contract:
 * renaming one in the popup must turn this gate red, which is what the
 * `play-name` plant proves.
 */
const NAME = {
  play: 'Play',
  pause: 'Pause',
  previous: 'Previous paragraph',
};

/**
 * The break to plant, or `''` for a real run. Each value severs exactly one
 * link so the assertion guarding that link can be shown to catch it. See
 * `scripts/public-actor-plants.mjs`.
 */
const PLANT = process.env.PUBLIC_ACTOR_PLANT ?? '';

const steps = [];
/** Every actor action, in order, with the public name it was addressed by. */
const actions = [];

function record(name, detail) {
  steps.push({ name, detail, at: new Date().toISOString() });
  process.stdout.write(`  ok  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function act(control, via) {
  actions.push({ control, via, at: new Date().toISOString() });
}

/** A missing prerequisite: the journey could not run. Never a pass. */
class Blocked extends Error {}

function blocked(message) {
  throw new Blocked(message);
}

function fail(message) {
  throw new Error(message);
}

function head() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function requestText(request) {
  const text = request.body?.text ?? request.body?.input ?? '';
  return typeof text === 'string' ? text : '';
}

/**
 * Locate a Firefox to drive: `FIREFOX_BIN` wins, otherwise the first Firefox on
 * `PATH`. A missing browser is BLOCKED, never a skip.
 */
function resolveFirefox() {
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
async function chromeEval(driver, script, args = []) {
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
async function openExtensionPage(driver, url) {
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
 */
async function openExtensionsPanel(driver) {
  if (PLANT === 'panel') {
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
     if (!btn) return 'no unified-extensions-button in the toolbar';
     if (btn.hidden) return 'the Unified Extensions button is hidden';
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
  if (!state) blocked('The Unified Extensions panel never opened');
  act('Unified Extensions button', 'toolbar id unified-extensions-button');
}

/**
 * Click the Proso browser action inside the panel.
 *
 * The widget is addressed by the extension id Firefox itself stamps on the
 * item (`data-extensionid`) and verified by the visible label the user reads,
 * so a renamed internal widget id cannot silently pass.
 */
async function clickBrowserAction(driver) {
  if (PLANT === 'button') {
    await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       const node = win.document.querySelector('[data-extensionid="' + arguments[0] + '"]');
       node?.remove();
       return true;`,
      [ADDON_ID],
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
    [ADDON_ID],
  );
  const widget = JSON.parse(found);
  if (!widget.ok) blocked(`Browser action unreachable: ${widget.why}`);
  if (!widget.label) blocked('The browser action carries no visible label');

  // The `popup` plant clicks the item's overflow menu instead of its action
  // button: a real control, but not the one that opens the popup.
  const selector =
    PLANT === 'popup'
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
    [ADDON_ID, selector],
  );
  if (clicked !== 'ok') blocked(`Clicking the browser action failed: ${clicked}`);
  act(`browser action "${widget.label}"`, 'Unified Extensions panel item');
  return widget.label;
}

/** True when the extension popup document is open and parsed. */
async function popupOpen(driver) {
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

/** Open the popup through its public controls, reopening it if it dismissed itself. */
async function ensurePopupOpen(driver) {
  if (await popupOpen(driver)) return;
  await openExtensionsPanel(driver);
  await clickBrowserAction(driver);
  const ok = await waitFor('the Proso popup to open', async () =>
    (await popupOpen(driver)) ? true : null,
  ).catch(() => false);
  if (!ok) blocked('The browser action opened no popup document');
}

/**
 * Read the popup's public state: the accessible names it currently offers and
 * the status text it announces through `aria-live`.
 */
async function readPopup(driver) {
  const raw = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const b = Array.from(win.document.querySelectorAll('browser'))
       .find((x) => x.currentURI && x.currentURI.spec.includes('/popup.html'));
     if (!b || !b.contentDocument) return JSON.stringify({ open: false });
     const doc = b.contentDocument;
     const named = Array.from(doc.querySelectorAll('[aria-label]'))
       .filter((el) => el.getAttribute('aria-label'))
       .map((el) => el.getAttribute('aria-label'));
     const status = doc.querySelector('[aria-live]');
     return JSON.stringify({
       open: true,
       names: named,
       // Double backslash: this script is a template literal, and an untagged
       // template turns \s into a bare s, which would collapse the regex to /s+/g.
       status: status ? status.textContent.replace(/\\s+/g, ' ').trim() : null,
     });`,
  );
  return JSON.parse(raw);
}

/**
 * Click a popup control by the accessible name a screen reader would announce.
 *
 * A name that is absent, hidden, or disabled is BLOCKED: the actor could not
 * have used it either.
 */
async function clickByName(driver, name) {
  await ensurePopupOpen(driver);
  const target = PLANT === 'play-name' && name === NAME.play ? 'Play the article aloud' : name;
  const raw = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     const b = Array.from(win.document.querySelectorAll('browser'))
       .find((x) => x.currentURI && x.currentURI.spec.includes('/popup.html'));
     if (!b || !b.contentDocument) return JSON.stringify({ ok: false, why: 'the popup is not open' });
     const doc = b.contentDocument;
     const el = doc.querySelector('[aria-label="' + arguments[0] + '"]');
     if (!el) return JSON.stringify({ ok: false, why: 'no control has that accessible name' });
     if (el.disabled) return JSON.stringify({ ok: false, why: 'the control is disabled' });
     const box = el.getBoundingClientRect();
     if (box.width === 0 || box.height === 0) {
       return JSON.stringify({ ok: false, why: 'the control is not visible' });
     }
     el.click();
     return JSON.stringify({ ok: true, tag: el.tagName.toLowerCase() });`,
    [target],
  );
  const outcome = JSON.parse(raw);
  if (!outcome.ok) blocked(`Public control "${target}" is unusable: ${outcome.why}`);
  act(`popup control "${target}"`, 'accessible name');
}

/**
 * Read the reading state the user can see in the page.
 *
 * The sticky footer attaches a CLOSED shadow root by design, so the harness
 * reads what the page itself exposes: the footer container, the body padding
 * the footer reserves, and the paragraph highlight the reader watches move.
 */
const READ_PAGE = `
  return {
    footer: Boolean(document.getElementById('proso-sticky-footer')),
    bodyPadding: document.body.style.paddingBottom || null,
    highlighted: Array.from(document.querySelectorAll('.proso-highlight'))
      .map((el) => el.textContent.replace(/\\s+/g, ' ').trim())
      .filter(Boolean),
  };
`;

async function main() {
  if (!existsSync(path.join(buildDir, 'manifest.json'))) {
    blocked(
      `Missing Firefox build at ${buildDir}. Run: pnpm --filter @proso/extension build:firefox`,
    );
  }
  record('firefox-mv2 build present', buildDir);

  const binary = resolveFirefox();
  record('firefox resolved', binary);

  const fixture = await startFixtureServer();
  record('fixture server started', fixture.origin);

  const driver = await launch({
    binary,
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      // WebDriver exposes no window handle for an extension popup panel, and a
      // remote popup's document is opaque to the parent process. Running the
      // extension in-process is what makes the popup's own DOM — and therefore
      // its accessible names — readable at all. The click, the listener and the
      // rendered popup are real; only the process boundary is relaxed.
      'extensions.webextensions.remote': false,
      'media.autoplay.default': 0,
      'media.autoplay.blocking_policy': 0,
      'media.volume_scale': '0.0',
      'browser.shell.checkDefaultBrowser': false,
      'datareporting.policy.dataSubmissionEnabled': false,
      'extensions.autoDisableScopes': 0,
    },
  });

  try {
    await driver.installAddon(buildDir);
    record('built extension installed in Firefox');

    // Setup, not an actor action: point the extension at the local API stub.
    await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/settings.html`);
    const serverUrl = PLANT === 'tts' ? 'http://127.0.0.1:1' : fixture.origin;
    await driver.executeAsync(
      `const [origin, done] = arguments;
       browser.storage.local
         .set({
           serverUrl: origin,
           provider: 'openai',
           licenseKey: null,
           cacheType: 'memory',
           // Slowest supported rate: at 1.0x the fixture clip finishes before a
           // pause and resume can be observed at all.
           speed: 0.5,
         })
         .then(() => browser.storage.local.get(['serverUrl', 'provider']))
         .then(done);`,
      [serverUrl],
    );
    record('extension configured for the local API (setup)', serverUrl);

    // The background container reads its config once, at init, so reload the
    // extension so it boots against the fixture API.
    await driver.execute('browser.runtime.reload(); return true;').catch(() => {});
    await sleep(3000);
    const liveHandles = await driver.session('GET', '/window/handles');
    await driver.session('POST', '/window', { handle: liveHandles[0] });
    record('extension reloaded against the fixture API (setup)');

    await driver.navigate(`${fixture.origin}/article`);
    await waitFor('content script injection', async () => {
      const injected = await driver.execute(
        "return Boolean(document.getElementById('proso-content-styles'));",
      );
      return injected === true;
    });
    record('content script injected into the fixture article');

    // ---- the public actor path starts here; nothing below dispatches internally ----

    await openExtensionsPanel(driver);
    record('Unified Extensions panel opened by the actor');

    const label = await clickBrowserAction(driver);
    record('browser action clicked by its visible label', label);

    const opened = await waitFor('the Proso popup to open', async () =>
      (await popupOpen(driver)) ? true : null,
    ).catch(() => false);
    if (!opened) blocked('The browser action opened no popup document');
    record('popup opened from the browser action');

    const before = await readPopup(driver);
    for (const required of [NAME.play, NAME.previous]) {
      if (!before.names.includes(required)) {
        blocked(
          `The popup offers no control named "${required}" (found: ${before.names.join(', ') || 'none'})`,
        );
      }
    }
    record('popup exposes the public control names', `${NAME.play}, ${NAME.previous}`);

    await clickByName(driver, NAME.play);
    record('actor pressed the popup control', NAME.play);

    const synthesize = await waitFor(
      'a TTS synthesize request carrying the article text',
      async () =>
        fixture.requests.find((request) =>
          ARTICLE_PARAGRAPHS.some((paragraph) =>
            requestText(request).includes(paragraph.slice(0, 60)),
          ),
        ) ?? null,
      { timeoutMs: 30_000 },
    );
    record(
      'the public click produced a TTS request for the article',
      `${requestText(synthesize).length} chars`,
    );

    const readPage = () => driver.execute(`return (() => {${READ_PAGE}})();`);

    if (PLANT === 'footer') {
      await driver.execute(
        `const f = document.getElementById('proso-sticky-footer');
         if (f) { f.id = 'proso-sticky-footer-planted'; }
         return true;`,
      );
    }

    const playing = await waitFor(
      'the visible reading UI',
      async () => {
        const state = await readPage();
        return state?.footer && state.highlighted.length > 0 ? state : null;
      },
      { timeoutMs: 30_000 },
    );
    if (!playing.bodyPadding) {
      fail('Footer is in the page but reserved no room for itself (body padding unset)');
    }
    record('visible reading UI reached the page', `body padding ${playing.bodyPadding}`);
    record('paragraph highlighted in the page', playing.highlighted[0].slice(0, 60));

    // The popup's own accessible name is public state: while playing, the
    // control must announce itself as Pause.
    await ensurePopupOpen(driver);
    const whilePlaying = await waitFor(
      'the popup control to announce Pause while playing',
      async () => {
        const state = await readPopup(driver);
        return state.open && state.names.includes(NAME.pause) ? state : null;
      },
      { timeoutMs: 15_000 },
    ).catch(() => null);
    if (!whilePlaying) {
      fail(`The popup never announced "${NAME.pause}" while the page was reading`);
    }
    record('popup announced the playing state publicly', `${NAME.pause} / ${whilePlaying.status}`);

    // Pause holds the reading position; finishing or stopping clears it. A
    // highlight both UNCHANGED and still present is what separates "paused"
    // from "playback ended".
    if (PLANT !== 'pause') {
      await clickByName(driver, NAME.pause);
      record('actor pressed the popup control', NAME.pause);
    }
    await sleep(1500);
    const pausedAt = (await readPage()).highlighted[0] ?? null;
    if (!pausedAt) fail('Pausing cleared the reading position instead of holding it');
    for (let i = 0; i < 3; i += 1) {
      await sleep(1200);
      const state = await readPage();
      if (state.highlighted[0] !== pausedAt) {
        fail(
          `Reading kept moving while paused: ${pausedAt.slice(0, 40)} -> ${String(state.highlighted[0]).slice(0, 40)}`,
        );
      }
    }
    record('reading held its position while paused', pausedAt.slice(0, 60));

    if (PLANT !== 'resume') {
      await clickByName(driver, NAME.play);
      record('actor pressed the popup control', NAME.play);
    }
    const resumed = await waitFor(
      'the reading position to advance after resume',
      async () => {
        const state = await readPage();
        return state.highlighted[0] && state.highlighted[0] !== pausedAt ? state : null;
      },
      { timeoutMs: 30_000 },
    );
    record('reading advanced after resume', resumed.highlighted[0].slice(0, 60));

    mkdirSync(artifactDir, { recursive: true });
    const screenshot = await driver.session('GET', '/screenshot');
    const screenshotPath = path.join(artifactDir, 'public-actor-journey.png');
    writeFileSync(screenshotPath, Buffer.from(screenshot, 'base64'));

    writeReceipt({
      verdict: 'PASS',
      binary,
      ttsRequests: fixture.requests.length,
      artifacts: [path.relative(repoRoot, screenshotPath)],
    });
    process.stdout.write(`\npublic-actor-gate PASS at ${head()}\n`);
  } finally {
    await driver.quit();
    await fixture.close();
  }
}

function writeReceipt({ verdict, binary = null, ttsRequests = null, artifacts = [], failure }) {
  mkdirSync(artifactDir, { recursive: true });
  const receipt = {
    receipt: 'public-actor-gate',
    verdict,
    head: head(),
    startedAt: steps[0]?.at ?? null,
    finishedAt: new Date().toISOString(),
    plant: PLANT || null,
    provesFr1: false,
    provesFr1Why:
      'Playback is served by a local API stub. A real account-free read has no audio source on main.',
    internalDispatch: false,
    commands: [
      { command: 'pnpm --filter @proso/extension build:firefox', exitCode: 0, precondition: true },
      { command: 'node scripts/public-actor-gate.mjs', exitCode: verdict === 'PASS' ? 0 : 1 },
    ],
    browser: binary ? { binary, headless: process.env.GATE_HEADED !== '1' } : null,
    ttsRequests,
    actions,
    steps,
    artifacts,
    ...(failure ? { failure } : {}),
  };
  writeFileSync(path.join(artifactDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  const isBlocked = error instanceof Blocked;
  const verdict = isBlocked ? 'BLOCKED' : 'FAIL';
  process.stderr.write(`\npublic-actor-gate ${verdict}: ${error.message}\n`);
  writeReceipt({ verdict, failure: error.message });
  process.exitCode = isBlocked ? 2 : 1;
});
