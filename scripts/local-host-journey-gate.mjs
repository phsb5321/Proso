/**
 * `make local-host-journey-gate` — public-control acceptance for the
 * ACCOUNT-FREE reading journey (INV-001, spec 100 FR-1).
 *
 * The sibling gate (`scripts/public-actor-gate.mjs`) proves the public control
 * path with synthesis served by the managed API stub, and says so in its own
 * receipt: `provesFr1: false`. This gate closes that gap. Every byte of audio
 * here comes from a host the reader configured themselves, and the assertion
 * that makes it meaningful is the negative one: the managed
 * `/api/v1/tts/synthesize` route is never called.
 *
 * Why the negative assertion is the point. PROSO-135, PROSO-136 and PROSO-137
 * were three separate breaks in which the reader had a configured, granted,
 * reachable host and playback still routed to the server and answered 402 —
 * `reconfigureAudioGenerator` never updated `PlaybackService.state.provider`,
 * `subscribeToSettings()` was never called, and the local route's own failure
 * was masked by the server's billing error. Every adapter-level test passed
 * throughout: `tests/integration/local-host-live.test.ts` synthesizes real
 * audio against a real host and never touches the wiring that was broken. Two
 * days of debugging separated the symptom from the cause because nothing
 * observed which route a real browser actually took. This gate observes it.
 *
 * The journey is the reader's, driven through controls a person can see:
 *
 *   settings "Local synthesis host" accordion -> host address -> "Test
 *   connection" -> "Enable the local synthesis host" (the runtime permission
 *   grant, from a real click) -> article -> Unified Extensions -> Proso ->
 *   "Play" -> audio from the reader's own host, page-visible reading state
 *
 * The permission grant is a real WebDriver click in content context, so the
 * user gesture `permissions.request()` requires is genuine rather than
 * simulated. See `relaxations` in the receipt for what this harness does
 * relax.
 *
 * Verdicts are three-valued and none of them is silence:
 *   PASS (0)    the reader's own host served the article and the managed route
 *               was never called.
 *   FAIL (1)    a control worked but the journey did not follow.
 *   BLOCKED (2) a browser, driver, control, or accessible name was missing, so
 *               the journey never ran. Never reported as a pass.
 *
 * @module scripts/local-host-journey-gate
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Blocked,
  JOURNEY_PREFS,
  READ_PAGE,
  blocked,
  chromeEval,
  clickBrowserAction,
  clickByName,
  openExtensionPage,
  openExtensionsPanel,
  readPopup,
  resolveFirefox,
} from './lib/firefox-popup.mjs';
import {
  LOCAL_HOST_VOICES,
  STALE_PROSO_ARTIFACT_COUNT,
  WORD_SYNC_SENTENCES,
  fixtureAudioDurationMs,
  startFixtureServer,
} from './lib/reading-fixture-server.mjs';
import { launch, sleep, waitFor } from './lib/webdriver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const buildDir = path.join(repoRoot, 'packages/extension/.output/firefox-mv2');
const artifactDir = path.join(repoRoot, '.artifacts/local-host-journey-gate');

/** Pinning the internal UUID makes `moz-extension://` addressable up front. */
const ADDON_ID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const ADDON_UUID = '8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90';

/**
 * Public names this harness addresses controls by. These are the contract:
 * renaming one must turn this gate red, which the `enable-name` plant proves.
 */
const NAME = {
  section: 'Local synthesis host',
  test: 'Test connection',
  enable: 'Enable the local synthesis host',
  playerTab: 'Player',
  toolsTab: 'Tools',
  queueTab: 'Queue',
  addQueue: 'Add to reading queue',
  removeQueue: 'Remove from queue',
  play: 'Play',
  pause: 'Pause',
  appearance: 'Appearance',
  tabFocus: 'Stop playback when switching tabs',
};

/**
 * The break to plant, or `''` for a real run. Each value severs exactly one
 * link so the assertion guarding it can be shown to catch it.
 *
 *   server-route  after the reader configures their host, force the provider
 *                 back to a managed one — the PROSO-135/136 shape exactly.
 *   no-enable     skip the enable click, so the address is stored but the
 *                 route is never turned on. Storing an address must stay inert.
 *   host-down     point the reader's address at a dead port.
 *   enable-name   look the enable control up under a name it does not carry.
 */
const PLANT = process.env.LOCAL_HOST_PLANT ?? '';

/** `stop` is the default product behavior; `continue` proves the opt-out. */
const TAB_BEHAVIOR = process.env.LOCAL_HOST_TAB_BEHAVIOR ?? 'stop';
if (!['stop', 'continue'].includes(TAB_BEHAVIOR)) {
  throw new Error(`Unknown LOCAL_HOST_TAB_BEHAVIOR: ${TAB_BEHAVIOR}`);
}
const EXPECT_TAB_STOP = TAB_BEHAVIOR === 'stop';

/**
 * Opt-in: point the reader's own host at a REAL appliance instead of the
 * fixture. Unset, this gate proves the account-free ROUTE against a fixture
 * speaking the appliance's wire contract; the appliance itself was only ever
 * covered at the adapter level (`local-host-live.test.ts`), so no single run
 * proved a real browser reading from real appliance hardware.
 *
 * With it set, the fixture still serves the article and still stands in for
 * the MANAGED endpoint — so a wrong fallback is still recorded rather than
 * escaping to the real API — but every audio byte comes from the appliance.
 * The observation changes with it: a real appliance does not report back to
 * the fixture, so the receipt is the audible outcome (reading UI reached the
 * page) plus zero managed requests, and the run pre-flights the appliance so
 * unreachable hardware is BLOCKED rather than read as a product failure.
 */
const APPLIANCE_URL = (process.env.LOCAL_HOST_APPLIANCE_URL ?? '').replace(/\/$/, '');

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

/**
 * Click an element with a REAL WebDriver click.
 *
 * This matters beyond fidelity: `browser.permissions.request()` refuses to run
 * outside a user input handler, and a synthetic `element.click()` from script
 * carries no user activation. Only a real driver click makes the grant path
 * reachable at all.
 */
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

/** Read a settings control's visible text (status lines are `role="status"`). */
async function readText(driver, selector) {
  const text = await driver.execute(
    `const el = document.querySelector(arguments[0]);
     return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;`,
    [selector],
  );
  return typeof text === 'string' ? text : null;
}

async function readChecked(driver, selector) {
  return driver.execute(
    `const el = document.querySelector(arguments[0]);
     return el instanceof HTMLInputElement ? el.checked : null;`,
    [selector],
  );
}

async function activateTab(driver, handle, name) {
  await driver.session('POST', '/window', { handle });
  act(name, 'browser tab activation');
}

async function dismissBrowserActionPanel(driver) {
  await chromeEval(
    driver,
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     win.document.getElementById('customizationui-widget-panel')?.hidePopup();
     return true;`,
  );
  await waitFor('the browser-action panel to close', async () => {
    const state = await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       return win.document.getElementById('customizationui-widget-panel')?.state ?? 'closed';`,
    );
    return state === 'closed' ? true : null;
  });
}

async function openArticleTab(driver) {
  const before = await driver.session('GET', '/window/handles');
  const link = await findElement(driver, '#open-companion-tab', 'Open companion article');
  await driver.session('POST', `/element/${link}/click`, {});
  act('Open companion article', 'public page link');
  const handle = await waitFor('the companion article tab', async () => {
    const handles = await driver.session('GET', '/window/handles');
    return handles.find((candidate) => !before.includes(candidate)) ?? null;
  });
  await driver.session('POST', '/window', { handle });
  return handle;
}

/**
 * Verify the control the actor is about to use carries the public name the
 * gate addresses it by. A renamed control must block rather than silently
 * pass through a css selector that still matches.
 */
async function requirePublicName(driver, selector, expected) {
  const actual = await readText(driver, selector);
  const wanted = PLANT === 'enable-name' && expected === NAME.enable ? 'Turn on my host' : expected;
  if (!actual || !actual.includes(wanted)) {
    blocked(`No control named "${wanted}" (${selector} reads: ${actual ?? 'nothing'})`);
  }
}

async function openPopup(driver) {
  await openExtensionsPanel(driver);
  const label = await clickBrowserAction(driver, ADDON_ID);
  act(`browser action "${label}"`, 'Unified Extensions panel item');
  return label;
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

  let expectedHostVoiceIds = LOCAL_HOST_VOICES.map((voice) => voice.id);

  // Pre-flight BEFORE the fixture server opens a socket. `blocked()` throws
  // and nothing in main()'s rejection path calls process.exit, so a listening
  // fixture would hold the event loop open and the run would hang instead of
  // reporting BLOCKED — the exact case this pre-flight exists to report.
  // Hardware that is off, unplugged or off-tailnet is not a product defect.
  if (APPLIANCE_URL) {
    if (PLANT === 'host-down') {
      // Otherwise `hostAddress` silently ignores APPLIANCE_URL below and the
      // run tests the fixture-mode path while claiming to be in appliance
      // mode — a plant that proves something about a different code path.
      blocked(
        'LOCAL_HOST_PLANT=host-down cannot run in appliance mode: it replaces the host address, so the appliance is never the host under test',
      );
    }
    const [ready, capabilities] = await Promise.all([
      fetch(`${APPLIANCE_URL}/health`, { signal: AbortSignal.timeout(10_000) })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
      fetch(`${APPLIANCE_URL}/v1/capabilities`, { signal: AbortSignal.timeout(10_000) })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ]);
    if (!ready?.ready) {
      blocked(
        `The appliance at ${APPLIANCE_URL} is not reachable/ready (GET /health) — ` +
          'this run proves nothing about the product',
      );
    }
    expectedHostVoiceIds = (capabilities?.tts?.voices ?? [])
      .map((voice) => voice?.id)
      .filter((id) => typeof id === 'string' && id.length > 0);
    if (expectedHostVoiceIds.length === 0) {
      blocked(
        `The appliance at ${APPLIANCE_URL} published no voices (GET /v1/capabilities) — ` +
          'the background route cannot be attributed',
      );
    }
    record(
      'real appliance pre-flight',
      `${APPLIANCE_URL} ready, build ${ready.version ?? 'unreported'}, ` +
        `${expectedHostVoiceIds.length} voice(s)`,
    );
  }

  const fixture = await startFixtureServer({ localHostDelayMs: APPLIANCE_URL ? 0 : 5000 });
  // The reader's own host. `localhost` rather than `127.0.0.1` because the
  // product only accepts https, or http for localhost — the fixture binds to
  // the loopback address either name resolves to.
  const hostAddress =
    PLANT === 'host-down'
      ? 'http://localhost:1'
      : APPLIANCE_URL || `http://localhost:${new URL(fixture.origin).port}`;
  record(
    'fixture server started',
    `${fixture.origin} (article${APPLIANCE_URL ? '' : ' + synthesis host'})`,
  );

  const driver = await launch({
    binary,
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      ...JOURNEY_PREFS,
      // The optional-permission doorhanger is a chrome-level popup WebDriver
      // cannot address from content context. Turning the prompt off grants the
      // request the page makes; the request itself, its user gesture, and the
      // resulting grant are all real. What this does NOT prove is the reader
      // reading and accepting the doorhanger.
      'extensions.webextOptionalPermissionPrompts': false,
    },
  });

  try {
    await driver.installAddon(buildDir);
    record('built extension installed in Firefox');

    // Setup, not an actor action: point the MANAGED route at the fixture too.
    // A wrong fallback then lands on this server and is recorded, instead of
    // reaching the real Proso API and failing for an unrelated reason. The
    // local-host fields are deliberately NOT seeded — the actor sets them.
    await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/settings.html`);
    await driver.executeAsync(
      `const [origin, done] = arguments;
       browser.storage.local
         .set({
           serverUrl: origin,
           licenseKey: null,
           cacheType: 'memory',
           // The fixture's first sentence is long enough to observe at 1x,
           // which keeps its deterministic clip-boundary clock simple.
           speed: 1,
         })
         .then(done);`,
      [fixture.origin],
    );
    // The background container reads its config once, at init.
    await driver.execute('browser.runtime.reload(); return true;').catch(() => {});
    await sleep(3000);
    const liveHandles = await driver.session('GET', '/window/handles');
    await driver.session('POST', '/window', { handle: liveHandles[0] });
    record('managed route pointed at the fixture (setup)', fixture.origin);

    // ---- the actor path starts here; nothing below seeds local-host state ----

    await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/settings.html`);
    record('settings page open');

    await requirePublicName(driver, '#local-host .proso-accordion__header', NAME.section);
    await clickElement(driver, '#local-host .proso-accordion__header', NAME.section);
    const expanded = await waitFor('the local synthesis host section to open', async () => {
      const hidden = await driver.execute(
        "return document.getElementById('local-host-content')?.hasAttribute('hidden');",
      );
      return hidden === false ? true : null;
    }).catch(() => false);
    if (!expanded) blocked('The "Local synthesis host" section never opened');
    record('actor opened the settings section', NAME.section);

    // The destination disclosure is a constitutional condition (2.1.0): the UI
    // must state where the page text goes before the reader enables the route.
    const destination = await readText(driver, '[data-testid="settings-local-host-destination"]');
    if (!destination || !destination.includes('never sent to the Proso servers')) {
      fail(`The section does not state where page text goes (reads: ${destination ?? 'nothing'})`);
    }
    record('UI states the destination before the reader enables it', destination.slice(0, 80));

    await typeInto(driver, '#localHostUrl', hostAddress, 'Host address');
    record('actor entered their own host address', hostAddress);

    await requirePublicName(driver, '#testLocalHost', NAME.test);
    await clickElement(driver, '#testLocalHost', NAME.test);
    const connected = await waitFor(
      'the host to answer its published voices',
      async () => {
        const status = await readText(driver, '#localHostStatus');
        if (!status || status === 'Testing…') return null;
        return status;
      },
      { timeoutMs: 20_000 },
    );
    if (!connected.startsWith('Connected')) {
      fail(`"${NAME.test}" did not reach the reader's host: ${connected}`);
    }
    record('the reader\u2019s host answered its capabilities', connected);

    if (PLANT !== 'no-enable') {
      await requirePublicName(driver, 'label[for="localHostEnabled"]', NAME.enable);
      await clickElement(driver, '#localHostEnabled', NAME.enable);
      // Match the grant by the one thing only the success path prints: the
      // origin the reader just entered. Every failure branch
      // (`controller.ts` invalid-address / denied / requester message) is
      // origin-free, so this discriminates without pinning the copy.
      // It previously required the literal prefix "Permission granted", which
      // #170 renamed to "Browser host access covers every port; Proso uses
      // only <origin>." without touching this gate -- the journey then failed
      // on healthy code, one step after the permission had actually been
      // granted.
      const granted = await waitFor(
        'the runtime host permission to be granted',
        async () => {
          const status = await readText(driver, '#localHostStatus');
          return status?.includes(hostAddress) ? status : null;
        },
        { timeoutMs: 20_000 },
      ).catch(() => null);
      if (!granted) {
        const status = await readText(driver, '#localHostStatus');
        fail(`Enabling the host did not grant the origin: ${status ?? 'no status'}`);
      }
      record('runtime permission granted from the actor\u2019s click', granted);

      // The UI saying "granted" is not the engine having switched. Ask the
      // background which voices it can offer: the reader's host publishes its
      // own, a managed provider does not. Until this answers with the host's
      // voice list, the configuration has not reached the route that plays
      // audio -- which is the exact gap PROSO-135/136/137 kept reopening.
      const adopted = await waitFor(
        'the background to adopt the host as the audio route',
        async () => {
          const raw = await driver
            .executeAsync(
              `const [done] = arguments;
               browser.runtime.sendMessage({ type: 'audio.getVoices', language: 'en' })
                 .then((r) => done(JSON.stringify(r)), (e) => done(JSON.stringify({ error: String(e) })));`,
            )
            .catch(() => null);
          if (typeof raw !== 'string') return null;
          const ids = (JSON.parse(raw).voices ?? []).map((voice) => voice.id);
          return ids.some((id) => expectedHostVoiceIds.includes(id)) ? ids.join(', ') : null;
        },
        { timeoutMs: 20_000 },
      ).catch(() => null);
      if (!adopted) {
        fail(
          'The settings UI reported the host was configured, but the background never adopted it as the audio route',
        );
      }
      record('the background adopted the host as the audio route', adopted);
    }

    const appearanceExpanded = await driver.execute(
      "return document.querySelector('#appearance .proso-accordion__header')?.getAttribute('aria-expanded') === 'true';",
    );
    if (!appearanceExpanded) {
      await requirePublicName(driver, '#appearance .proso-accordion__header', NAME.appearance);
      await clickElement(driver, '#appearance .proso-accordion__header', NAME.appearance);
    }
    const appearanceReady = await waitFor('the Appearance section to open', async () => {
      const hidden = await driver.execute(
        "return document.getElementById('appearance-content')?.hasAttribute('hidden');",
      );
      return hidden === false ? true : null;
    }).catch(() => false);
    if (!appearanceReady) blocked('The Appearance section never opened');

    await requirePublicName(driver, 'label[for="stopPlaybackOnTabChange"]', NAME.tabFocus);
    const actorWantsTabStop = PLANT === 'tab-stop-disabled' ? false : EXPECT_TAB_STOP;
    const currentTabStop = await readChecked(driver, '#stopPlaybackOnTabChange');
    if (currentTabStop === null) blocked(`No checkbox named "${NAME.tabFocus}"`);
    if (currentTabStop !== actorWantsTabStop) {
      await clickElement(driver, 'label[for="stopPlaybackOnTabChange"]', NAME.tabFocus);
    }
    const preferenceApplied = await waitFor('the tab-focus preference to persist', async () => {
      const checked = await readChecked(driver, '#stopPlaybackOnTabChange');
      const stored = await driver.executeAsync(
        `const [done] = arguments;
         browser.storage.local.get('stopPlaybackOnTabChange').then(done);`,
      );
      const storedBehavior = stored?.stopPlaybackOnTabChange !== false;
      return checked === actorWantsTabStop && storedBehavior === actorWantsTabStop ? true : null;
    }).catch(() => false);
    if (!preferenceApplied) fail('The tab-focus checkbox did not persist its public state');
    record(
      'actor chose the tab-switch playback behavior',
      actorWantsTabStop ? 'stop and ready the new tab' : 'continue background playback',
    );

    if (PLANT === 'server-route') {
      // The PROSO-135/136 shape: the reader's configuration is intact and the
      // provider silently is not `local`, so playback takes the managed route.
      await driver.executeAsync(
        `const [done] = arguments;
         browser.storage.local.set({ provider: 'openai' })
           .then(() => browser.runtime.sendMessage({ type: 'provider.select', provider: 'openai' }))
           .then(() => done(), () => done());`,
      );
      record('plant: provider forced back to a managed route', 'server-route');
    }

    await driver.navigate(`${fixture.origin}/article?tab=first`);
    await waitFor('content script injection', async () => {
      const injected = await driver.execute(
        "return Boolean(document.getElementById('proso-content-styles'));",
      );
      return injected === true;
    });
    const firstArticleHandle = await driver.session('GET', '/window');
    if (PLANT === 'stale-cleanup') {
      await driver.execute(
        "const root=document.createElement('div'); root.id='proso-sticky-footer'; document.body.appendChild(root);",
      );
    }
    const firstClean = await driver.execute(`return (() => {${READ_PAGE}})();`);
    if (
      firstClean.footerCount !== 0 ||
      firstClean.wordWrapperCount !== 0 ||
      firstClean.highlighted.length !== 0
    ) {
      fail(
        `The first tab retained obsolete playback DOM after content initialization: ${JSON.stringify(firstClean)}`,
      );
    }
    record(
      'content script reconciled the first long-lived tab',
      `${STALE_PROSO_ARTIFACT_COUNT} obsolete players removed`,
    );

    const secondArticleHandle = await openArticleTab(driver);
    await waitFor('content script injection in the second tab', async () => {
      const injected = await driver.execute(
        "return Boolean(document.getElementById('proso-content-styles'));",
      );
      return injected === true;
    });
    const secondClean = await driver.execute(`return (() => {${READ_PAGE}})();`);
    if (
      secondClean.footerCount !== 0 ||
      secondClean.wordWrapperCount !== 0 ||
      secondClean.highlighted.length !== 0
    ) {
      fail(
        `The second tab retained obsolete playback DOM after content initialization: ${JSON.stringify(secondClean)}`,
      );
    }
    record(
      'content script reconciled the second long-lived tab',
      `${STALE_PROSO_ARTIFACT_COUNT} obsolete players removed`,
    );
    await activateTab(driver, firstArticleHandle, 'Activate the first article tab');

    await openPopup(driver);
    const opened = await waitFor('the Proso popup to open', async () => {
      const state = await readPopup(driver);
      return state.open ? state : null;
    }).catch(() => null);
    if (!opened) blocked('The browser action opened no popup document');
    if (PLANT === 'approximate-label') {
      await chromeEval(
        driver,
        `const win=Services.wm.getMostRecentWindow('navigator:browser');
         const browser=Array.from(win.document.querySelectorAll('browser')).find((node) => node.currentURI?.spec.includes('/popup.html'));
         browser?.contentDocument?.getElementById('timing-basis')?.replaceChildren('Word highlighting: exact');`,
      );
      Object.assign(opened, await readPopup(driver));
    }
    if (PLANT === 'tools-name') {
      await chromeEval(
        driver,
        `const win=Services.wm.getMostRecentWindow('navigator:browser');
         const browser=Array.from(win.document.querySelectorAll('browser')).find((node) => node.currentURI?.spec.includes('/popup.html'));
         browser?.contentDocument?.getElementById('tab-tools')?.setAttribute('aria-label','Broken Tools');`,
      );
    }
    if (opened.selectedTab !== NAME.playerTab || opened.visiblePanel !== 'panel-player') {
      fail(`The popup did not open on its Player tab: ${JSON.stringify(opened)}`);
    }
    if (opened.timingBasis !== 'Word highlighting: approximate') {
      fail(
        `The current no-marks route did not disclose approximate timing: ${JSON.stringify(opened)}`,
      );
    }

    await clickByName(driver, NAME.toolsTab, () => openPopup(driver));
    act(`popup tab "${NAME.toolsTab}"`, 'accessible name');
    const toolsPanel = await waitFor('the Tools tab panel', async () => {
      const state = await readPopup(driver);
      return state.selectedTab === NAME.toolsTab && state.visiblePanel === 'panel-tools'
        ? state
        : null;
    });
    if (!toolsPanel.panelText?.includes('Highlights')) {
      fail(`The Tools tab exposed no working tool content: ${JSON.stringify(toolsPanel)}`);
    }
    if (toolsPanel.names.includes('Read text from screenshot')) {
      fail('The unimplemented OCR control is still exposed in Tools');
    }
    record('Tools tab selected one working panel', 'Highlights available; dead OCR hidden');

    await clickByName(driver, NAME.queueTab, () => openPopup(driver));
    act(`popup tab "${NAME.queueTab}"`, 'accessible name');
    const queuePanel = await waitFor('the Queue tab panel', async () => {
      const state = await readPopup(driver);
      return state.selectedTab === NAME.queueTab &&
        state.visiblePanel === 'panel-queue' &&
        state.names.includes(NAME.addQueue)
        ? state
        : null;
    });
    record('Queue tab selected one working panel', queuePanel.panelText?.slice(0, 80));

    if (PLANT === 'queue-add-hidden') {
      await chromeEval(
        driver,
        `const win=Services.wm.getMostRecentWindow('navigator:browser');
         const browser=Array.from(win.document.querySelectorAll('browser')).find((node) => node.currentURI?.spec.includes('/popup.html'));
         const control=browser?.contentDocument?.getElementById('add-to-queue-btn'); if (control) control.hidden=true;`,
      );
    }
    await clickByName(driver, NAME.addQueue, () => openPopup(driver));
    act(`popup control "${NAME.addQueue}"`, 'accessible name');
    await waitFor('the current article to enter the queue', async () => {
      const state = await readPopup(driver);
      return state.names.includes(NAME.removeQueue) ? state : null;
    });
    await clickByName(driver, NAME.removeQueue, () => openPopup(driver));
    act(`popup control "${NAME.removeQueue}"`, 'accessible name');
    await waitFor('the queue item to be removable', async () => {
      const state = await readPopup(driver);
      return state.panelText?.includes('Queue is empty') ? state : null;
    });
    record('Queue add/remove controls completed publicly');

    await clickByName(driver, NAME.playerTab, () => openPopup(driver));
    act(`popup tab "${NAME.playerTab}"`, 'accessible name');
    const playerPanel = await waitFor('the Player tab panel', async () => {
      const state = await readPopup(driver);
      return state.selectedTab === NAME.playerTab &&
        state.visiblePanel === 'panel-player' &&
        state.names.includes(NAME.play)
        ? state
        : null;
    });
    record('Player tab restored the public playback control', NAME.play);
    if (playerPanel.timingBasis !== 'Word highlighting: approximate') {
      fail(`Player lost its timing disclosure: ${JSON.stringify(playerPanel)}`);
    }

    await clickByName(driver, NAME.play, () => openPopup(driver));
    act(`popup control "${NAME.play}"`, 'accessible name');
    record('actor pressed the popup control', NAME.play);

    const synthesized = await waitFor(
      APPLIANCE_URL
        ? "audio that actually DECODED AND PLAYED (the appliance's request log is off-process)"
        : "a synthesis request carrying the article text at the READER'S OWN host",
      async () => {
        if (APPLIANCE_URL) {
          // The appliance is off-process, so its request log cannot be read.
          // The observation must therefore be one that requires audio to have
          // decoded, and the visible reading state is NOT that: PlaybackService
          // calls showFooter and highlightParagraph(0) BEFORE any synthesis
          // request (playback-service.ts:157-181), and both survive the error
          // path. `status: 'playing'` — which the popup announces as "Pause" —
          // is set only by finalizeParagraphPlayback, which a failed
          // `audioElement.play()` short-circuits before reaching
          // (playback-service.ts:1086-1089). So bytes were decoded and played.
          // WHOSE bytes is settled separately, by the managed-route assertion
          // below; with that at zero and browser speechSynthesis removed in
          // 9797dc6, the appliance is the only remaining source.
          const state = await readPopup(driver).catch(() => null);
          return state?.open && state.names.includes(NAME.pause) ? { appliance: true } : null;
        }
        return (
          fixture.localRequests.find(
            (request) => String(request.body?.input ?? '') === WORD_SYNC_SENTENCES[0],
          ) ?? null
        );
      },
      { timeoutMs: 45_000 },
    ).catch(async (error) => {
      // Name the route that WAS taken. Not knowing this is what turned
      // PROSO-135/136/137 into five debugging passes: every symptom pointed at
      // billing while the fault was in the wiring, and no observation said
      // which adapter the click had actually reached.
      const popup = await readPopup(driver).catch(() => ({ status: null }));
      // The article page has no `browser` API, so the background is asked from
      // an extension page opened for the purpose.
      let background = 'unavailable';
      try {
        await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/settings.html`);
        background = await driver.executeAsync(
          `const [done] = arguments;
           Promise.all([
             browser.storage.local.get(['provider', 'localHostEnabled', 'localHostUrl']),
             browser.runtime.sendMessage({ type: 'playback.getState' }).catch((e) => String(e)),
             browser.permissions.getAll(),
             // Which adapter the container actually holds: the local host
             // answers with the voices IT publishes, a managed provider does not.
             browser.runtime
               .sendMessage({ type: 'audio.getVoices', language: 'en' })
               .catch((e) => String(e)),
           ]).then(([storage, state, perms, voices]) =>
             done(JSON.stringify({ storage, state, origins: perms.origins, voices })),
           );`,
        );
      } catch {
        // Diagnosis is best-effort; the failure below is the verdict either way.
      }
      fail(
        `${error.message}\n` +
          `    route taken: ${fixture.requests.length} managed /api/v1/tts/synthesize, ` +
          `${
            APPLIANCE_URL
              ? `local /v1/tts served by the appliance and not observable from here (fixture saw ${fixture.localRequests.length})`
              : `${fixture.localRequests.length} local /v1/tts`
          }\n` +
          `    popup status: ${popup.status ?? 'none'}\n` +
          `    background: ${background}`,
      );
    });
    if (!APPLIANCE_URL) {
      const firstRequest = fixture.localRequests[0];
      await waitFor('the first delayed local response', async () => firstRequest?.respondedAt);
      if (PLANT === 'double-prefetch') {
        fixture.localRequests.push(
          {
            at: firstRequest.at + 1,
            respondedAt: firstRequest.respondedAt,
            body: { input: 'planted lookahead A' },
          },
          {
            at: firstRequest.at + 2,
            respondedAt: firstRequest.respondedAt,
            body: { input: 'planted lookahead B' },
          },
        );
      }
      const overlappedFirst = fixture.localRequests.filter(
        (request) => request.at < firstRequest.respondedAt,
      );
      if (overlappedFirst.length > 2) {
        fail(
          `One Play overlapped ${overlappedFirst.length} local requests before the first response; the chunk producer allows at most two and paragraph prefetch must stay off: ${JSON.stringify(overlappedFirst.map((request) => request.body?.input))}`,
        );
      }
      record(
        'one Play kept local synthesis within the chunk pipeline bound',
        `${overlappedFirst.length} request(s) before the first response, maximum 2`,
      );
    }

    // In appliance mode this cannot yet claim WHICH host produced the audio:
    // the managed fixture would satisfy a decoded-and-playing observation just
    // as well, and does exactly that under the `server-route` plant. State only
    // what is proven so far; attribution is recorded after the assertion below.
    record(
      synthesized.appliance
        ? 'audio decoded and played (source not yet attributed)'
        : 'the reader\u2019s own host synthesized the article',
      synthesized.appliance
        ? `popup announced "${NAME.pause}" — a failed decode never reaches this state`
        : `${String(synthesized.body.input).length} chars, voice ${synthesized.body.voice}`,
    );

    // The assertion this gate exists for. A reader with no account, no license
    // key and no provider key must never have been billed-routed: one call to
    // the managed endpoint is the 402 bug, whatever else the run observed.
    if (fixture.requests.length > 0) {
      fail(
        `Playback called the MANAGED route ${fixture.requests.length}x while the reader's own host was configured, granted and reachable — this is the PROSO-135/136 402 regression`,
      );
    }
    record('the managed route was never called', '0 requests to /api/v1/tts/synthesize');

    // Only now is attribution earned: audio demonstrably played, and the one
    // other reachable source recorded zero requests.
    if (synthesized.appliance) {
      record(
        'the reader’s own host synthesized the article',
        `real appliance ${APPLIANCE_URL} — audio played, managed route at zero`,
      );
    }

    const readPage = () => driver.execute(`return (() => {${READ_PAGE}})();`);
    const playing = await waitFor(
      'the visible reading UI',
      async () => {
        const state = await readPage();
        return state?.footer && state.highlighted.length > 0 ? state : null;
      },
      { timeoutMs: 45_000 },
    );
    if (!playing.bodyPadding) {
      fail('Footer is in the page but reserved no room for itself (body padding unset)');
    }
    if (playing.footerCount !== 1) {
      fail(`Playback exposed ${playing.footerCount} page players instead of one`);
    }
    record(
      'visible reading UI reached the page',
      `one player, body padding ${playing.bodyPadding}`,
    );
    record('paragraph highlighted in the page', playing.highlighted[0].slice(0, 60));

    const whilePlaying = await waitFor(
      'the popup control to announce Pause while playing',
      async () => {
        const state = await readPopup(driver);
        return state.open && state.names.includes(NAME.pause) ? state : null;
      },
      { timeoutMs: 20_000 },
    ).catch(() => null);
    if (!whilePlaying) {
      fail(`The popup never announced "${NAME.pause}" while the page was reading`);
    }
    if (whilePlaying.timingBasis !== 'Word highlighting: approximate') {
      fail(
        `The real no-marks playback state did not remain approximate: ${JSON.stringify(whilePlaying)}`,
      );
    }
    record('popup announced the playing state publicly', `${NAME.pause} / ${whilePlaying.status}`);

    if (!APPLIANCE_URL) {
      await waitFor('the first word-sync sentence response', async () => synthesized.respondedAt, {
        timeoutMs: 20_000,
      });
      const firstClipBoundary =
        synthesized.respondedAt + fixtureAudioDurationMs(WORD_SYNC_SENTENCES[0]) + 200;
      await sleep(Math.max(0, firstClipBoundary - Date.now()));
      const secondOnlyWords = new Set(
        (WORD_SYNC_SENTENCES[1].match(/\S+/g) ?? [])
          .map((word) => word.replace(/[^A-Za-z]/g, '').toLowerCase())
          .filter(
            (word) => word.length > 0 && !WORD_SYNC_SENTENCES[0].toLowerCase().includes(word),
          ),
      );
      const synchronized = await waitFor(
        'the visible word to enter sentence two at the first clip boundary',
        async () => {
          const state = await readPage();
          const activeWord = String(state?.activeWord ?? '')
            .replace(/[^A-Za-z]/g, '')
            .toLowerCase();
          return secondOnlyWords.has(activeWord) ? state : null;
        },
        { timeoutMs: 2000 },
      ).catch(() => null);
      if (!synchronized) {
        const state = await readPage();
        fail(
          'The word highlight did not enter sentence two at the measured clip boundary ' +
            `(active word: ${state?.activeWord ?? 'none'})`,
        );
      }
      record(
        'word highlight entered sentence two after the measured audio boundary',
        synchronized.activeWord,
      );
      const structuralRequest = fixture.localRequests.find((request) =>
        String(request.body?.input ?? '').includes('Boundary alignment'),
      );
      if (!structuralRequest || /[\u2500-\u257f]/u.test(String(structuralRequest.body?.input))) {
        fail(
          `Structural page glyphs crossed the synthesis boundary: ${JSON.stringify(structuralRequest?.body ?? null)}`,
        );
      }
      record('non-spoken structural glyphs stayed out of the synthesis request');
    }

    await activateTab(driver, secondArticleHandle, 'Activate the second article tab');
    const afterTabSwitch = await waitFor(
      EXPECT_TAB_STOP ? 'the new tab to become ready' : 'background playback to continue',
      async () => {
        const state = await readPopup(driver);
        if (!state.open) return null;
        if (EXPECT_TAB_STOP) {
          return state.names.includes(NAME.play) && !state.names.includes(NAME.pause)
            ? state
            : null;
        }
        return state.names.includes(NAME.pause) ? state : null;
      },
      { timeoutMs: 10_000 },
    ).catch(() => null);
    if (!afterTabSwitch) {
      const [href, popupState, tabs] = await Promise.all([
        driver.execute('return location.href;').catch(() => 'unavailable'),
        readPopup(driver).catch(() => null),
        chromeEval(
          driver,
          `const win = Services.wm.getMostRecentWindow('navigator:browser');
           return win.gBrowser.tabs.map((tab) => ({
             selected: tab === win.gBrowser.selectedTab,
             url: tab.linkedBrowser.currentURI.spec,
           }));`,
        ).catch(() => null),
      ]);
      let oldPage = null;
      if (EXPECT_TAB_STOP) {
        await activateTab(driver, firstArticleHandle, 'Diagnose the first article tab');
        oldPage = await driver.execute(`return (() => {${READ_PAGE}})();`).catch(() => null);
      }
      fail(
        (EXPECT_TAB_STOP
          ? 'Activating another tab left the old audio playing instead of exposing Play'
          : 'Background-listening mode stopped audio after a tab activation') +
          ` (href=${href}, popup=${JSON.stringify(popupState)}, tabs=${JSON.stringify(tabs)}, oldPage=${JSON.stringify(oldPage)})`,
      );
    }
    record(
      EXPECT_TAB_STOP
        ? 'tab activation stopped the old reading and readied the new tab'
        : 'disabled tab-focus behavior kept background playback running',
      EXPECT_TAB_STOP ? NAME.play : NAME.pause,
    );

    await activateTab(driver, firstArticleHandle, 'Return to the first article tab');
    const oldPageAfterSwitch = await waitFor(
      EXPECT_TAB_STOP ? 'the old page reading UI to clear' : 'the old page reading UI to remain',
      async () => {
        const state = await readPage();
        const visible = state.footer && state.highlighted.length > 0;
        const oneOrNone = EXPECT_TAB_STOP ? state.footerCount === 0 : state.footerCount === 1;
        return visible === !EXPECT_TAB_STOP && oneOrNone ? state : null;
      },
      { timeoutMs: 10_000 },
    ).catch(() => null);
    if (!oldPageAfterSwitch) {
      const stalePage = await readPage().catch(() => null);
      fail(
        (EXPECT_TAB_STOP
          ? 'The old page retained its footer or highlight after tab-focus stop'
          : 'The old page lost its reading UI while background playback was enabled') +
          `: ${JSON.stringify(stalePage)}`,
      );
    }
    record(
      EXPECT_TAB_STOP ? 'old page audio UI and highlight cleared' : 'old page reading UI remained',
    );

    if (EXPECT_TAB_STOP) {
      // GeckoDriver keeps the browser-action panel open across programmatic
      // tab activation, unlike a physical tab click. Close only that chrome
      // surface, then reopen through the public Unified Extensions controls.
      await dismissBrowserActionPanel(driver);
      await activateTab(driver, secondArticleHandle, 'Return to the second article tab');
      await openPopup(driver);
      const stoppedRequestCount = fixture.localRequests.length;
      await sleep(500);
      if (fixture.localRequests.length !== stoppedRequestCount) {
        fail('The newly active tab started synthesis without the actor pressing Play');
      }

      await clickByName(driver, NAME.play, () => openPopup(driver));
      act(`popup control "${NAME.play}" in the second tab`, 'accessible name');
      const secondTabPlaying = await waitFor(
        'the second tab to start a fresh reading session',
        async () => {
          const state = await readPopup(driver);
          const synthesisObserved =
            APPLIANCE_URL || fixture.localRequests.length > stoppedRequestCount;
          return synthesisObserved && state.open && state.names.includes(NAME.pause) ? state : null;
        },
        { timeoutMs: 30_000 },
      ).catch(() => null);
      if (!secondTabPlaying) {
        const [href, pageState, popupState, tabs] = await Promise.all([
          driver.execute('return location.href;').catch(() => 'unavailable'),
          readPage().catch(() => null),
          readPopup(driver).catch(() => null),
          chromeEval(
            driver,
            `const win = Services.wm.getMostRecentWindow('navigator:browser');
             return win.gBrowser.tabs.map((tab) => ({
               selected: tab === win.gBrowser.selectedTab,
               url: tab.linkedBrowser.currentURI.spec,
             }));`,
          ).catch(() => null),
        ]);
        fail(
          'Play on the newly active tab did not start a fresh reading session ' +
            `(href=${href}, localRequests=${fixture.localRequests.length}, ` +
            `page=${JSON.stringify(pageState)}, popup=${JSON.stringify(popupState)}, ` +
            `tabs=${JSON.stringify(tabs)})`,
        );
      }
      record('Play started a fresh session in the newly active tab', NAME.pause);
    } else {
      await activateTab(driver, secondArticleHandle, 'Return to the second article tab');
    }

    mkdirSync(artifactDir, { recursive: true });
    const screenshot = await driver.session('GET', '/screenshot');
    const screenshotPath = path.join(artifactDir, 'local-host-journey.png');
    writeFileSync(screenshotPath, Buffer.from(screenshot, 'base64'));

    writeReceipt({
      verdict: 'PASS',
      binary,
      localRequests: fixture.localRequests.length,
      managedRequests: fixture.requests.length,
      artifacts: [path.relative(repoRoot, screenshotPath)],
    });
    process.stdout.write(
      `\nlocal-host-journey-gate PASS at ${head()}` +
        `${APPLIANCE_URL ? ` (real appliance ${APPLIANCE_URL})` : ''}\n`,
    );
  } finally {
    await driver.quit();
    await fixture.close();
  }
}

function writeReceipt({
  verdict,
  binary = null,
  localRequests = null,
  managedRequests = null,
  artifacts = [],
  failure,
}) {
  mkdirSync(artifactDir, { recursive: true });
  const receipt = {
    receipt: 'local-host-journey-gate',
    verdict,
    head: head(),
    startedAt: steps[0]?.at ?? null,
    finishedAt: new Date().toISOString(),
    plant: PLANT || null,
    // The claim this gate is allowed to make, and the ones it is not.
    provesFr1: verdict === 'PASS',
    provesFr1Why:
      'Every audio byte came from a host the actor configured through the settings UI; the managed /api/v1/tts/synthesize route recorded zero requests.',
    internalDispatch: false,
    relaxations: [
      'extensions.webextensions.remote=false — a remote popup document is opaque to the parent process, so its accessible names cannot be read at all out-of-process.',
      'extensions.webextOptionalPermissionPrompts=false — the grant request, its user gesture and the resulting permission are real; the doorhanger the reader would accept is not exercised.',
      'GeckoDriver leaves Firefox’s browser-action panel open across programmatic tab activation. After the stop/clear/readiness assertions, the harness closes only that chrome panel before reopening it through Unified Extensions to prove fresh Play; no extension message, storage, or playback state is mutated by the cleanup.',
      ...(APPLIANCE_URL
        ? [
            `The synthesis host was the REAL appliance at ${APPLIANCE_URL}, not a fixture. Its request log is off-process, so the audio is proven by the popup announcing "${NAME.pause}" (status 'playing', which a failed decode never reaches) and attributed by the managed route recording zero requests — not by inspecting a request body. The visible reading state is deliberately NOT the evidence: the footer and first highlight are drawn before any synthesis request and survive the error path.`,
          ]
        : [
            "The synthesis host is a local fixture speaking the appliance's wire contract, not the appliance itself. tests/integration/local-host-live.test.ts covers the real host at the adapter level.",
          ]),
    ],
    commands: [
      { command: 'pnpm --filter @proso/extension build:firefox', exitCode: 0, precondition: true },
      { command: 'node scripts/local-host-journey-gate.mjs', exitCode: verdict === 'PASS' ? 0 : 1 },
    ],
    browser: binary ? { binary, headless: process.env.GATE_HEADED !== '1' } : null,
    localRequests,
    managedRequests,
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
  process.stderr.write(`\nlocal-host-journey-gate ${verdict}: ${error.message}\n`);
  writeReceipt({ verdict, failure: error.message });
  process.exitCode = isBlocked ? 2 : 1;
});
