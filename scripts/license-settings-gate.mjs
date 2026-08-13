/**
 * `make license-settings-gate` — public-control acceptance for the paid-account
 * settings surface (PROSO-153, spec 153 FR-001..FR-009).
 *
 * `docs/money-path.md` recorded the shape this gate exists to hold shut: the
 * extension carried the entire licence path — config schema, defaults, storage
 * read, container wiring, `X-License-Key` injection — while
 * `grep -rn licenseKey packages/extension/src/entrypoints` returned zero hits,
 * and `validateLicense`, `getSubscription` and `setLicenseKey` were called only
 * from tests. Unit tests over that shape all pass: every one of them supplies
 * the key the product never had a way to receive.
 *
 * So the journey here is a person's, driven through controls a person can see:
 *
 *   Unified Extensions -> Proso -> "Open settings" -> "Paid account" section
 *   -> licence key field -> "Save & validate" -> plan and remaining credits
 *   on screen -> close and reopen through the same controls -> still configured,
 *   still masked -> failed candidates -> the working key remains
 *
 * The load-bearing assertions are the ones that are easy to fake:
 *
 * - the plan on screen came from `GET /api/v1/subscription` carrying the
 *   typed key as `X-License-Key`, recorded by the fixture. A UI that reports
 *   Pro without an authenticated round trip is reporting a wish;
 * - after a reopen the key is still configured and the page shows only its
 *   masked suffix — the raw key appears nowhere in the rendered page;
 * - a failed validation leaves the previously accepted key working. Losing a
 *   licence to a typo or a dropped connection is the failure mode this
 *   assertion refuses;
 * - the key never reaches a URL, a query string, or the extension's log buffer.
 *
 * Verdicts are three-valued and none of them is silence:
 *   PASS (0)    the reader configured a paid licence and it stayed configured.
 *   FAIL (1)    a control worked but the journey did not follow.
 *   BLOCKED (2) a browser, driver, control or accessible name was missing, so
 *               the journey never ran. Never reported as a pass.
 *
 * @module scripts/license-settings-gate
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
import {
  INTERRUPTED_LICENSE_KEY,
  PAID_LICENSE_KEY,
  startFixtureServer,
} from './lib/reading-fixture-server.mjs';
import { launch, sleep, waitFor } from './lib/webdriver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const buildDir = path.join(repoRoot, 'packages/extension/.output/firefox-mv2');
const artifactDir = path.join(repoRoot, '.artifacts/license-settings-gate');
const GATE_SEED = Number(process.env.LICENSE_GATE_SEED ?? 20260812);

/** Pinning the internal UUID makes `moz-extension://` addressable up front. */
const ADDON_ID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const ADDON_UUID = '8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90';

/**
 * Public names this harness addresses controls by. These are the contract:
 * renaming one must turn this gate red, which the `save-name` plant proves.
 */
const NAME = {
  openSettings: 'Open settings',
  section: 'Paid account',
  field: 'Licence key',
  save: 'Save & validate',
};

/** The masked suffix a configured key is allowed to disclose, and nothing more. */
const MASKED_SUFFIX = PAID_LICENSE_KEY.slice(-4);

/** A key the fixture does not sell. Typed in the failure phase. */
const WRONG_KEY = ['test', 'wrong', 'licence', '0000'].join('-');

/**
 * The break to plant, or `''` for a real run. Each value severs exactly one
 * link so the assertion guarding it can be shown to catch it.
 *
 *   unknown-key       the server recognises no key, so nothing may be accepted.
 *   subscription-free validation answers paid and the subscription route says
 *                     Free — the response must not be taken at its word.
 *   validate-500      the validation route fails outright.
 *   subscription-no-credits readback names Pro but omits its current balance.
 *   forget-key        the stored key is dropped before the reopen, standing in
 *                     for a settings page that never persisted it.
 *   failed-overwrite  replace the working stored key after a failed candidate,
 *                     proving the survival assertion notices the exact bug.
 *   settings-name     look the popup's settings control up under a wrong name.
 *   save-name         look the save control up under a name it does not carry.
 */
const PLANT = process.env.LICENSE_PLANT ?? '';

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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Bind the receipt to every byte in the unpacked extension, not only HEAD. */
function hashBuildDirectory(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const absolute = path.join(current, entry);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else files.push(absolute);
    }
  };
  visit(directory);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(directory, file));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return { sha256: hash.digest('hex'), files: files.length };
}

function requiredVersion(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim().split('\n')[0];
  } catch {
    blocked(`Required browser tool is missing or unusable: ${command}`);
  }
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

/** Read a control's visible text (status lines are `role="status"`). */
async function readText(driver, selector) {
  const text = await driver.execute(
    `const el = document.querySelector(arguments[0]);
     return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;`,
    [selector],
  );
  return typeof text === 'string' ? text : null;
}

async function readValue(driver, selector) {
  const value = await driver.execute(
    'const el = document.querySelector(arguments[0]); return el ? el.value : null;',
    [selector],
  );
  return typeof value === 'string' ? value : null;
}

/**
 * Verify the control the actor is about to use carries the public name the
 * gate addresses it by. A renamed control must block rather than silently
 * pass through a css selector that still matches.
 */
async function requirePublicName(driver, selector, expected) {
  const actual = await readText(driver, selector);
  const wanted = PLANT === 'save-name' && expected === NAME.save ? 'Activate licence' : expected;
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

/**
 * Reach settings the way a reader does: Unified Extensions → Proso → the
 * popup control whose accessible name is "Open settings".
 */
async function openSettingsThroughPublicControls(driver) {
  const before = await driver.session('GET', '/window/handles');
  await openPopup(driver);
  const popup = await waitFor('the Proso popup to open', async () => {
    const state = await readPopup(driver);
    return state.open ? state : null;
  }).catch(() => null);
  if (!popup) blocked('The browser action opened no popup document');

  // The popup renders static HTML before its async initialization registers
  // event listeners. Its visible version changes from the HTML fallback to the
  // built manifest version after listener registration, giving the actor a
  // deterministic public-ready signal instead of an arbitrary sleep.
  const expectedVersion = `v${JSON.parse(readFileSync(path.join(buildDir, 'manifest.json'), 'utf8')).version}`;
  const popupReady = await waitFor('the popup controls to become active', async () => {
    const version = await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       const b = Array.from(win.document.querySelectorAll('browser'))
         .find((x) => x.currentURI && x.currentURI.spec.includes('/popup.html'));
       return b?.contentDocument?.getElementById('version')?.textContent ?? null;`,
    );
    return version === expectedVersion ? version : null;
  }).catch(() => null);
  if (!popupReady) blocked(`The popup controls never became ready (${expectedVersion})`);

  const wanted = PLANT === 'settings-name' ? 'Open account settings' : NAME.openSettings;
  if (!popup.names.includes(wanted)) {
    blocked(
      `The popup offers no control named "${wanted}" (found: ${popup.names.join(', ') || 'none'})`,
    );
  }
  await clickByName(driver, wanted, () => openPopup(driver));
  act(`popup control "${wanted}"`, 'accessible name');

  const handle = await waitFor('the public settings tab to open', async () => {
    const handles = await driver.session('GET', '/window/handles');
    return handles.find((candidate) => !before.includes(candidate)) ?? null;
  }).catch(() => null);
  if (!handle) {
    const tabs = await chromeEval(
      driver,
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       return win.gBrowser.tabs.map((tab) => tab.linkedBrowser.currentURI.spec);`,
    ).catch(() => []);
    blocked(
      `The "${wanted}" control opened no settings tab (open browser tabs: ${JSON.stringify(tabs)})`,
    );
  }
  await driver.session('POST', '/window', { handle });
  await waitFor('the public settings page to load', async () => {
    const state = await driver.execute(
      'return JSON.stringify({ href: location.href, ready: document.readyState, api: typeof browser });',
    );
    if (typeof state !== 'string') return null;
    const parsed = JSON.parse(state);
    return parsed.href === `moz-extension://${ADDON_UUID}/settings.html` &&
      parsed.ready === 'complete' &&
      parsed.api === 'object'
      ? parsed
      : null;
  });
  record('actor opened settings through public controls', `Unified Extensions → Proso → ${wanted}`);
}

/** Close the current settings tab as the actor, then reopen it publicly. */
async function closeAndReopenSettings(driver) {
  await driver.session('DELETE', '/window');
  act('Close settings tab', 'browser tab close');
  const handles = await driver.session('GET', '/window/handles');
  if (handles.length === 0) blocked('Closing settings left no browser window to reopen it from');
  await driver.session('POST', '/window', { handle: handles[0] });
  await openSettingsThroughPublicControls(driver);
}

/** Expand the paid-account section in the settings page the actor opened. */
async function openLicenseSection(driver) {
  await requirePublicName(driver, '#license .proso-accordion__header', NAME.section);
  const semantics = await driver.execute(
    `const header = document.querySelector('#license .proso-accordion__header');
     return header ? { tag: header.tagName, controls: header.getAttribute('aria-controls') } : null;`,
  );
  if (semantics?.tag !== 'BUTTON' || semantics.controls !== 'license-content') {
    blocked(`The "${NAME.section}" section has no semantic disclosure button`);
  }
  await clickElement(driver, '#license .proso-accordion__header', NAME.section);
  const expanded = await waitFor('the paid account section to open', async () => {
    const hidden = await driver.execute(
      "return document.getElementById('license-content')?.hasAttribute('hidden');",
    );
    return hidden === false ? true : null;
  }).catch(() => false);
  if (!expanded) blocked(`The "${NAME.section}" section never opened`);
}

/** Wait for the status line to settle on something other than the pending text. */
async function settledStatus(driver, what) {
  return waitFor(
    what,
    async () => {
      const status = await readText(driver, '#licenseStatus');
      if (!status || status === 'Validating…') return null;
      return status;
    },
    { timeoutMs: 30_000 },
  );
}

async function main() {
  if (!existsSync(path.join(buildDir, 'manifest.json'))) {
    blocked(
      `Missing Firefox build at ${buildDir}. Run: pnpm --filter @proso/extension build:firefox`,
    );
  }
  const buildIdentity = hashBuildDirectory(buildDir);
  record(
    'firefox-mv2 build present',
    `${buildIdentity.files} files, sha256 ${buildIdentity.sha256.slice(0, 12)}…`,
  );

  const binary = resolveFirefox();
  const firefoxVersion = requiredVersion(binary, ['--version']);
  const geckodriverVersion = requiredVersion('geckodriver', ['--version']);
  record('firefox resolved', `${binary} (${firefoxVersion})`);
  record('geckodriver resolved', geckodriverVersion);

  const licenseMode =
    PLANT === 'unknown-key' ||
    PLANT === 'subscription-free' ||
    PLANT === 'subscription-no-credits' ||
    PLANT === 'validate-500'
      ? PLANT
      : 'sold';
  const fixture = await startFixtureServer({ licenseMode });
  record('fixture server started', `${fixture.origin} (licence mode: ${licenseMode})`);

  const driver = await launch({
    binary,
    headless: process.env.GATE_HEADED !== '1',
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      ...JOURNEY_PREFS,
    },
  });

  try {
    const profilePath = await chromeEval(
      driver,
      "return Services.dirsvc.get('ProfD', Ci.nsIFile).path;",
    );
    const profileId = sha256(String(profilePath)).slice(0, 16);
    record('isolated Firefox profile created', profileId);

    await driver.installAddon(buildDir);
    record('built extension installed in Firefox');

    // Setup, not an actor action: point the managed route at the fixture. The
    // licence key is deliberately NOT seeded — the actor types it.
    await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/settings.html`);
    await driver.executeAsync(
      `const [origin, done] = arguments;
       browser.storage.local
         .set({ serverUrl: origin, licenseKey: null, cacheType: 'memory' })
         .then(done);`,
      [fixture.origin],
    );
    // The background container reads its config once, at init.
    await driver.execute('browser.runtime.reload(); return true;').catch(() => {});
    await sleep(3000);
    const liveHandles = await driver.session('GET', '/window/handles');
    await driver.session('POST', '/window', { handle: liveHandles[0] });
    await driver.navigate(`${fixture.origin}/article`);
    record('managed route pointed at the fixture (setup)', fixture.origin);

    // ---- the actor path starts here; nothing below seeds licence state ----

    await openSettingsThroughPublicControls(driver);
    await openLicenseSection(driver);
    record('actor opened the settings section', NAME.section);

    // The account-free promise has to be visible where the paid surface is,
    // or the surface reads as a paywall for reading itself (FR-6).
    const freeNote = await readText(driver, '[data-testid="settings-license-free-note"]');
    if (!freeNote || !freeNote.includes('no account and no licence key')) {
      fail(
        `The section does not state that reading needs no key (reads: ${freeNote ?? 'nothing'})`,
      );
    }
    record('UI states reading needs no account', freeNote.slice(0, 80));

    // The field a person looks for: labelled, and a password field so the key
    // is not shoulder-readable while typed.
    const fieldLabel = await readText(driver, 'label[for="licenseKey"]');
    if (!fieldLabel || !fieldLabel.includes(NAME.field)) {
      blocked(`No field labelled "${NAME.field}" (reads: ${fieldLabel ?? 'nothing'})`);
    }
    const fieldType = await driver.execute(
      "return document.getElementById('licenseKey')?.type ?? null;",
    );
    if (fieldType !== 'password') {
      fail(`The licence key field is type "${fieldType}", not a password field`);
    }
    record('labelled password field present', `${NAME.field} (type=${fieldType})`);

    const emptyStatus = await waitFor('the unconfigured licence state', async () => {
      const status = await readText(driver, '#licenseStatus');
      return status?.includes('No licence key saved') ? status : null;
    }).catch(() => null);
    if (!emptyStatus) {
      const status = await readText(driver, '#licenseStatus');
      fail(`An unconfigured browser does not say so (reads: ${status ?? 'nothing'})`);
    }
    record('unconfigured state is stated', emptyStatus.slice(0, 80));

    await typeInto(driver, '#licenseKey', PAID_LICENSE_KEY, NAME.field);
    record('actor typed the licence key they bought');

    await requirePublicName(driver, '#saveLicenseKey', NAME.save);
    await clickElement(driver, '#saveLicenseKey', NAME.save);
    const accepted = await settledStatus(driver, 'the licence check to answer');
    record('actor pressed the public control', NAME.save);

    if (!accepted.startsWith('Licence validated')) {
      fail(`"${NAME.save}" did not accept the sold licence: ${accepted}`);
    }
    if (!accepted.includes('Pro')) {
      fail(`The accepted licence does not report the plan it bought: ${accepted}`);
    }
    if (!accepted.includes('412,500')) {
      fail(`The accepted licence does not report remaining credits: ${accepted}`);
    }
    record('plan and credits shown to the reader', accepted);

    // The UI saying "Pro" is not the server having said it. These two records
    // are what make the sentence on screen an observation.
    const validation = fixture.licenseRequests.find(
      (request) => request.body?.licenseKey === PAID_LICENSE_KEY,
    );
    if (!validation) {
      fail(
        `The page reported a plan without calling POST /api/v1/license/validate with the typed key (${fixture.licenseRequests.length} validation call(s) recorded)`,
      );
    }
    if (validation.header !== null) {
      fail(
        'The public validation request also disclosed a previously configured key in its header',
      );
    }
    const authenticated = fixture.subscriptionRequests.find(
      (request) => request.header === PAID_LICENSE_KEY,
    );
    if (!authenticated) {
      fail(
        `No subscription request carried the key as X-License-Key (${fixture.subscriptionRequests.length} subscription call(s) recorded)`,
      );
    }
    record(
      'the plan came from an authenticated round trip',
      `${fixture.licenseRequests.length} public-body validation, ${fixture.subscriptionRequests.length} authenticated subscription`,
    );
    record('public validation carried no licence header', 'candidate body only');

    // A credential in a URL is a credential in history, in the Referer header
    // and in every proxy log between here and the server.
    const rawKeys = [PAID_LICENSE_KEY, WRONG_KEY, INTERRUPTED_LICENSE_KEY];
    const inUrl = [...fixture.licenseRequests, ...fixture.subscriptionRequests].filter((request) =>
      rawKeys.some((key) => String(request.url ?? '').includes(key)),
    );
    if (inUrl.length > 0) {
      fail(`A licence key appeared in ${inUrl.length} request URL(s): ${inUrl[0].url}`);
    }
    record(
      'no licence key appeared in a URL',
      `${fixture.licenseRequests.length + fixture.subscriptionRequests.length} URLs checked`,
    );

    if (PLANT === 'forget-key') {
      // Stands in for a settings page that reported success and never wrote
      // the key through the config path.
      await driver.executeAsync(
        `const [done] = arguments;
         browser.storage.local.remove('licenseKey').then(done, done);`,
      );
      record('plant: the stored key was dropped before the reopen', 'forget-key');
    }

    // ---- reopen: close the tab and return through the public popup control ----

    await closeAndReopenSettings(driver);
    await openLicenseSection(driver);
    const reopened = await waitFor(
      'the reopened settings page to report the stored licence',
      async () => {
        const status = await readText(driver, '#licenseStatus');
        return status && status.length > 0 ? status : null;
      },
      { timeoutMs: 30_000 },
    );
    if (!reopened.includes('is saved')) {
      fail(`After reopening, the settings page does not report a saved key: ${reopened}`);
    }
    if (!reopened.includes(MASKED_SUFFIX)) {
      fail(`After reopening, the saved key is not identifiable by its suffix: ${reopened}`);
    }
    if (!reopened.includes('Pro') || !reopened.includes('412,500')) {
      fail(`After reopening, the plan the key buys is not reported: ${reopened}`);
    }
    record('reopened page reports the configured licence', reopened);

    // Configured is not the same as displayed. The masked suffix may be on
    // screen; the key may not be anywhere on it, nor back in the field.
    const fieldValue = await readValue(driver, '#licenseKey');
    if (fieldValue !== '') {
      fail(
        `The reopened page put a value back in the licence field: ${JSON.stringify(fieldValue)}`,
      );
    }
    const pageText = await driver.execute(
      'return document.body.innerText + "\\n" + document.body.innerHTML;',
    );
    if (typeof pageText === 'string' && pageText.includes(PAID_LICENSE_KEY)) {
      fail('The reopened settings page renders the raw licence key');
    }
    record(
      'the raw key is nowhere on the reopened page',
      `field empty, masked as ${MASKED_SUFFIX}`,
    );

    // ---- failure phase: a bad key must not cost the reader the good one ----

    await typeInto(driver, '#licenseKey', WRONG_KEY, NAME.field);
    await clickElement(driver, '#saveLicenseKey', NAME.save);
    const rejected = await settledStatus(driver, 'the rejected key to be reported');
    if (rejected.startsWith('Licence validated')) {
      fail(`A key the server does not sell was accepted: ${rejected}`);
    }
    if (!rejected.includes('does not recognise')) {
      fail(`The rejection does not say what happened: ${rejected}`);
    }
    if (!rejected.includes('left unchanged')) {
      fail(`The rejection does not state that the working key survived: ${rejected}`);
    }
    record('a bad key is refused with a specific reason', rejected);

    // A mid-confirmation outage is the harder rollback: this candidate first
    // validates as paid, then every explicit-candidate subscription readback
    // returns 503 before durable or live adoption.
    await typeInto(driver, '#licenseKey', INTERRUPTED_LICENSE_KEY, NAME.field);
    await clickElement(driver, '#saveLicenseKey', NAME.save);
    const interrupted = await settledStatus(driver, 'the interrupted subscription to be reported');
    if (interrupted.startsWith('Licence validated')) {
      fail(`A candidate with no subscription readback was accepted: ${interrupted}`);
    }
    if (!interrupted.includes('HTTP 503')) {
      fail(`The network failure does not say what happened: ${interrupted}`);
    }
    if (!interrupted.includes('left unchanged')) {
      fail(`The network failure does not state that the working key survived: ${interrupted}`);
    }
    const interruptedAttempts = fixture.subscriptionRequests.filter(
      (request) => request.header === INTERRUPTED_LICENSE_KEY,
    );
    if (interruptedAttempts.length === 0) {
      fail('The rollback case never reached authenticated subscription confirmation');
    }
    record(
      'a mid-confirmation network failure kept the working key',
      `${interruptedAttempts.length} bounded subscription attempt(s) returned 503`,
    );

    if (PLANT === 'failed-overwrite') {
      // The exact regression this final reopen assertion must catch: a failed
      // candidate replaces the working durable key.
      await driver.executeAsync(
        `const [candidate, done] = arguments;
         browser.storage.local.set({ licenseKey: candidate }).then(done, done);`,
        [INTERRUPTED_LICENSE_KEY],
      );
      record('plant: failed candidate overwrote the working key', 'failed-overwrite');
    }

    await closeAndReopenSettings(driver);
    await openLicenseSection(driver);
    const survived = await waitFor(
      'the previously accepted licence to still be configured',
      async () => {
        const status = await readText(driver, '#licenseStatus');
        return status && status.length > 0 ? status : null;
      },
      { timeoutMs: 30_000 },
    );
    if (
      !survived.includes(MASKED_SUFFIX) ||
      !survived.includes('Pro') ||
      !survived.includes('412,500')
    ) {
      fail(`A failed validation cost the reader the licence that worked: ${survived}`);
    }
    record('the working licence survived both failed validations', survived);

    // Observer-side, after the public assertions: the extension buffer plus
    // geckodriver/Firefox output are the two retained log surfaces available to
    // this raw WebDriver harness.
    const logs = await driver
      .executeAsync(
        `const [done] = arguments;
         browser.runtime.sendMessage({ action: 'getLogs' }).then(
           (r) => done(JSON.stringify(r ?? null)),
           (e) => done(JSON.stringify({ error: String(e) })),
         );`,
      )
      .catch(() => null);
    const processLogs = driver.getProcessLogs();
    const leaked = rawKeys.find(
      (key) =>
        (typeof logs === 'string' && logs.includes(key)) ||
        (typeof processLogs === 'string' && processLogs.includes(key)),
    );
    if (leaked) fail('A raw licence key was written to retained extension/browser logs');
    record(
      'raw keys are absent from retained logs',
      `${(logs ?? '').length} extension bytes, ${processLogs.length} process bytes`,
    );

    const finalPage = await driver.execute(
      'return document.body.innerText + "\\n" + document.body.innerHTML;',
    );
    if (typeof finalPage === 'string' && rawKeys.some((key) => finalPage.includes(key))) {
      fail('The final reopened settings page renders a raw licence key');
    }
    if (fixture.licenseRequests.some((request) => request.header !== null)) {
      fail('At least one public validation request carried an X-License-Key header');
    }
    record(
      'all public validation calls used candidate body only',
      `${fixture.licenseRequests.length}`,
    );

    const classifyKey = (key) => {
      if (key === PAID_LICENSE_KEY) return 'paid-fixture-key';
      if (key === WRONG_KEY) return 'unknown-candidate';
      if (key === INTERRUPTED_LICENSE_KEY) return 'interrupted-candidate';
      return key === null ? 'none' : 'other-redacted';
    };
    const httpRecords = {
      validation: fixture.licenseRequests.map((request) => ({
        method: 'POST',
        path: '/api/v1/license/validate',
        candidate: classifyKey(request.body?.licenseKey ?? null),
        authHeader: classifyKey(request.header),
      })),
      subscription: fixture.subscriptionRequests.map((request) => ({
        method: 'GET',
        path: '/api/v1/subscription',
        authHeader: classifyKey(request.header),
      })),
    };

    mkdirSync(artifactDir, { recursive: true });
    await driver.execute(
      "document.getElementById('licenseStatus')?.scrollIntoView({ block: 'center' }); return true;",
    );
    await sleep(250);
    const screenshot = await driver.session('GET', '/screenshot');
    const screenshotPath = path.join(artifactDir, 'license-settings.png');
    writeFileSync(screenshotPath, Buffer.from(screenshot, 'base64'));

    writeReceipt({
      verdict: 'PASS',
      binary,
      firefoxVersion,
      geckodriverVersion,
      profileId,
      buildIdentity,
      fixture: { origin: fixture.origin, licenseMode },
      httpRecords,
      licenseRequests: fixture.licenseRequests.length,
      subscriptionRequests: fixture.subscriptionRequests.length,
      logEvidence: {
        extensionBytes: (logs ?? '').length,
        processBytes: processLogs.length,
        rawKeyMatches: 0,
      },
      resources: {
        gateNodeRssBytes: process.memoryUsage().rss,
        geckodriverPid: driver.proc?.pid ?? null,
        geckodriverRunning: driver.proc?.exitCode === null,
      },
      artifacts: [path.relative(repoRoot, screenshotPath)],
    });
    process.stdout.write(`\nlicense-settings-gate PASS at ${head()}\n`);
  } finally {
    await driver.quit();
    await fixture.close();
  }
}

function writeReceipt({
  verdict,
  binary = null,
  firefoxVersion = null,
  geckodriverVersion = null,
  profileId = null,
  buildIdentity = null,
  fixture = null,
  httpRecords = null,
  licenseRequests = null,
  subscriptionRequests = null,
  logEvidence = null,
  resources = null,
  artifacts = [],
  failure,
}) {
  mkdirSync(artifactDir, { recursive: true });
  const receipt = {
    receipt: 'license-settings-gate',
    verdict,
    head: head(),
    startedAt: steps[0]?.at ?? null,
    finishedAt: new Date().toISOString(),
    plant: PLANT || null,
    seed: GATE_SEED,
    seedUse:
      'Deterministic fixture/action campaign identity; this gate performs no stochastic actions.',
    replayCommand:
      `${PLANT ? `LICENSE_PLANT=${PLANT} ` : ''}` +
      `LICENSE_GATE_SEED=${GATE_SEED} node scripts/license-settings-gate.mjs`,
    // The claim this gate is allowed to make, and the ones it is not.
    provesPaidSettingsSurface: verdict === 'PASS',
    provesPaidSettingsSurfaceWhy:
      'A public actor opened settings through Unified Extensions, Proso, and "Open settings"; typed a licence key into the labelled field; pressed "Save & validate"; and saw the subscription tier and credits returned by an authenticated readback. Close/reopen retained only a mask, and both an unknown candidate and a pre-commit 503 left the working key intact.',
    provesPurchase: false,
    provesPurchaseWhy:
      'The fixture begins with a predetermined sold key. This gate never opens checkout, receives payment, issues a key, or reaches a deployed entitlement; it proves the extension side only.',
    internalDispatch: false,
    relaxations: [
      'extensions.webextensions.remote=false — inherited from the sibling journey gates; Firefox exposes no WebDriver handle for an out-of-process extension popup, so its accessible names cannot otherwise be addressed.',
      'The licence server is a local fixture speaking /api/v1/license/validate and /api/v1/subscription. This proves the extension side once a valid key exists, not purchase, issuance, deployment, or a production entitlement.',
      'Privileged extension-page navigation is used only before the actor boundary to seed the fixture server URL and reload the background. Every settings open/reopen in the measured journey uses Unified Extensions → Proso → Open settings.',
      'Raw geckodriver/Firefox process output and the extension log buffer are scanned. The Firefox Browser Console is not separately exported by this minimal W3C client.',
    ],
    commands: [
      { command: 'pnpm --filter @proso/extension build:firefox', exitCode: 0, precondition: true },
      {
        command: 'node scripts/license-settings-gate.mjs',
        exitCode: verdict === 'PASS' ? 0 : verdict === 'BLOCKED' ? 2 : 1,
      },
    ],
    build: buildIdentity ? { head: head(), ...buildIdentity } : null,
    browser: binary
      ? {
          binary,
          version: firefoxVersion,
          geckodriverVersion,
          headless: process.env.GATE_HEADED !== '1',
          isolatedProfileId: profileId,
        }
      : null,
    fixture,
    httpRecords,
    licenseRequests,
    subscriptionRequests,
    logEvidence,
    resources,
    actions,
    assertions: steps,
    artifacts,
    anomalies: [],
    ...(failure ? { failure } : {}),
  };
  writeFileSync(path.join(artifactDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}

main().catch((error) => {
  const isBlocked = error instanceof Blocked;
  const verdict = isBlocked ? 'BLOCKED' : 'FAIL';
  process.stderr.write(`\nlicense-settings-gate ${verdict}: ${error.message}\n`);
  writeReceipt({ verdict, failure: error.message });
  process.exitCode = isBlocked ? 2 : 1;
});
