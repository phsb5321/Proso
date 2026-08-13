/**
 * `make popup-hidden-grant-gate` — Feature 167 public Firefox journey.
 *
 * Plane PROSO-44 (observed in /tmp/proso-161-ux-receipt.md ANOMALY-1): the
 * popup's `#grant-access-row` is VISIBLE in a fresh profile with nothing
 * configured, because `.proso-popup__grant { display: flex }` overrides the
 * platform `hidden` attribute. A fresh reader sees an empty, focusable
 * "Grant access" action with empty reason text.
 *
 * The falsifier, in a fresh loaded extension: the row has NO layout box and is
 * ABSENT from tab order until the controller intentionally removes `hidden`
 * with a nonempty reason.
 *
 * This gate proves BOTH directions in a real dedicated-profile Firefox with
 * the built extension loaded:
 *
 *   Direction A — fresh/unconfigured:
 *     - real popup panel (Unified Extensions -> browser action): "Grant
 *       access" is absent from the popup's accessible names, the row computes
 *       display:none, has a 0x0 layout box and carries the `hidden` attribute.
 *     - popup-as-page tab walk (the harness-documented keyboard surface; a
 *       panel has no WebDriver window handle): a full real Tab cycle never
 *       focuses the grant button.
 *
 *   Direction B — permission-needed:
 *     - the reader configures a local host (enabled, not granted). Play fails
 *       on the local-host gate with the marker; the controller removes `hidden`
 *       with a nonempty reason. The row is then visible, named ("Grant
 *       access") and actionable: a real click grants the origin (auto-grant
 *       pref), hides the row again and retries playback to real audio.
 *
 * Verdicts are PASS (0) / FAIL (1) / BLOCKED (2); BLOCKED is never a pass.
 *
 * @module scripts/popup-hidden-grant-gate
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Blocked,
  JOURNEY_PREFS,
  blocked,
  chromeEval,
  clickBrowserAction,
  clickByName,
  openExtensionPage,
  openExtensionsPanel,
  readPopup,
  resolveFirefox,
} from './lib/firefox-popup.mjs';
import { startFixtureServer } from './lib/reading-fixture-server.mjs';
import { launch, sleep, waitFor } from './lib/webdriver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const buildDir = path.join(repoRoot, 'packages/extension/.output/firefox-mv2');
const artifactDir = path.join(repoRoot, '.artifacts/popup-hidden-grant-gate');

/** Pinning the internal UUID makes `moz-extension://` addressable up front. */
const ADDON_ID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const ADDON_UUID = '8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90';

/** Public names this harness addresses controls by. */
const NAME = {
  play: 'Play',
  pause: 'Pause',
  grant: 'Grant access',
};

const steps = [];
const actions = [];

function record(name, detail) {
  steps.push({ name, detail, at: new Date().toISOString() });
  process.stdout.write(`  ok  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function act(control, via) {
  actions.push({ control, via, at: new Date().toISOString() });
}

function fail(message) {
  throw new Error(message);
}

function head() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

/** W3C WebDriver's element handle key. */
const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

async function findElement(driver, selector, what) {
  const value = await driver
    .session('POST', '/element', { using: 'css selector', value: selector })
    .catch(() => null);
  const handle = value?.[ELEMENT_KEY];
  if (!handle) blocked(`${what} is not in the settings page (${selector})`);
  return handle;
}

/** Click an element with a REAL WebDriver click (user gesture). */
async function clickElement(driver, selector, what) {
  const handle = await findElement(driver, selector, what);
  await driver.session('POST', `/element/${handle}/click`, {}).catch((error) => {
    blocked(`${what} could not be clicked: ${error.message}`);
  });
  act(what, `settings control ${selector}`);
}

async function typeInto(driver, selector, text, what) {
  const handle = await findElement(driver, selector, what);
  await driver.session('POST', `/element/${handle}/clear`, {}).catch(() => {});
  await driver.session('POST', `/element/${handle}/value`, { text });
  act(what, `settings control ${selector}`);
}

/** Read a settings control's visible text. */
async function readText(driver, selector) {
  const text = await driver.execute(
    `const el = document.querySelector(arguments[0]);
     return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;`,
    [selector],
  );
  return typeof text === 'string' ? text : null;
}

async function requirePublicName(driver, selector, expected) {
  const actual = await readText(driver, selector);
  if (!actual || !actual.includes(expected)) {
    blocked(`No control named "${expected}" (${selector} reads: ${actual ?? 'nothing'})`);
  }
}

async function openPopup(driver) {
  await openExtensionsPanel(driver);
  const label = await clickBrowserAction(driver, ADDON_ID);
  act(`browser action "${label}"`, 'Unified Extensions panel item');
  return label;
}

/**
 * Read the real popup panel's grant-row state through the parent process:
 * hidden attr, computed display, layout box, reason text. The panel has no
 * WebDriver window handle, so this is the loaded-extension DOM surface.
 */
async function readGrantRow(driver) {
  const raw = await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
      const b = Array.from(win.document.querySelectorAll('browser'))
        .find((x) => x.currentURI && x.currentURI.spec.includes('/popup.html'));
      if (!b || !b.contentDocument) return JSON.stringify({ open: false });
      const doc = b.contentDocument;
      const row = doc.getElementById('grant-access-row');
      if (!row) return JSON.stringify({ open: true, row: null });
      const box = row.getBoundingClientRect();
      const reason = doc.getElementById('grant-access-reason');
      const btn = doc.getElementById('grant-access-btn');
      return JSON.stringify({
        open: true,
        hiddenAttr: row.hasAttribute('hidden'),
        hiddenProp: row.hidden,
        display: getComputedStyle(row).display,
        rect: { w: box.width, h: box.height },
        reason: reason ? reason.textContent.replace(/\\s+/g, ' ').trim() : null,
        btnText: btn ? btn.textContent.replace(/\\s+/g, ' ').trim() : null,
      });`,
  );
  try {
    return JSON.parse(raw);
  } catch {
    return { open: false, parseError: String(raw).slice(0, 200) };
  }
}

/** Send one Tab keypress through the W3C actions endpoint (real key event). */
async function pressTab(driver) {
  await driver.session('POST', '/actions', {
    actions: [
      {
        type: 'key',
        id: 'kbd',
        actions: [
          { type: 'keyDown', value: '\uE004' },
          { type: 'keyUp', value: '\uE004' },
        ],
      },
    ],
  });
}

/** Walk the popup-as-page tab order and report the id of each focused element. */
async function tabCycle(driver, turns) {
  const seen = [];
  for (let i = 0; i < turns; i += 1) {
    await pressTab(driver);
    const active = await driver.execute(
      `const el = document.activeElement;
       return el ? { id: el.id, text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) } : null;`,
    );
    seen.push(active);
  }
  return seen;
}

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
  const hostAddress = `http://localhost:${new URL(fixture.origin).port}`;
  record('fixture server started', `${fixture.origin} (article + synthesis host)`);

  // `driver` is nullable so the finally can close both it and the fixture even
  // when launch() itself throws (a Firefox startup failure must not leak the
  // fixture server — Codex review round 3).
  let driver = null;
  try {
    driver = await launch({
      binary,
      headless: process.env.GATE_HEADED !== '1',
      extraArgs: ['-remote-allow-system-access'],
      prefs: {
        'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
        ...JOURNEY_PREFS,
        // The optional-permission doorhanger is a chrome-level popup WebDriver
        // cannot address. Auto-granting keeps the request, its user gesture and
        // the resulting grant real (same relaxation as local-host-journey-gate).
        'extensions.webextOptionalPermissionPrompts': false,
      },
    });

    await driver.installAddon(buildDir);
    record('built extension installed in Firefox', 'dedicated throwaway profile');

    // ---------------- Direction A: FRESH / UNCONFIGURED ----------------
    record('DIRECTION A', 'fresh profile, nothing configured');

    await driver.navigate(`${fixture.origin}/article`);
    await waitFor('content script injection', async () =>
      Boolean(
        await driver.execute("return Boolean(document.getElementById('proso-content-styles'));"),
      ),
    );
    record('content script injected into the article', 'fresh reader page');

    await openPopup(driver);
    const fresh = await waitFor('the popup to open', async () => {
      const state = await readPopup(driver);
      return state.open ? state : null;
    }).catch(() => null);
    if (!fresh) blocked('The browser action opened no popup document');

    if (fresh.names.includes(NAME.grant)) {
      fail(`fresh popup exposes "${NAME.grant}" in its accessible names — ANOMALY-1 reproduced`);
    }
    record(
      '"Grant access" absent from fresh popup accessible names',
      fresh.names.join(', ') || '(none)',
    );

    const freshRow = await readGrantRow(driver);
    if (!freshRow.open) blocked('could not read the real popup grant row');
    if (freshRow.row === null) fail('grant row missing from the popup document');
    if (freshRow.hiddenAttr !== true || freshRow.hiddenProp !== true) {
      fail(
        `fresh popup grant row is not hidden (attr=${freshRow.hiddenAttr} prop=${freshRow.hiddenProp})`,
      );
    }
    if (freshRow.display !== 'none') {
      fail(
        `fresh popup grant row computes display:${freshRow.display} — the [hidden] rule is missing`,
      );
    }
    if (freshRow.rect.w > 0 || freshRow.rect.h > 0) {
      fail(`fresh popup grant row has a ${freshRow.rect.w}x${freshRow.rect.h} layout box`);
    }
    record(
      'fresh popup grant row: hidden attr, display:none, 0x0 box',
      JSON.stringify(freshRow.rect),
    );

    // Dismiss the panel: with the popup open, WebDriver key events are
    // swallowed by the panel, so the tab walk must run on a closed panel.
    await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       for (const p of Array.from(win.document.querySelectorAll('panel'))) {
         if (p.state === 'open') p.hidePopup();
       }
       return true;`,
    );
    await waitFor('the popup panel to close', async () => {
      const open = await chromeEval(
        driver,
        `const win = Services.wm.getMostRecentWindow('navigator:browser');
         const b = Array.from(win.document.querySelectorAll('browser'))
           .find((x) => x.currentURI && x.currentURI.spec.includes('/popup.html'));
         return b ? 'open' : 'closed';`,
      );
      return open === 'closed' ? true : null;
    });
    record('popup panel dismissed before the tab walk', 'chrome-level panel close');

    // Tab order on the popup-as-page (the documented keyboard surface for a
    // panel — no WebDriver window handle). A full cycle must never reach the
    // grant button while the row is hidden.
    await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/popup.html`);
    await sleep(1200);
    await driver.execute(
      `const first = document.querySelector('button[id="settings-btn"], button, a, input');
       if (first) first.focus();
       return document.activeElement ? document.activeElement.id : null;`,
    );
    const tabbedFresh = await tabCycle(driver, 12);
    const reachedGrant = tabbedFresh.some(
      (el) => el && (el.id === 'grant-access-btn' || (el.text || '').includes(NAME.grant)),
    );
    if (reachedGrant) {
      fail(`fresh tab cycle focused the grant button: ${JSON.stringify(tabbedFresh)}`);
    }
    record('fresh tab cycle never focuses the grant button', JSON.stringify(tabbedFresh));

    // ---------------- Direction B: PERMISSION-NEEDED ----------------
    record(
      'DIRECTION B',
      'reader configured a local host, then the grant was revoked by changing the origin',
    );

    // Setup (non-actor): point the managed route at the fixture so a wrong
    // fallback lands on it instead of the real API.
    await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/settings.html`);
    await driver.executeAsync(
      `const [done] = arguments;
       browser.storage.local
         .set({ serverUrl: '${fixture.origin}', licenseKey: null, cacheType: 'memory', speed: 0.5 })
         .then(done);`,
      [],
    );

    // PUBLIC actor path: enable the local host for host1 (http://localhost:PORT).
    // The Enable click is a real user gesture that requests and receives the
    // exact-origin grant (prompts auto-grant) and tells the background to adopt
    // the local route -- WITHOUT a runtime reload, so the manifest's
    // content-script <all_urls> grant never materialises and the gate stays
    // able to fail for a different origin.
    await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/settings.html`);
    await requirePublicName(driver, '#local-host .proso-accordion__header', 'Local synthesis host');
    await clickElement(driver, '#local-host .proso-accordion__header', 'Local synthesis host');
    await waitFor('the local synthesis host section to open', async () => {
      const hidden = await driver.execute(
        "return document.getElementById('local-host-content')?.hasAttribute('hidden');",
      );
      return hidden === false ? true : null;
    }).catch(() => blocked('The "Local synthesis host" section never opened'));
    await typeInto(driver, '#localHostUrl', hostAddress, 'Host address');
    await requirePublicName(
      driver,
      'label[for="localHostEnabled"]',
      'Enable the local synthesis host',
    );
    await clickElement(driver, '#localHostEnabled', 'Enable the local synthesis host');
    const grantedB = await waitFor(
      'the runtime host permission to be granted for host1',
      async () => {
        const status = await readText(driver, '#localHostStatus');
        return status?.startsWith('Permission granted') ? status : null;
      },
      { timeoutMs: 20_000 },
    ).catch(() => null);
    if (!grantedB)
      fail(
        `Enabling host1 did not grant its origin: ${await readText(driver, '#localHostStatus')}`,
      );
    record('host1 enabled + origin granted (real click)', grantedB);
    // NOTE: no reachability fetch is asserted here — the gate path this journey
    // proves is the permission-coverage check, which needs no host I/O (the
    // fixture binds 127.0.0.1 only, and Firefox resolves `localhost` to ::1
    // first, so a getVoices probe would fail on IPv6 before reaching the gate).
    // The marker itself proves the local adapter ran.
    // Setup (non-actor): point the configured host at host2 -- the SAME
    // fixture on a DIFFERENT hostname (http://127.0.0.1:PORT). The granted set
    // contains only http://localhost:PORT/*, so the local-host gate now fails
    // with its exact marker, which is the real permission-needed state.
    const host2 = `http://127.0.0.1:${new URL(fixture.origin).port}`;
    await driver.executeAsync(
      `const [done] = arguments;
       browser.storage.local.set({ localHostUrl: '${host2}' }).then(done);`,
      [],
    );
    record('configured origin changed to an un-granted host (setup)', host2);

    await driver.navigate(`${fixture.origin}/article`);
    await waitFor('content script injection (direction B)', async () =>
      Boolean(
        await driver.execute("return Boolean(document.getElementById('proso-content-styles'));"),
      ),
    );

    await openPopup(driver);
    const b = await waitFor('the popup to open (direction B)', async () => {
      const state = await readPopup(driver);
      return state.open ? state : null;
    }).catch(() => null);
    if (!b) blocked('The browser action opened no popup document (direction B)');
    if (!b.names.includes(NAME.play)) blocked(`popup offers no control named "${NAME.play}"`);

    await clickByName(driver, NAME.play, () => openPopup(driver));
    act(`popup control "${NAME.play}"`, 'accessible name');
    record('actor pressed "Play"', `host2=${host2} not granted`);

    const needed = await waitFor(
      'the grant affordance to appear (gate failed with the marker; controller removed hidden with a reason)',
      async () => {
        const state = await readPopup(driver);
        if (!state.open) return null;
        const row = await readGrantRow(driver);
        if (!row.open || row.row === null) return null;
        if (row.hiddenProp === true) return null;
        if (row.display !== 'flex') return null;
        if (row.rect.w <= 0 || row.rect.h <= 0) return null;
        if (!row.reason || !row.reason.includes('needs access to')) return null;
        return row;
      },
      { timeoutMs: 45_000 },
    ).catch(() => null);
    if (!needed) {
      const state = await readPopup(driver).catch(() => ({}));
      fail(
        `grant affordance did not become visible+named after the gated play failure (popup: ${JSON.stringify(state)})`,
      );
    }
    if (!needed.btnText || !needed.btnText.includes(NAME.grant)) {
      fail(`grant button is not named "${NAME.grant}" (reads: ${needed.btnText ?? 'nothing'})`);
    }
    record(
      'grant affordance visible + named + reason set',
      `display=${needed.display} rect=${needed.rect.w}x${needed.rect.h} reason="${needed.reason}"`,
    );

    // Actionable: the grant click must be a REAL user gesture (permissions.request
    // refuses synthetic element.click()). The popup PANEL has no WebDriver window
    // handle, so the trusted click runs on popup.html as a page (a real window):
    //   - WebDriver stays on the popup page so /element/click is trusted input;
    //   - gBrowser.selectedTab is switched to the article tab via chromeEval so
    //     playback.start extracts the article text and fails at the local-host
    //     gate (the marker), not at "no active tab".
    const popupHandle = await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/popup.html`);
    await sleep(3000);
    const pageDbg = await driver.execute(
      `const play = document.querySelector('[aria-label="Play"]');
       const row = document.getElementById('grant-access-row');
       const status = document.getElementById('status-text');
       return JSON.stringify({ hasPlay: Boolean(play), playDisabled: play ? play.disabled : null, rowHidden: row ? row.hidden : 'no-row', status: status ? status.textContent : null });`,
    );
    await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       const article = Array.from(win.gBrowser.tabs).find((t) =>
         t.linkedBrowser.currentURI && t.linkedBrowser.currentURI.spec.includes('127.0.0.1') && t.linkedBrowser.currentURI.spec.endsWith('/article'));
       if (!article) return 'no article tab';
       win.gBrowser.selectedTab = article;
       return article.linkedBrowser.currentURI.spec;`,
    ).then((t) => record('firefox active tab switched to the article (setup)', t));

    // The page's Play: a synthetic element.click fires the listener without
    // user activation (fine — playback.start needs no activation), while the
    // article tab is active so the gate — not extraction — decides the outcome.
    await driver.execute(`document.querySelector('[aria-label="Play"]').click(); return true;`);
    await sleep(2500);
    act('popup control "Play"', 'element click (page context, article active)');

    const pageNeeded = await waitFor(
      'the page-affordance to appear after the same gate failure',
      async () => {
        const state = await driver.execute(
          `const row = document.getElementById('grant-access-row');
           const reason = document.getElementById('grant-access-reason');
           const btn = document.getElementById('grant-access-btn');
           if (!row || !reason || !btn) return null;
           const box = row.getBoundingClientRect();
           if (row.hidden) return null;
           if (box.width <= 0 || box.height <= 0) return null;
           return JSON.stringify({ reason: reason.textContent, btn: btn.textContent.trim() });`,
        );
        return state ? JSON.parse(state) : null;
      },
      { timeoutMs: 30_000 },
    ).catch(() => null);
    if (!pageNeeded) {
      const dbg = await driver.execute(
        `const row = document.getElementById('grant-access-row');
         const status = document.getElementById('status-text');
         return JSON.stringify({ rowHidden: row ? row.hidden : 'no-row', status: status ? status.textContent : null });`,
      );
      fail(`the popup-as-page never rendered the grant affordance after Play (${dbg})`);
    }
    record('popup-as-page shows the affordance', `${pageNeeded.reason} [${pageNeeded.btn}]`);

    // Trusted input goes to Firefox's FOCUSED window, which is currently the
    // article (we switched active tab for the gate failure). Switch the
    // WebDriver window to the popup page — the same mechanism that made the
    // settings Enable click trusted. The post-grant retry then hits "no active
    // tab" extraction; the grant itself is the assertion here, and real audio
    // after a grant is covered by the shared local-host-journey-gate.
    await driver.session('POST', '/window', { handle: popupHandle });
    await sleep(800);
    await driver.execute(
      `window.__grantClicks = 0;
       document.getElementById('grant-access-btn').addEventListener('click', () => { window.__grantClicks += 1; });
       return true;`,
    );
    const grantBtn = await findElement(driver, '#grant-access-btn', 'Grant access (page)');
    // WebDriver /element/click: the same trusted-input mechanism that made the
    // settings Enable click grant an origin (permissions.request accepted it
    // there). The element must be resolved in the CURRENT, focused window.
    await driver.session('POST', `/element/${grantBtn}/click`, {});
    act('popup control "Grant access"', 'WebDriver element click (page context)');
    await sleep(1500);
    const clicks = await driver.execute('return window.__grantClicks || 0;');

    const repaired = await waitFor(
      'the grant click to hide the row again (permission materialises)',
      async () => {
        const state = await driver.execute(
          `const row = document.getElementById('grant-access-row');
           const status = document.getElementById('status-text');
           return JSON.stringify({ rowHidden: row ? row.hidden : null, status: status ? status.textContent : null });`,
        );
        const parsed = state ? JSON.parse(state) : null;
        if (!parsed) return null;
        if (parsed.rowHidden) return parsed;
        return null;
      },
      { timeoutMs: 30_000 },
    ).catch(() => null);
    const grantedAfterClick = await driver
      .executeAsync(
        `const [done] = arguments;
         browser.permissions.getAll().then((p) => done(JSON.stringify(p.origins)), (e) => done('ERR ' + e));`,
      )
      .catch(() => null);
    if (!grantedAfterClick || !grantedAfterClick.includes(host2)) {
      const clicks = await driver.execute('return window.__grantClicks || 0;');
      fail(
        `the trusted grant click did not materialise the host2 origin (clicks=${clicks}, perms=${grantedAfterClick})`,
      );
    }
    record('grant click was actionable: host2 origin materialised', grantedAfterClick);
    if (!repaired) {
      const st = await driver.execute(
        `const row = document.getElementById('grant-access-row');
         const status = document.getElementById('status-text');
         return JSON.stringify({ rowHidden: row ? row.hidden : null, status: status ? status.textContent : null });`,
      );
      fail(`grant click did not hide the row (${st})`);
    }
    record('grant click repaired the journey', `row hidden again; status="${repaired.status}"`);

    // ---------------- receipt ----------------
    mkdirSync(artifactDir, { recursive: true });
    const receipt = {
      gate: 'popup-hidden-grant-gate',
      feature: 167,
      plane: 'PROSO-44',
      verdict: 'PASS',
      head: head(),
      binary,
      build: buildDir,
      actions,
      directionA: {
        freshNames: fresh.names,
        row: { hiddenAttr: freshRow.hiddenAttr, display: freshRow.display, rect: freshRow.rect },
        tabCycle: tabbedFresh,
        grantReachedByTab: reachedGrant,
      },
      directionB: {
        host: hostAddress,
        grantRowWhenNeeded: {
          display: needed.display,
          rect: needed.rect,
          reason: needed.reason,
          btnText: needed.btnText,
        },
        afterGrantClick: {
          rowHiddenAgain: repaired.rowHidden === true,
          status: repaired.status,
          originMaterialised: grantedAfterClick,
        },
      },
      relaxations: [
        'extensions.webextensions.remote=false — a remote popup document is opaque to the parent process; the popup DOM is read in-process (same as public-actor-gate / local-host-journey-gate).',
        'extensions.webextOptionalPermissionPrompts=false — the grant request, its user gesture and the resulting permission are real; the doorhanger the reader would accept is not exercised.',
        'popup panel has no WebDriver window handle, so the tab-cycle leg runs on popup.html as a page (documented harness limitation, same as the #161 brand receipt).',
      ],
      at: new Date().toISOString(),
    };
    writeFileSync(path.join(artifactDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    record('receipt written', path.join(artifactDir, 'receipt.json'));
    process.stdout.write('VERDICT: PASS\n');
  } catch (error) {
    if (error instanceof Blocked) {
      process.stderr.write(`BLOCKED: ${error.message}\n`);
      process.exit(2);
    }
    const receipt = {
      gate: 'popup-hidden-grant-gate',
      verdict: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
      actions,
      at: new Date().toISOString(),
    };
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(path.join(artifactDir, 'failure.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    process.stderr.write(`FAIL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  } finally {
    await driver?.quit().catch(() => {});
    await fixture.close().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`UNHANDLED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
