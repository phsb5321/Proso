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
 * The sweep scores a run by the verdict the gate prints for itself, not by its
 * exit code, and ends with a self-check proving it can still tell a gate that
 * never started from one that ran and went red.
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
 * The banner the gate prints for itself. An exit code alone cannot be trusted:
 * a gate that crashed before it ran — a deleted file, a killed process, an
 * import error — also exits 1, which is exactly the code an expected FAIL
 * produces. Measured on 05/08/2026: a worktree removed mid-sweep made four
 * plants exit 1 with `MODULE_NOT_FOUND`, and a code-only reading scored all
 * four as caught while the harness never started. Requiring the gate's own
 * verdict line is what separates "ran and went red" from "never ran".
 */
const VERDICT_LINE = /^public-actor-gate (PASS|FAIL|BLOCKED)\b[: ]?(.*)$/m;

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

function runGate(plant, script = 'scripts/public-actor-gate.mjs') {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
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

/**
 * Read the gate's own verdict out of a run.
 *
 * `CRASH` means the gate never reported one, whatever the exit code was. It is
 * never equal to an expected verdict, so a crashed run can never be scored as
 * caught.
 */
function readVerdict({ code, out }) {
  const match = out.match(VERDICT_LINE);
  if (!match) {
    const tail =
      out
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .pop() ?? '(no output)';
    return { verdict: 'CRASH', reason: `gate printed no verdict (exit ${code}): ${tail.trim()}` };
  }
  const [, verdict, rest] = match;
  const byCode = VERDICT[code];
  if (byCode && byCode !== verdict) {
    return {
      verdict: 'CRASH',
      reason: `gate said ${verdict} but exited ${code} (${byCode})`,
    };
  }
  return { verdict, reason: rest.trim() || verdict };
}

async function main() {
  const results = [];
  for (const entry of PLANTS) {
    const label = entry.plant || '(none)';
    process.stdout.write(`\n=== plant ${label} — expect ${entry.expect} ===\n`);
    const run = await runGate(entry.plant);
    const { verdict, reason } = readVerdict(run);
    const caught = verdict === entry.expect;
    results.push({ ...entry, verdict, caught, reason });
    process.stdout.write(`${caught ? '  caught' : '  MISSED'} — ${verdict}: ${reason}\n`);
  }

  // Self-check: the sweep is only trustworthy if it can tell a gate that never
  // ran from a gate that ran and went red. Point it at a script that does not
  // exist — node exits 1, the same code an expected FAIL produces — and require
  // CRASH. Before this check existed, that run scored as caught.
  const selfCheck = readVerdict(await runGate('', 'scripts/public-actor-gate.missing.mjs'));
  const selfCheckOk = selfCheck.verdict === 'CRASH';
  process.stdout.write(
    '\n=== self-check: a gate that never ran ===\n' +
      `${selfCheckOk ? '  ok' : '  BROKEN'} — ${selfCheck.verdict}: ${selfCheck.reason}\n`,
  );
  results.push({
    plant: '(self-check)',
    expect: 'CRASH',
    guards: 'a gate that never ran is never scored as caught',
    verdict: selfCheck.verdict,
    caught: selfCheckOk,
    reason: selfCheck.reason,
  });

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
