/**
 * `make public-actor-plants` — prove the public-actor gate can fail.
 *
 * A green harness is evidence of nothing until each of its assertions has been
 * shown to catch a break. This runner severs one link per run and requires the
 * gate to report the expected verdict — BLOCKED for a control the actor could
 * not reach, FAIL for a control that worked while the journey did not follow.
 *
 * A plant that comes back PASS is the failure this script exists to catch: it
 * means the assertion guarding that link asserts nothing.
 *
 * @module scripts/public-actor-plants
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const artifactDir = path.join(repoRoot, '.artifacts/public-actor-gate');

/** Exit code -> verdict, matching `scripts/public-actor-gate.mjs`. */
const VERDICT = { 0: 'PASS', 1: 'FAIL', 2: 'BLOCKED' };

/**
 * One entry per assertion the gate makes. `expect` is the verdict the severed
 * link must produce; `guards` names the assertion under test.
 */
const PLANTS = [
  { plant: '', expect: 'PASS', guards: 'the unsevered journey (control run)' },
  {
    plant: 'panel',
    expect: 'BLOCKED',
    guards: 'the Unified Extensions button is reachable',
  },
  {
    plant: 'button',
    expect: 'BLOCKED',
    guards: 'the Proso browser action exists in the panel',
  },
  {
    plant: 'popup',
    expect: 'BLOCKED',
    guards: 'the browser action opens a popup document',
  },
  {
    plant: 'play-name',
    expect: 'BLOCKED',
    guards: 'popup controls are addressable by accessible name',
  },
  {
    plant: 'tts',
    expect: 'FAIL',
    guards: 'the public click produces a TTS request for the article',
  },
  {
    plant: 'footer',
    expect: 'FAIL',
    guards: 'reading state becomes visible in the page',
  },
  {
    plant: 'pause',
    expect: 'FAIL',
    guards: 'pausing holds the reading position',
  },
  {
    plant: 'resume',
    expect: 'FAIL',
    guards: 'resuming advances the reading position',
  },
];

function runGate(plant) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/public-actor-gate.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, PUBLIC_ACTOR_PLANT: plant },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      out += chunk;
    });
    child.on('close', (code) => resolve({ code, out }));
  });
}

async function main() {
  const results = [];
  for (const entry of PLANTS) {
    const label = entry.plant || '(none)';
    process.stdout.write(`\n=== plant ${label} — expect ${entry.expect} ===\n`);
    const { code, out } = await runGate(entry.plant);
    const verdict = VERDICT[code] ?? `EXIT_${code}`;
    // The last non-empty line carries the verdict and, when red, its reason.
    const reason =
      out
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .pop() ?? '';
    const caught = verdict === entry.expect;
    results.push({ ...entry, verdict, caught, reason: reason.trim() });
    process.stdout.write(`${caught ? '  caught' : '  MISSED'} — ${verdict}: ${reason.trim()}\n`);
  }

  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    path.join(artifactDir, 'plants.json'),
    `${JSON.stringify({ receipt: 'public-actor-plants', at: new Date().toISOString(), results }, null, 2)}\n`,
  );

  const missed = results.filter((r) => !r.caught);
  process.stdout.write('\n--- plant sweep ---\n');
  for (const r of results) {
    process.stdout.write(
      `  ${r.caught ? 'caught ' : 'MISSED '} ${String(r.plant || '(none)').padEnd(10)} ` +
        `expected ${r.expect.padEnd(7)} got ${r.verdict.padEnd(7)} — ${r.guards}\n`,
    );
  }
  if (missed.length > 0) {
    process.stderr.write(
      `\npublic-actor-plants FAIL: ${missed.length} assertion(s) did not catch their break: ` +
        `${missed.map((r) => r.plant || '(none)').join(', ')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`\npublic-actor-plants PASS — ${results.length} runs, every break caught\n`);
}

main();
