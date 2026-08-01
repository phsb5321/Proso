/**
 * `make smoke-reading` — real-browser acceptance test for the reading journey.
 *
 * Loads the built Firefox MV2 artifact into a real Firefox, opens a
 * deterministic article, fires the shipped `playback-toggle` command, and
 * asserts the user-visible chain end to end:
 *
 *   fixture text -> extension command -> non-empty TTS request -> playing UI
 *   -> pause -> resume
 *
 * Nothing here is mocked inside the extension: the real extractor, the real
 * server API adapter, the real playback service and the real sticky footer all
 * run. The only test doubles are outside the browser — a local article and a
 * local Proso API stub — so severing any load-bearing boundary inside the
 * extension makes this command fail.
 *
 * @module scripts/smoke-reading
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startFixtureServer, ARTICLE_PARAGRAPHS } from './lib/reading-fixture-server.mjs';
import { launch, waitFor, sleep } from './lib/webdriver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const buildDir = path.join(repoRoot, 'packages/extension/.output/firefox-mv2');
const artifactDir = path.join(repoRoot, '.artifacts/smoke-reading');

/** Pinning the internal UUID makes `moz-extension://` addressable up front. */
const ADDON_ID = '{41eb66cb-b520-4047-9b6c-63fdce6fca11}';
const ADDON_UUID = '8b3f6f5a-2e1c-4a77-9f0d-4c2ab5d61b90';

const steps = [];

function record(name, detail) {
  steps.push({ name, detail, at: new Date().toISOString() });
  process.stdout.write(`  ok  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function fail(message) {
  throw new Error(message);
}

function head() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

/** The text a recorded synthesize request asked for, or '' when it carried none. */
function requestText(request) {
  const text = request.body?.text ?? request.body?.input ?? '';
  return typeof text === 'string' ? text : '';
}

/**
 * Read the reading state the user can actually see in the page.
 *
 * The sticky footer attaches a CLOSED shadow root, so its buttons are
 * unreachable from page script by design — that isolation keeps a hostile page
 * out of the extension's own UI, so the smoke reads around it rather than
 * asking for it to be opened. What the page does expose is the footer
 * container, the body padding the footer reserves, and the paragraph
 * highlight, which is the reading position the user watches move.
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

/**
 * Fire the shipped `playback-toggle` command.
 *
 * `browser.commands` shortcuts are matched inside the parent process by
 * `ExtensionShortcuts`, which never sees keys synthesized through the WebDriver
 * Actions endpoint: the content process does receive Alt+P (the page's own
 * keydown listener records it) and nothing further happens. So the smoke calls
 * the same `onCommand` entry point a matched shortcut calls, exercising the
 * extension's real command listener and every link downstream of it. The only
 * untested link is the OS-level key match itself.
 */
async function pressToggle(driver) {
  await driver.session('POST', '/moz/context', { context: 'chrome' });
  let outcome;
  try {
    outcome = await driver.execute(
      `const { ExtensionParent } = ChromeUtils.importESModule(
         'resource://gre/modules/ExtensionParent.sys.mjs',
       );
       const ext = ExtensionParent.GlobalManager.getExtension(arguments[0]);
       if (!ext) return 'extension not found in the parent process';
       const shortcuts = ext.shortcuts;
       if (!shortcuts || typeof shortcuts.onCommand !== 'function') {
         return 'extension exposes no command dispatch';
       }
       shortcuts.onCommand(arguments[1]);
       return 'ok';`,
      [ADDON_ID, 'playback-toggle'],
    );
  } finally {
    await driver.session('POST', '/moz/context', { context: 'content' });
  }
  if (outcome !== 'ok') {
    fail(`Could not fire the playback-toggle command: ${outcome}`);
  }
}

/**
 * Open an in-extension page and focus it.
 *
 * Firefox refuses `moz-extension://` navigation driven from content context, so
 * the tab is opened from chrome context with the system principal and then
 * driven normally.
 */
async function openExtensionPage(driver, url) {
  const before = await driver.session('GET', '/window/handles');
  await driver.session('POST', '/moz/context', { context: 'chrome' });
  try {
    await driver.execute(
      `const win = Services.wm.getMostRecentWindow('navigator:browser');
       const tab = win.gBrowser.addTab(arguments[0], {
         triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
       });
       win.gBrowser.selectedTab = tab;
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
  // readyState alone is not enough: the tab starts on an about:blank document
  // that reports "complete" before the moz-extension:// document replaces it, so
  // a readyState-only wait attaches to the wrong document and every WebExtension
  // global is missing. Wait for the target URL *and* the injected `browser` API.
  // Prefix, not equality: the settings page installs its own `#hash` on load.
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
 * Locate a Firefox to drive: `FIREFOX_BIN` wins, otherwise the first Firefox on
 * `PATH`. Fails loudly rather than silently skipping — an acceptance test that
 * self-disables when the browser is missing reports green on an unrun journey.
 *
 * @returns {string} Absolute path to a Firefox executable.
 */
function resolveFirefox() {
  const explicit = process.env.FIREFOX_BIN;
  if (explicit) {
    if (!existsSync(explicit)) {
      fail(`FIREFOX_BIN does not exist: ${explicit}`);
    }
    return explicit;
  }

  for (const name of ['firefox', 'firefox-nightly', 'firefox-developer-edition']) {
    try {
      return execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
    } catch {
      // Not on PATH under this name; try the next.
    }
  }

  return fail('No Firefox found on PATH. Set FIREFOX_BIN to a Firefox executable.');
}

async function main() {
  if (!existsSync(path.join(buildDir, 'manifest.json'))) {
    fail(`Missing Firefox build at ${buildDir}. Run: pnpm --filter @proso/extension build:firefox`);
  }
  record('firefox-mv2 build present', buildDir);

  const binary = resolveFirefox();

  const fixture = await startFixtureServer();
  record('fixture server started', fixture.origin);

  const driver = await launch({
    binary,
    headless: process.env.SMOKE_HEADED !== '1',
    // Opening the extension's own settings page needs chrome context.
    extraArgs: ['-remote-allow-system-access'],
    prefs: {
      // Address the extension pages deterministically.
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
      // Audio must be allowed to start without a user gesture in the page.
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

    // Point the extension at the local API before any page work happens.
    // Content-context navigation to moz-extension:// is refused by Firefox, so
    // the settings page is opened from chrome context with a system principal.
    await openExtensionPage(driver, `moz-extension://${ADDON_UUID}/settings.html`);
    await driver.executeAsync(
      `const [origin, done] = arguments;
       browser.storage.local
         .set({
           serverUrl: origin,
           provider: 'openai',
           licenseKey: null,
           cacheType: 'memory',
           // Slowest supported rate: the fixture clip is short, and reading the
           // whole article at 1.0x finishes before a pause/resume can be
           // observed at all.
           speed: 0.5,
         })
         .then(() => browser.storage.local.get(['serverUrl', 'provider']))
         .then(done);`,
      [fixture.origin],
    );
    record('extension configured for the local API', fixture.origin);

    // The background container reads its config once, at init, so a settings
    // write made after startup is invisible to the already-running services.
    // Reload the extension so it boots against the fixture API. `reload()`
    // discards this moz-extension:// tab, hence the re-attach below.
    await driver.execute('browser.runtime.reload(); return true;').catch(() => {});
    await sleep(3000);
    const liveHandles = await driver.session('GET', '/window/handles');
    await driver.session('POST', '/window', { handle: liveHandles[0] });
    record('extension reloaded against the fixture API');

    await driver.navigate(`${fixture.origin}/article`);
    await waitFor('content script injection', async () => {
      const injected = await driver.execute(
        "return Boolean(document.getElementById('proso-content-styles'));",
      );
      return injected === true;
    });
    record('content script injected into the fixture article');

    await pressToggle(driver);
    record('playback-toggle command fired');

    const first = await waitFor(
      'a TTS synthesize request',
      async () => (fixture.requests.length > 0 ? fixture.requests[0] : null),
      { timeoutMs: 30_000 },
    );
    if (typeof requestText(first) !== 'string' || requestText(first).trim().length === 0) {
      fail(`TTS request carried no text: ${JSON.stringify(first.body).slice(0, 300)}`);
    }

    // The extractor treats the article's `<h1>` as the first paragraph, so the
    // heading is legitimately synthesized before any body text. Assert on the
    // whole request stream rather than on request[0].
    const synthesize = await waitFor(
      'a TTS synthesize request carrying the article body',
      async () =>
        fixture.requests.find((request) =>
          ARTICLE_PARAGRAPHS.some((paragraph) =>
            requestText(request).includes(paragraph.slice(0, 60)),
          ),
        ) ?? null,
      { timeoutMs: 30_000 },
    );
    const requestedText = requestText(synthesize);
    record('non-empty TTS request carried the article text', `${requestedText.length} chars`);

    // `/execute/sync` runs the script as a function BODY, so the IIFE result
    // has to be returned explicitly or every read comes back undefined.
    const readPage = () => driver.execute(`return (() => {${READ_PAGE}})();`);

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

    // Pause holds the reading position; finishing or stopping clears it. So a
    // highlight that is both UNCHANGED and still present is what separates
    // "paused" from "playback ended", which is the distinction that matters.
    await pressToggle(driver);
    await sleep(1500);
    const pausedAt = (await readPage()).highlighted[0] ?? null;
    if (!pausedAt) {
      fail('Pausing cleared the reading position instead of holding it');
    }
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

    await pressToggle(driver);
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
    const screenshotPath = path.join(artifactDir, 'reading-journey.png');
    writeFileSync(screenshotPath, Buffer.from(screenshot, 'base64'));

    const receipt = {
      receipt: 'smoke-reading',
      head: head(),
      startedAt: steps[0]?.at ?? null,
      finishedAt: new Date().toISOString(),
      commands: [
        {
          command: 'pnpm --filter @proso/extension build:firefox',
          exitCode: 0,
          precondition: true,
        },
        { command: 'node scripts/smoke-reading.mjs', exitCode: 0 },
      ],
      browser: { binary, headless: process.env.SMOKE_HEADED !== '1' },
      ttsRequests: fixture.requests.length,
      steps,
      artifacts: [path.relative(repoRoot, screenshotPath)],
    };
    const receiptPath = path.join(artifactDir, 'receipt.json');
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    record('receipt written', path.relative(repoRoot, receiptPath));

    process.stdout.write(`\nsmoke-reading PASS at ${receipt.head}\n`);
  } finally {
    await driver.quit();
    await fixture.close();
  }
}

main().catch((error) => {
  process.stderr.write(`\nsmoke-reading FAIL: ${error.message}\n`);
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    path.join(artifactDir, 'receipt.json'),
    `${JSON.stringify(
      {
        receipt: 'smoke-reading',
        head: head(),
        finishedAt: new Date().toISOString(),
        commands: [{ command: 'node scripts/smoke-reading.mjs', exitCode: 1 }],
        failure: error.message,
        steps,
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
