/**
 * `make hover-affordance-gate` — does a paragraph stay clickable after the
 * page it lives on changes?
 *
 * Feature 229 marks every extracted paragraph with `.proso-hoverable` exactly
 * once, from a single `requestIdleCallback` at content-script start. A reader
 * on a client-routed documentation site (the report this gate came from was on
 * a Docusaurus docs page) navigates without a document load: the article is
 * replaced, the content script is not restarted, and nothing re-marks. This
 * gate drives a real Firefox with the built extension and measures the
 * affordance before and after such a swap.
 *
 * It asserts the hover contract only — the paint-only class and the cursor a
 * reader sees — not playback. Verdicts are three-valued:
 *   PASS (0)    paragraphs are hoverable on load AND after the article is
 *               replaced in place.
 *   FAIL (1)    the browser ran the journey and the affordance was missing.
 *   BLOCKED (2) build, browser, driver, or fixture missing — never a pass.
 *
 * @module scripts/hover-affordance-gate
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Blocked, JOURNEY_PREFS, blocked, resolveFirefox } from './lib/firefox-popup.mjs';
import { startFixtureServer } from './lib/reading-fixture-server.mjs';
import { launch, sleep, waitFor } from './lib/webdriver.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const buildDir = path.join(repoRoot, 'packages/extension/.output/firefox-mv2');
const artifactDir = path.join(repoRoot, '.artifacts/hover-affordance-gate');

const checks = [];
let failed = 0;

function record(label, detail = '') {
  checks.push({ label, detail, ok: true });
  console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  checks.push({ label, detail, ok: false });
  failed += 1;
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Count marked paragraphs that are actually in the live document. */
const COUNT_HOVERABLE = `
  const marked = Array.from(document.querySelectorAll('.proso-hoverable'));
  const attached = marked.filter((el) => document.body.contains(el));
  return {
    marked: marked.length,
    attached: attached.length,
    cursor: attached.length > 0 ? getComputedStyle(attached[0]).cursor : null,
    articleParagraphs: document.querySelectorAll('article p').length,
  };
`;

/**
 * Replace the article body the way a client-side router does: same document,
 * new paragraph nodes, no navigation event the content script boots on.
 */
const SWAP_ARTICLE = `
  const article = document.querySelector('article');
  if (!article) return false;
  article.replaceChildren();
  for (let i = 0; i < 6; i += 1) {
    const p = document.createElement('p');
    p.textContent =
      'Routed paragraph ' + i + ' arrived without a document load, which is how a ' +
      'client-side router replaces an article while the content script keeps running.';
    article.appendChild(p);
  }
  return true;
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
    prefs: JOURNEY_PREFS,
  });

  try {
    await driver.installAddon(buildDir);
    record('built extension installed in Firefox');

    await driver.navigate(`${fixture.origin}/article`);
    await waitFor('content script injection', async () => {
      const injected = await driver.execute(
        "return Boolean(document.getElementById('proso-content-styles'));",
      );
      return injected === true;
    });
    record('content script injected into the fixture article');

    const onLoad = await waitFor(
      'the idle hover pass to mark the article',
      async () => {
        const seen = await driver.execute(`return (() => {${COUNT_HOVERABLE}})();`);
        return seen.attached > 0 ? seen : null;
      },
      { timeoutMs: 15_000 },
    ).catch(() => driver.execute(`return (() => {${COUNT_HOVERABLE}})();`));

    if (onLoad.attached > 0) {
      record('paragraphs are hoverable on load', `${onLoad.attached} marked`);
    } else {
      fail(
        'paragraphs are hoverable on load',
        `0 of ${onLoad.articleParagraphs} article paragraphs marked`,
      );
    }

    if (onLoad.cursor === 'pointer') {
      record('a marked paragraph reads as clickable', `cursor: ${onLoad.cursor}`);
    } else {
      fail('a marked paragraph reads as clickable', `cursor: ${onLoad.cursor ?? 'none marked'}`);
    }

    const swapped = await driver.execute(`return (() => {${SWAP_ARTICLE}})();`);
    if (swapped !== true) blocked('The fixture article has no <article> element to replace');
    record('article replaced in place (client-side route change)');

    const afterSwap = await waitFor(
      'the affordance to reach the routed paragraphs',
      async () => {
        const seen = await driver.execute(`return (() => {${COUNT_HOVERABLE}})();`);
        return seen.attached > 0 ? seen : null;
      },
      { timeoutMs: 10_000 },
    ).catch(() => driver.execute(`return (() => {${COUNT_HOVERABLE}})();`));

    if (afterSwap.attached > 0) {
      record('paragraphs are hoverable after a route change', `${afterSwap.attached} marked`);
    } else {
      fail(
        'paragraphs are hoverable after a route change',
        `0 of ${afterSwap.articleParagraphs} routed paragraphs marked`,
      );
    }

    // Stable counts alone miss count-neutral churn. Observe actual writes in
    // this otherwise idle fixture as well as node counts and responsiveness.
    await driver.execute(`
      window.hoverIdleMutations = 0;
      window.hoverIdleObserver = new MutationObserver(records => {
        window.hoverIdleMutations += records.length;
      });
      window.hoverIdleObserver.observe(document.querySelector('article'), {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
      });
    `);
    await sleep(3000);
    const idleMutations = await driver.execute(`
      window.hoverIdleMutations += window.hoverIdleObserver.takeRecords().length;
      window.hoverIdleObserver.disconnect();
      return window.hoverIdleMutations;
    `);
    if (idleMutations === 0) {
      record('the idle article has no repeated DOM writes', '0 mutations over 3s');
    } else {
      fail('the idle article has no repeated DOM writes', `${idleMutations} mutations over 3s`);
    }
    const startedAt = Date.now();
    const settled = await driver.execute(`return (() => {${COUNT_HOVERABLE}})();`);
    const responseMs = Date.now() - startedAt;

    if (settled.attached === afterSwap.attached) {
      record('the marked paragraph count stays stable while idle', `${settled.attached} marked`);
    } else {
      fail(
        'the marked paragraph count stays stable while idle',
        `${afterSwap.attached} → ${settled.attached} marked while the page was idle`,
      );
    }

    if (responseMs < 2000) {
      record('the page main thread is still responsive', `${responseMs}ms`);
    } else {
      fail('the page main thread is still responsive', `${responseMs}ms to run a trivial script`);
    }

    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      path.join(artifactDir, 'receipt.json'),
      `${JSON.stringify({ checks, onLoad, afterSwap, settled, idleMutations, responseMs }, null, 2)}\n`,
    );
  } finally {
    await driver.quit().catch(() => {});
    await fixture.close();
    await sleep(200);
  }

  const verdict = failed === 0 ? 'PASS' : 'FAIL';
  console.log(`hover-affordance-gate ${verdict} — ${checks.length} check(s), ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  if (error instanceof Blocked) {
    console.error(`hover-affordance-gate BLOCKED — ${error.message}`);
    process.exit(2);
  }
  console.error(`hover-affordance-gate BLOCKED — ${error?.stack ?? error}`);
  process.exit(2);
});
