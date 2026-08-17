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
  clickBrowserAction,
  clickByName,
  openExtensionPage,
  openExtensionsPanel,
  readPopup,
  resolveFirefox,
} from './lib/firefox-popup.mjs';
import {
  ARTICLE_PARAGRAPHS,
  LOCAL_HOST_VOICES,
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
  play: 'Play',
  pause: 'Pause',
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

  const fixture = await startFixtureServer();
  // The reader's own host. `localhost` rather than `127.0.0.1` because the
  // product only accepts https, or http for localhost — the fixture binds to
  // the loopback address either name resolves to.
  const hostAddress =
    PLANT === 'host-down'
      ? 'http://localhost:1'
      : `http://localhost:${new URL(fixture.origin).port}`;
  record('fixture server started', `${fixture.origin} (article + synthesis host)`);

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
           // Slowest supported rate: at 1.0x a clip can finish before the
           // page-visible reading state is observed at all.
           speed: 0.5,
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
          return ids.some((id) => LOCAL_HOST_VOICES.some((voice) => voice.id === id))
            ? ids.join(', ')
            : null;
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

    await driver.navigate(`${fixture.origin}/article`);
    await waitFor('content script injection', async () => {
      const injected = await driver.execute(
        "return Boolean(document.getElementById('proso-content-styles'));",
      );
      return injected === true;
    });
    record('content script injected into the article');

    await openPopup(driver);
    const opened = await waitFor('the Proso popup to open', async () => {
      const state = await readPopup(driver);
      return state.open ? state : null;
    }).catch(() => null);
    if (!opened) blocked('The browser action opened no popup document');
    if (!opened.names.includes(NAME.play)) {
      blocked(
        `The popup offers no control named "${NAME.play}" (found: ${opened.names.join(', ') || 'none'})`,
      );
    }
    record('popup exposes the public control name', NAME.play);

    await clickByName(driver, NAME.play, () => openPopup(driver));
    act(`popup control "${NAME.play}"`, 'accessible name');
    record('actor pressed the popup control', NAME.play);

    const synthesized = await waitFor(
      "a synthesis request carrying the article text at the READER'S OWN host",
      async () =>
        fixture.localRequests.find((request) =>
          ARTICLE_PARAGRAPHS.some((paragraph) =>
            String(request.body?.input ?? '').includes(paragraph.slice(0, 40)),
          ),
        ) ?? null,
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
          `${fixture.localRequests.length} local /v1/tts\n` +
          `    popup status: ${popup.status ?? 'none'}\n` +
          `    background: ${background}`,
      );
    });
    record(
      'the reader\u2019s own host synthesized the article',
      `${String(synthesized.body.input).length} chars, voice ${synthesized.body.voice}`,
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
    record('visible reading UI reached the page', `body padding ${playing.bodyPadding}`);
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
    record('popup announced the playing state publicly', `${NAME.pause} / ${whilePlaying.status}`);

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
    process.stdout.write(`\nlocal-host-journey-gate PASS at ${head()}\n`);
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
      "The synthesis host is a local fixture speaking the appliance's wire contract, not the appliance itself. tests/integration/local-host-live.test.ts covers the real host at the adapter level.",
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
