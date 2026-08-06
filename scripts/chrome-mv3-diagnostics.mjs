// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * `make chrome-mv3-diagnostics` — retained Chrome MV3 reading-journey diagnostic
 * (Feature 106).
 *
 * Reproduces the two known Chrome MV3 failures from the reading-journey ledger
 * as deterministic, committed assertions instead of a one-off Docker run:
 *
 *   (a) the popup/start message Promise response is lost (popup stuck on
 *       `Loading...`), and
 *   (b) `Audio` is undefined in the MV3 worker context.
 *
 * The diagnostic runs two legs:
 *
 *   - Chrome MV3 (Playwright Chromium, `--headless=new` with `--load-extension`;
 *     branded Google Chrome rejects the extension flags, so the Playwright-
 *     bundled Chromium or CHROMIUM_BIN is used):
 *     asserts the worker audio context, the real popup start journey against a
 *     local fixture article + local Proso API stub (a TTS request must actually
 *     be observed leaving the extension), and a popup→background message
 *     roundtrip. Red on current `main` (worker `Audio` undefined; the journey
 *     dies at the first `new Audio()`).
 *   - Firefox MV2 (raw geckodriver harness): the same assertions must stay
 *     green — non-regression proven by assertion, not by absence. The Firefox
 *     leg cannot address the real browser-action popup panel (WebDriver exposes
 *     no window handle for it — see docs/agent-delivery-harness.md), so it
 *     drives the shipped `popup.html` as a background tab; the Play click is
 *     executed on that page's content window from chrome context while the
 *     fixture article stays the active tab, which preserves the production
 *     active-tab semantics `playback.start` relies on.
 *
 * Exit codes: 0 = every check passed on every requested leg, 1 = any check
 * failed. A missing browser or build is a loud failure, never a skip.
 *
 * @module scripts/chrome-mv3-diagnostics
 */

import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startFixtureServer } from './lib/reading-fixture-server.mjs';
import { launch as launchFirefox, sleep, waitFor } from './lib/webdriver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const extPkg = path.join(repoRoot, 'packages/extension');
const chromeBuildDir = path.join(extPkg, '.output/chrome-mv3');
const firefoxBuildDir = path.join(extPkg, '.output/firefox-mv2');

// Playwright is a devDependency of the extension package; resolve through it so
// the root script needs no new dependency.
const requireExt = createRequire(path.join(extPkg, 'package.json'));
const { chromium } = requireExt('@playwright/test');

/** Pinning the internal UUID makes `moz-extension://` addressable up front. */
const ADDON_ID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const ADDON_UUID = '8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90';

const STATUS_LOADING = 'Loading...';
const PLAYING_STATUSES = new Set(['Playing', 'Paused']);

const JOURNEY_LOADING_LEAVE_MS = 10_000;
const JOURNEY_PLAYING_MS = 30_000;
const ROUNDTRIP_MS = 5_000;

const checks = [];

function record(name, detail = '', ok = true) {
  checks.push({ name, detail, ok });
  process.stdout.write(`  ${ok ? 'ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function fail(message) {
  throw new Error(message);
}

function which(name) {
  try {
    return execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * 64-bit shared libraries the Playwright-bundled Chromium needs on NixOS, as
 * [store-name-substring, lib file] pairs. The nix store keeps 32-bit and 64-bit
 * builds of the same package side by side, so the resolver picks an ELF64 file
 * explicitly rather than trusting the first store hit.
 */
const REQUIRED_CHROMIUM_LIBS = [
  ['glib', 'libglib-2.0.so.0'],
  ['at-spi2-core', 'libatk-1.0.so.0'],
  ['cups', 'libcups.so.2'],
  ['dbus', 'libdbus-1.so.3'],
  ['expat', 'libexpat.so.1'],
  ['mesa-libgbm', 'libgbm.so.1'],
  ['nspr', 'libnspr4.so'],
  ['nss', 'libnss3.so'],
  ['systemd-minimal', 'libudev.so.1'],
  ['libxcb', 'libxcb.so.1'],
  ['libxcomposite', 'libXcomposite.so.1'],
  ['libxdamage', 'libXdamage.so.1'],
  ['libxext', 'libXext.so.6'],
  ['libxfixes', 'libXfixes.so.3'],
  ['libxkbcommon', 'libxkbcommon.so.0'],
  ['libxrandr', 'libXrandr.so.2'],
  ['alsa-lib', 'libasound.so.2'],
  ['cairo', 'libcairo.so.2'],
  ['pango', 'libpango-1.0.so.0'],
  ['libx11', 'libX11.so.6'],
];

/** True when `p` is an ELF64 shared object (first 20 bytes of the header). */
function isElf64(p) {
  try {
    const fd = openSync(p, 'r');
    const buf = Buffer.alloc(20);
    readSync(fd, buf, 0, 20, 0);
    closeSync(fd);
    return (
      buf[0] === 0x7f &&
      buf[1] === 0x45 &&
      buf[2] === 0x4c &&
      buf[3] === 0x46 &&
      buf[4] === 2
    );
  } catch {
    return false;
  }
}

/**
 * An `LD_LIBRARY_PATH` covering the bundled Chromium's NixOS dependencies, or
 * '' when /nix/store is absent. Machine-adaptive: resolves each library from
 * whatever 64-bit store build exists locally instead of pinning store hashes.
 */
function nixStoreLibraryPath() {
  const store = '/nix/store';
  if (!existsSync(store)) return '';
  const entries = readdirSync(store).filter(
    (e) => !e.endsWith('.drv') && !e.includes('-dev'),
  );
  const dirs = [];
  for (const [name, lib] of REQUIRED_CHROMIUM_LIBS) {
    const entry = entries.find(
      (e) =>
        e.includes(`-${name}-`) &&
        existsSync(path.join(store, e, 'lib', lib)) &&
        isElf64(path.join(store, e, 'lib', lib)),
    );
    if (entry) dirs.push(path.join(store, entry, 'lib'));
  }
  return dirs.join(':');
}

/**
 * A Chromium binary that honors --load-extension. Branded Google Chrome 137+
 * ignores it ("--disable-extensions-except is not allowed in Google Chrome"),
 * so the Playwright-bundled Chromium (or CHROMIUM_BIN) is required.
 */
function resolveChromium() {
  const explicit = process.env.CHROMIUM_BIN;
  if (explicit) {
    if (!existsSync(explicit)) fail(`CHROMIUM_BIN does not exist: ${explicit}`);
    return explicit;
  }
  const cacheRoot = path.join(os.homedir(), '.cache/ms-playwright');
  if (existsSync(cacheRoot)) {
    const candidates = readdirSync(cacheRoot)
      .filter((d) => d.startsWith('chromium-'))
      .map((d) => path.join(cacheRoot, d, 'chrome-linux64/chrome'))
      .filter(existsSync)
      .sort();
    if (candidates.length > 0) return candidates[candidates.length - 1];
  }
  fail(
    'No Chromium that allows --load-extension. Branded Google Chrome 137+ rejects ' +
      '--load-extension, so it cannot host this diagnostic. Install the Playwright ' +
      'Chromium (pnpm --filter @proso/extension exec playwright install chromium) or ' +
      'set CHROMIUM_BIN to a Chromium / Chrome-for-Testing binary.',
  );
}

/** Launch the extension context on `profile`, retrying once with nix-store libs on NixOS. */
async function launchChromeContext(profileDir, executablePath, ext) {
  const options = {
    headless: false,
    executablePath,
    args: [
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ],
  };
  try {
    return await chromium.launchPersistentContext(profileDir, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('error while loading shared libraries')) throw error;
    const libs = nixStoreLibraryPath();
    if (!libs) throw error;
    process.env.LD_LIBRARY_PATH = libs;
    record('nix-store LD_LIBRARY_PATH derived', libs.split(':').length + ' lib dirs');
    return await chromium.launchPersistentContext(profileDir, options);
  }
}


/** Ask the fixture server what it saw; requests are appended by the stub. */
function ttsRequestCount(fixture) {
  return fixture.requests.filter((r) => r.body && typeof r.body.text === 'string').length;
}

/**
 * Poll a popup status getter until the status leaves `Loading...`.
 * Returns { ok, text } — never throws.
 */
async function waitToLeaveLoading(readStatus, timeoutMs) {
  return waitFor(
    'popup status to leave Loading...',
    async () => {
      const text = await readStatus();
      return text !== STATUS_LOADING ? text : null;
    },
    { timeoutMs, intervalMs: 250 },
  ).then(
    (text) => ({ ok: true, text }),
    (error) => ({ ok: false, text: error instanceof Error ? error.message : String(error) }),
  );
}

/**
 * Poll a popup status getter until the status reaches Playing/Paused.
 * Returns { ok, text } — never throws.
 */
async function waitForPlaying(readStatus, timeoutMs) {
  return waitFor(
    'popup status to reach Playing/Paused',
    async () => {
      const text = await readStatus();
      return PLAYING_STATUSES.has(text) ? text : null;
    },
    { timeoutMs, intervalMs: 250 },
  ).then(
    (text) => ({ ok: true, text }),
    (error) => ({ ok: false, text: error instanceof Error ? error.message : String(error) }),
  );
}

// ---------------------------------------------------------------------------
// Chrome MV3 leg
// ---------------------------------------------------------------------------

/**
 * The extension's service worker `Audio` context (FR-001b / FR-002b).
 *
 * Red when `Audio` is undefined in the MV3 worker — the playback path
 * (`PlaybackService.attachAndPlay`) constructs `new Audio()` directly in the
 * background, so an undefined `Audio` kills the journey at first playback.
 * Green when a working `Audio` is present (native in an event page, or a
 * worker-safe shim once the chosen fix lands). The offscreen-document probe is
 * reported as context for the architecture decision, not gated: the shipped
 * `offscreen.html` + protocol exist but nothing wires them today.
 */
async function checkWorkerAudioContext(sw) {
  const audioType = await sw.evaluate(() => typeof Audio);
  let offscreenContext = 'probe skipped';
  try {
    offscreenContext = await sw.evaluate(async () => {
      const out = {
        offscreenApi: typeof globalThis.chrome?.offscreen,
        getContexts: typeof globalThis.chrome?.runtime?.getContexts,
      };
      if (
        typeof globalThis.chrome?.offscreen !== 'undefined' &&
        typeof globalThis.chrome?.runtime?.getContexts === 'function'
      ) {
        const before = await globalThis.chrome.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT'],
        });
        out.existingOffscreen = before.length;
        if (before.length === 0) {
          try {
            await globalThis.chrome.offscreen.createDocument({
              url: 'offscreen.html',
              reasons: ['AUDIO_PLAYBACK'],
              justification: 'Proso MV3 diagnostics',
            });
            out.created = true;
          } catch (error) {
            out.createError = error instanceof Error ? error.message : String(error);
          }
          const after = await globalThis.chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
          });
          out.offscreenAfterCreate = after.length;
        }
      }
      return out;
    });
  } catch (error) {
    offscreenContext = `probe failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (audioType === 'undefined') {
    record(
      'C1 worker audio context',
      `typeof Audio === 'undefined' in MV3 worker; offscreen probe: ${JSON.stringify(offscreenContext)}`,
      false,
    );
  } else {
    record('C1 worker audio context', `typeof Audio === '${audioType}' in MV3 worker`);
  }
}

/**
 * The popup start journey (FR-001a / FR-002 / FR-004), Chrome edition.
 *
 * Real popup page, real Play button, real `playback.start` handler, real
 * extractor, real server-TTS adapter — the only doubles are outside the
 * extension (fixture article + fixture Proso API stub on 127.0.0.1). Red when
 * the response is lost (status stuck on `Loading...`), when the journey never
 * reaches a playing/paused state, when no TTS request left the extension, or
 * when the reading footer never appeared on the article page.
 */
async function checkChromeStartJourney(extId, fixture, article, popup) {
  const sub = [];

  const status = () =>
    popup.evaluate(() => document.getElementById('status-text')?.textContent ?? null);

  const initial = await status();
  sub.push(`initial status '${initial}'`);

  await popup.click('#play-pause-btn');

  // (a) The response must not be lost: the status has to leave the transient
  // `Loading...` state. A popup still on `Loading...` after the deadline is the
  // ledger's stuck-popup failure mode, red by assertion.
  const leftLoading = await waitToLeaveLoading(status, JOURNEY_LOADING_LEAVE_MS);
  sub.push(`left Loading...: ${leftLoading.ok ? `'${leftLoading.text}'` : leftLoading.text}`);

  // (b) The journey must reach a playing/paused state.
  const playing = await waitForPlaying(status, JOURNEY_PLAYING_MS);
  sub.push(`reached playing: ${playing.ok ? `'${playing.text}'` : playing.text}`);

  // The TTS request must actually have left the extension (FR-004 — the
  // existing Chromium E2E can pass without one; this gate cannot).
  const requests = ttsRequestCount(fixture);
  sub.push(`TTS requests observed by fixture stub: ${requests}`);

  // The reading footer must be visible on the article page.
  const footerVisible = await article.evaluate(
    () => !!document.getElementById('proso-sticky-footer'),
  );
  sub.push(`footer on article: ${footerVisible ? 'visible' : 'missing'}`);

  const passed = leftLoading.ok && playing.ok && requests >= 1 && footerVisible;
  record(
    'C2 popup start journey',
    passed ? `all four sub-assertions passed (${sub.join('; ')})` : sub.join('; '),
    passed,
  );
}

/**
 * Popup→background message roundtrip (FR-001a guard).
 *
 * The direct assertion that a runtime message sent from the popup receives its
 * Promise response. Red when the response is lost — independent of the journey,
 * so a messaging regression cannot hide behind an audio failure.
 */
async function checkChromeRoundtrip(popup) {
  const result = await popup.evaluate(
    (timeoutMs) =>
      new Promise((resolve) => {
        const timer = setTimeout(
          () => resolve({ arrived: false, reason: 'timeout' }),
          timeoutMs,
        );
        globalThis.chrome.runtime.sendMessage({ type: 'playback.getState' }).then(
          (response) => {
            clearTimeout(timer);
            resolve({ arrived: true, response: response ?? null });
          },
          (error) => {
            clearTimeout(timer);
            resolve({
              arrived: false,
              reason: error instanceof Error ? error.message : String(error),
            });
          },
        );
      }),
    ROUNDTRIP_MS,
  );
  record(
    'C3 popup roundtrip',
    result.arrived
      ? `playback.getState answered ${JSON.stringify(result.response ?? null).slice(0, 120)}`
      : `response lost: ${result.reason}`,
    result.arrived,
  );
}

async function chromeLeg(fixture) {
  if (!existsSync(path.join(chromeBuildDir, 'manifest.json'))) {
    fail(
      `Missing Chrome build at ${chromeBuildDir}. Run: pnpm --filter @proso/extension build:chrome`,
    );
  }

  record('chrome-mv3 build present', chromeBuildDir);
  const executablePath = resolveChromium();
  record('chromium binary', executablePath);

  // The extension captures its API base URL at container init, and
  // `chrome.runtime.reload()` leaves the extension unregistered in headless
  // Chromium, so the fixture API is configured in a first launch (storage
  // persists in the profile) and the extension boots against it in a second
  // launch on the same profile.
  const profile = mkdtempSync(path.join(os.tmpdir(), 'proso-mv3-diagnostics-'));
  try {
    let context = await launchChromeContext(profile, executablePath, chromeBuildDir);
    try {
      const sw = await waitFor(
        'extension service worker (phase 1)',
        () => context.serviceWorkers()[0] ?? null,
        { timeoutMs: 30_000 },
      );
      const extId = sw.url().split('/')[2];
      const settings = await context.newPage();
      await settings.goto(`chrome-extension://${extId}/settings.html`);
      await settings.evaluate(
        (origin) =>
          globalThis.browser.storage.local.set({
            serverUrl: origin,
            provider: 'openai',
            licenseKey: null,
            cacheType: 'memory',
            speed: 1,
            telemetryEnabled: false,
          }),
        fixture.origin,
      );
      const written = await sw.evaluate(
        () =>
          new Promise((resolve) =>
            globalThis.chrome.storage.local.get('serverUrl', (v) =>
              resolve(v.serverUrl ?? null),
            ),
          ),
      );
      record('fixture API configured in profile', `${fixture.origin} (read back: ${written})`);
      // Let chrome.storage.local's LevelDB write actually flush to the profile
      // before the browser process is torn down; closing immediately after the
      // set() promise resolves can drop the write (observed as phase-2 null).
      await sleep(1500);
    } finally {
      await context.close();
    }

    context = await launchChromeContext(profile, executablePath, chromeBuildDir);
    try {
      const sw = await waitFor(
        'extension service worker',
        () => context.serviceWorkers()[0] ?? null,
        { timeoutMs: 30_000 },
      );
      const extId = sw.url().split('/')[2];
      record('extension service worker', sw.url());

      const bootUrl = await waitFor(
        'extension booted against fixture API',
        async () => {
          const url = await sw.evaluate(
            () =>
              new Promise((resolve) =>
                globalThis.chrome.storage.local.get('serverUrl', (v) =>
                  resolve(v.serverUrl ?? null),
                ),
              ),
          );
          return url === fixture.origin ? url : null;
        },
        { timeoutMs: 10_000, intervalMs: 500 },
      );
      record('extension booted against fixture API', bootUrl);

      await checkWorkerAudioContext(sw);

      // Fixture article tab — the active tab the real popup start extracts from.
      // The popup page is created first and the article is brought to front
      // afterwards, because newPage() makes the newest tab active.
      const article = await context.newPage();
      await article.goto(`${fixture.origin}/article`);
      await article.waitForLoadState('domcontentloaded');
      await sleep(750); // manifest content-script injection settle

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extId}/popup.html`);
      await article.bringToFront();
      await checkChromeRoundtrip(popup);
      await checkChromeStartJourney(extId, fixture, article, popup);
      await popup.close();
      await article.close();
    } finally {
      await context.close();
    }
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Firefox MV2 leg
// ---------------------------------------------------------------------------

/**
 * Open an extension page as a tab and return its window handle (geckodriver
 * exposes each tab as a window handle). The popup's Play click needs the
 * fixture article to stay the ACTIVE tab — the tab `playback.start` extracts
 * from — so the popup page is driven through webdriver (whose current handle
 * is independent of the selected tab) while the selected tab is pinned to the
 * article from chrome context before the click.
 */
async function openExtensionTab(driver, url) {
  const before = await driver.session('GET', '/window/handles');
  await driver.session('POST', '/moz/context', { context: 'chrome' });
  try {
    await driver.execute(
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       win.gBrowser.addTab(arguments[0], {
         triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
       });
       return true;`,
      [url],
    );
  } finally {
    await driver.session('POST', '/moz/context', { context: 'content' });
  }
  const handle = await waitFor('the extension page tab', async () => {
    const handles = await driver.session('GET', '/window/handles');
    return handles.find((h) => !before.includes(h)) ?? null;
  });
  await driver.session('POST', '/window', { handle });
  return handle;
}

async function firefoxLeg(fixture) {
  if (!existsSync(path.join(firefoxBuildDir, 'manifest.json'))) {
    fail(
      `Missing Firefox build at ${firefoxBuildDir}. Run: pnpm --filter @proso/extension build:firefox`,
    );
  }
  const binary = process.env.FIREFOX_BIN || which('firefox') || which('firefox-nightly');
  if (!binary) {
    fail('No Firefox found on PATH. Set FIREFOX_BIN to a Firefox executable.');
  }

  record('firefox-mv2 build present', firefoxBuildDir);
  const driver = await launchFirefox({
    binary,
    headless: process.env.SMOKE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      'media.autoplay.default': 0,
      'media.autoplay.blocking_policy': 0,
      'media.volume_scale': '0.0',
      'browser.shell.checkDefaultBrowser': false,
      'datareporting.policy.dataSubmissionEnabled': false,
      'extensions.autoDisableScopes': 0,
    },
  });

  try {
    await driver.installAddon(firefoxBuildDir);
    record('built extension installed in Firefox');
    const initialHandle = (await driver.session('GET', '/window/handles'))[0];

    // Configure the fixture API, then reboot the extension (the API base URL
    // is captured at background init; reload is fire-and-forget because it
    // kills the page mid-execute).
    const settingsHandle = await openExtensionTab(
      driver,
      `moz-extension://${ADDON_UUID}/settings.html`,
    );
    await waitFor(
      'settings page ready',
      async () => {
        const state = await driver
          .execute(
            `return { ready: document.readyState, hasBrowser: typeof browser };`,
          )
          .catch(() => null);
        return state && state.ready === 'complete' && state.hasBrowser === 'object';
      },
      { timeoutMs: 20_000 },
    );
    const configureResult = await driver.executeAsync(
      `const [origin, done] = arguments;
       browser.storage.local
         .set({
           serverUrl: origin,
           provider: 'openai',
           licenseKey: null,
           cacheType: 'memory',
           speed: 1,
           telemetryEnabled: false,
         })
         .then(() => done('ok'))
         .catch((error) => done('err: ' + String(error)));`,
      [fixture.origin],
    );
    if (configureResult !== 'ok') {
      fail(`Could not configure fixture API: ${configureResult}`);
    }
    await driver.execute('browser.runtime.reload(); return true;').catch(() => {});
    record('extension reloaded against fixture API', fixture.origin);
    await sleep(1500);

    // The settings tab's browsing context was discarded by the reload; the
    // fixture article lives in the initial tab instead.
    await driver.session('POST', '/window', { handle: initialHandle });
    await driver.navigate(`${fixture.origin}/article`);
    await sleep(1000);
    const articleUrl = `${fixture.origin}/article`;

    // Shipped popup page in its own tab.
    const popupHandle = await openExtensionTab(
      driver,
      `moz-extension://${ADDON_UUID}/popup.html`,
    );
    await waitFor(
      'popup page ready',
      async () => {
        const state = await driver
          .execute(
            `return {
               ready: document.readyState,
               btn: !!document.getElementById('play-pause-btn'),
             };`,
          )
          .catch(() => null);
        return state && state.ready === 'complete' && state.btn;
      },
      { timeoutMs: 20_000 },
    );
    record('popup page loaded');

    // C1 — the playback context must expose a working Audio (Firefox MV2 event
    // page has DOM; the background page is the context PlaybackService runs in).
    const backgroundAudio = await driver.executeAsync(
      `const [done] = arguments;
       browser.runtime.getBackgroundPage().then((bg) =>
         done(bg ? typeof bg.Audio : 'no background page'));`,
    );
    record(
      'C1 background audio context',
      `typeof Audio === '${backgroundAudio}' in Firefox background page`,
      backgroundAudio === 'function',
    );

    // C3 — popup→background message roundtrip must answer.
    const roundtrip = await driver.executeAsync(
      `const [done] = arguments;
       const timer = setTimeout(
         () => done({ arrived: false, reason: 'timeout' }),
         ${ROUNDTRIP_MS},
       );
       browser.runtime.sendMessage({ type: 'playback.getState' }).then(
         (response) => { clearTimeout(timer); done({ arrived: true, response }); },
         (error) => {
           clearTimeout(timer);
           done({
             arrived: false,
             reason: error instanceof Error ? error.message : String(error),
           });
         },
       );`,
    );
    record(
      'C3 popup roundtrip',
      roundtrip.arrived
        ? `playback.getState answered ${JSON.stringify(roundtrip.response ?? null).slice(0, 120)}`
        : `response lost: ${roundtrip.reason}`,
      roundtrip.arrived,
    );

    // C2 — the popup start journey. The webdriver current handle stays on the
    // popup page, while the fixture article is pinned as the selected (active)
    // tab from chrome context — the active-tab arrangement the real popup
    // panel has — then the real Play button is clicked.
    await driver.session('POST', '/moz/context', { context: 'chrome' });
    try {
      await driver.execute(
        `const win = Services.wm.getMostRecentWindow('navigator:browser');
         const articleTab = win.gBrowser.tabs.find((t) =>
           t.linkedBrowser && t.linkedBrowser.currentURI.spec.startsWith(arguments[0]));
         if (!articleTab) return 'article tab not found';
         win.gBrowser.selectedTab = articleTab;
         return 'ok';`,
        [articleUrl],
      );
    } finally {
      await driver.session('POST', '/moz/context', { context: 'content' });
    }

    const clickOutcome = await driver.execute(
      `(() => {
         const btn = document.getElementById('play-pause-btn');
         if (!btn) return { clicked: false, status: null };
         btn.click();
         return {
           clicked: true,
           status: document.getElementById('status-text')?.textContent ?? null,
         };
       })();`,
    );
    if (clickOutcome && clickOutcome.clicked === false) {
      fail(`Could not click popup Play: ${JSON.stringify(clickOutcome)}`);
    }
    // geckodriver returns null for IIFE-style scripts even when they run; the
    // status transition below is the positive signal that the click registered.
    record('popup Play clicked (article tab stays active)');

    const sub = [];
    const readStatus = () =>
      driver.execute(`return document.getElementById('status-text')?.textContent ?? null;`);

    // Positive signal that the click registered: the status must leave 'Ready'
    // (the popup sets Loading... synchronously in handlePlayPause).
    const entered = await waitFor(
      'popup status to enter the journey',
      async () => {
        const text = await readStatus();
        return text === STATUS_LOADING || PLAYING_STATUSES.has(text) ? text : null;
      },
      { timeoutMs: 10_000, intervalMs: 250 },
    ).then(
      (text) => ({ ok: true, text }),
      (error) => ({ ok: false, text: error instanceof Error ? error.message : String(error) }),
    );
    sub.push(`entered journey: ${entered.ok ? `'${entered.text}'` : entered.text}`);

    const leftLoading = await waitToLeaveLoading(readStatus, JOURNEY_LOADING_LEAVE_MS);
    sub.push(`left Loading...: ${leftLoading.ok ? `'${leftLoading.text}'` : leftLoading.text}`);

    const playing = await waitForPlaying(readStatus, JOURNEY_PLAYING_MS);
    sub.push(`reached playing: ${playing.ok ? `'${playing.text}'` : playing.text}`);

    const requests = ttsRequestCount(fixture);
    sub.push(`TTS requests observed by fixture stub: ${requests}`);

    await driver.session('POST', '/window', { handle: initialHandle });
    const footer = await driver.execute(
      `return {
         footer: !!document.getElementById('proso-sticky-footer'),
         highlighted: document.querySelectorAll('.proso-highlight').length,
       };`,
    );
    sub.push(`footer on article: ${footer.footer ? 'visible' : 'missing'}`);

    const passed = entered.ok && leftLoading.ok && playing.ok && requests >= 1 && footer.footer;
    record(
      'C2 popup start journey',
      passed ? `all four sub-assertions passed (${sub.join('; ')})` : sub.join('; '),
      passed,
    );
  } finally {
    await driver.quit();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = new Set(process.argv.slice(2));
  const runChrome = args.size === 0 || args.has('--chrome');
  const runFirefox = args.size === 0 || args.has('--firefox');
  if (args.has('--help') || args.has('-h')) {
    process.stdout.write(
      'Usage: node scripts/chrome-mv3-diagnostics.mjs [--chrome] [--firefox]\n' +
        '  Runs both legs by default. Exit 0 = all checks green, 1 = any check red.\n',
    );
    return;
  }

  const fixture = await startFixtureServer();
  record('fixture server started', fixture.origin);

  try {
    if (runChrome) await chromeLeg(fixture);
    if (runFirefox) await firefoxLeg(fixture);
  } finally {
    await fixture.close();
  }

  const failed = checks.filter((c) => !c.ok);
  const failedNames = failed.map((c) => c.name);
  const verdict = failed.length === 0 ? 'PASS' : 'FAIL';
  process.stdout.write(
    `chrome-mv3-diagnostics ${verdict} — ${checks.length} check(s), ` +
      `${failed.length} failed${failedNames.length ? `: ${failedNames.join(', ')}` : ''}\n`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `chrome-mv3-diagnostics ERROR — ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
