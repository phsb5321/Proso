#!/usr/bin/env node
/**
 * `make brand-site-plants` — prove the site identity gate can fail.
 *
 * A green harness is evidence of nothing until each of its assertions has been
 * shown to catch a break. Feature 166 replaced the retired wa-era favicon and
 * the pre-rebrand og-image on the public site; this runner swaps those retired
 * assets (and a plausible-but-untracked og-image) back in, one plant per run,
 * and requires `scripts/verify-brand-assets.mjs` to go red NAMING the planted
 * asset. A plant that comes back PASS is the failure this script exists to
 * catch: it means the assertion guarding that surface asserts nothing.
 *
 * The retired assets are snapshotted from git history at the pre-161 commit
 * (`ff0575f`) rather than committed as fixtures: the retired og-image declares
 * a product name that no longer exists anywhere in the repository, and this
 * plant harness must not reintroduce it into the working tree. The commit is
 * an ancestor of `main`, so the snapshot is available in every clone.
 *
 * Scoring reads the gate's own verdict line rather than its exit code, and the
 * sweep ends with a final gate run proving the assets were restored and
 * canonical — a gate that never started is never counted as a caught plant
 * (inherited from `scripts/public-actor-plants.mjs`).
 *
 * @module scripts/brand-site-plants
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const siteImages = path.join(repoRoot, 'packages/site', 'assets', 'images');
const artifactDir = path.join(repoRoot, '.artifacts', 'brand-site-gate');

/** The last commit before Feature 161; the retired site assets live here. */
const RETIRED_COMMIT = 'ff0575f';

/**
 * The banner the gate prints for itself. An exit code alone cannot be trusted:
 * a gate that crashed before it ran — a deleted file, a killed process, an
 * import error — also exits 1, which is exactly the code an expected FAIL
 * produces. Requiring the gate's own verdict line separates "ran and went red"
 * from "never ran".
 */
const VERDICT_LINE = /^brand assets: (PASS|FAIL)\b[: ]?(.*)$/m;

const ASSETS = ['favicon.png', 'og-image.svg', 'og-image.png'];

function fail(message) {
  throw new Error(message);
}

function gitShow(commit, relative) {
  const result = spawnSync('git', ['show', `${commit}:packages/site/assets/images/${relative}`], {
    cwd: repoRoot,
    encoding: null,
  });
  if (result.status !== 0) fail(`git show ${commit}:${relative} failed`);
  return result.stdout;
}

function snapshot(originals) {
  for (const relative of ASSETS) {
    originals.set(relative, gitShow('HEAD', relative));
  }
}

function restore(originals) {
  for (const relative of ASSETS) {
    const file = path.join(siteImages, relative);
    if (!originals.has(relative)) fail(`no original snapshot for ${relative}`);
    writeFileSync(file, originals.get(relative));
  }
}

function runGate() {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ['scripts/verify-brand-assets.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('close', (code) => resolvePromise({ code, output }));
  });
}

/**
 * One entry per surface the gate guards. `expect` is the verdict the severed
 * link must produce; `guards` names the assertion under test; `names` lists
 * the asset tokens the failure message must mention (the "fails by name"
 * requirement — a red gate that cannot say WHICH asset is stale is not enough).
 */
const PLANTS = [
  { plant: '', expect: 'PASS', guards: 'the unplanted site identity (control run)', names: [] },
  {
    plant: 'retired-favicon',
    expect: 'FAIL',
    guards: 'the retired wa-era favicon is rejected',
    names: ['favicon'],
  },
  {
    plant: 'retired-og-image',
    expect: 'FAIL',
    guards: 'the retired pre-rebrand og-image is rejected',
    names: ['og-image'],
  },
  {
    plant: 'untracked-og-svg',
    expect: 'FAIL',
    guards: 'a plausible but non-canonical og-image.svg is rejected',
    names: ['og-image'],
  },
];

function plant(plantName) {
  const retiredFavicon = gitShow(RETIRED_COMMIT, 'favicon.png');
  const retiredOgSvg = gitShow(RETIRED_COMMIT, 'og-image.svg');
  const retiredOgPng = gitShow(RETIRED_COMMIT, 'og-image.png');

  if (plantName === 'retired-favicon') {
    writeFileSync(path.join(siteImages, 'favicon.png'), retiredFavicon);
  } else if (plantName === 'retired-og-image') {
    writeFileSync(path.join(siteImages, 'og-image.svg'), retiredOgSvg);
    writeFileSync(path.join(siteImages, 'og-image.png'), retiredOgPng);
  } else if (plantName === 'untracked-og-svg') {
    // Structurally plausible composition with an unapproved canvas colour —
    // a hand-tuned parallel identity, exactly what the freshness gate exists
    // to reject.
    const ogSvg = readFileSync(path.join(siteImages, 'og-image.svg'), 'utf8');
    writeFileSync(
      path.join(siteImages, 'og-image.svg'),
      ogSvg.replace('fill="#010616"', 'fill="#112233"'),
    );
  } else {
    fail(`unknown plant ${plantName}`);
  }
}

async function main() {
  mkdirSync(artifactDir, { recursive: true });
  const originals = new Map();
  snapshot(originals);
  const results = [];
  let restoredOk = false;

  try {
    for (const entry of PLANTS) {
      if (entry.plant) plant(entry.plant);
      const { code, output } = await runGate();
      const match = output.match(VERDICT_LINE);
      const verdict = match ? match[1] : 'NEVER-RAN';
      const message = match ? match[2].trim() : output.trim().slice(-200);
      const named = entry.names.every((token) => output.toLowerCase().includes(token));
      const caught =
        verdict === entry.expect && (entry.expect === 'PASS' ? code === 0 : code !== 0 && named);

      results.push({
        plant: entry.plant || 'control',
        guards: entry.guards,
        expect: entry.expect,
        verdict,
        named,
        code,
        message,
        caught,
      });
      console.log(
        `plant ${entry.plant || 'control'}: ${caught ? 'CAUGHT' : 'FAILED'} — gate ${verdict} ` +
          `(expected ${entry.expect}${entry.names.length ? `, naming ${entry.names.join('/')}` : ''})`,
      );
      if (entry.expect === 'FAIL' && !caught) {
        console.log(`  gate output: ${message}`);
      }
      // Restore between plants so one planted asset never leaks into the next
      // gate run (restore is idempotent; the finally below is a safety net).
      restore(originals);
    }

    // Proven restoration, not just intent: after every plant the gate must
    // come back green on the restored canonical assets.
    const restored = await runGate();
    const restoredMatch = restored.output.match(VERDICT_LINE);
    restoredOk = restoredMatch && restoredMatch[1] === 'PASS' && restored.code === 0;
    results.push({
      plant: 'post-restore',
      guards: 'the assets are restored and canonical after every plant',
      expect: 'PASS',
      verdict: restoredMatch ? restoredMatch[1] : 'NEVER-RAN',
      named: true,
      code: restored.code,
      message: restoredMatch ? restoredMatch[2].trim() : '',
      caught: restoredOk,
    });
    console.log(
      `plant post-restore: ${restoredOk ? 'CAUGHT' : 'FAILED'} — gate ${restoredMatch ? restoredMatch[1] : 'NEVER-RAN'} (expected PASS)`,
    );
  } finally {
    restore(originals);
  }

  writeFileSync(
    path.join(artifactDir, 'plants.json'),
    JSON.stringify({ results, restored: restoredOk, retiredCommit: RETIRED_COMMIT }, null, 2),
  );

  const allCaught = results.every((result) => result.caught);
  if (!allCaught) fail('one or more planted breaks came back green or mis-named');
  console.log(
    `brand-site plants: ${results.length}/${results.length} surfaces fail closed (receipt .artifacts/brand-site-gate/plants.json)`,
  );
}

try {
  await main();
} catch (error) {
  console.error(
    `brand-site plants: FAIL — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
