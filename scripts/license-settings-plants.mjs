/**
 * `make license-settings-plants` — prove the licence settings gate can fail.
 *
 * A green harness is evidence of nothing until each of its assertions has been
 * shown to catch a break. This runner severs one link per run and requires the
 * gate to report the expected verdict — BLOCKED for a control the actor could
 * not reach, FAIL for a control that worked while the journey did not follow.
 *
 * A plant that comes back PASS is the failure this script exists to catch: it
 * means the assertion guarding that link asserts nothing.
 *
 * Scoring reads the gate's own verdict line rather than its exit code, and the
 * sweep ends with a self-check proving a gate that never started is never
 * counted as a caught plant. Both rules are inherited from
 * `scripts/public-actor-plants.mjs`, where scoring by exit code once counted
 * four crashed runs as caught plants.
 *
 * @module scripts/license-settings-plants
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const artifactDir = path.join(repoRoot, '.artifacts/license-settings-gate');

/** Exit code -> verdict, matching `scripts/license-settings-gate.mjs`. */
const VERDICT = { 0: 'PASS', 1: 'FAIL', 2: 'BLOCKED' };

/** The banner the gate prints for itself; an exit code alone is not trusted. */
const VERDICT_LINE = /^license-settings-gate (PASS|FAIL|BLOCKED)\b[: ]?(.*)$/m;

/**
 * One entry per assertion the gate makes. `expect` is the verdict the severed
 * link must produce; `guards` names the assertion under test.
 */
const PLANTS = [
  { plant: '', expect: 'PASS', guards: 'the unsevered paid-account journey (control run)' },
  {
    plant: 'unknown-key',
    expect: 'FAIL',
    guards: 'an unrecognised key is never reported as a configured plan (INV-001: unknown is Free)',
  },
  {
    plant: 'subscription-free',
    expect: 'FAIL',
    guards: 'a paid validation response is not believed when the subscription route says Free',
  },
  {
    plant: 'validate-500',
    expect: 'FAIL',
    guards: 'a failing licence service is a visible failure, never a pass',
  },
  {
    plant: 'subscription-no-credits',
    expect: 'FAIL',
    guards: 'paid success requires the current balance from authenticated readback',
  },
  {
    plant: 'forget-key',
    expect: 'FAIL',
    guards:
      'the key is persisted through the config path — a reported success that saved nothing is caught on reopen',
  },
  {
    plant: 'failed-overwrite',
    expect: 'FAIL',
    guards: 'a failed candidate cannot replace the previously working durable key',
  },
  {
    plant: 'settings-name',
    expect: 'BLOCKED',
    guards: 'settings are opened through the popup control by its accessible name',
  },
  {
    plant: 'save-name',
    expect: 'BLOCKED',
    guards: 'the save control is addressed by the public name it carries',
  },
];

function runGate(plant, script = 'scripts/license-settings-gate.mjs') {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      env: { ...process.env, LICENSE_PLANT: plant },
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
    return { verdict: 'CRASH', reason: `gate said ${verdict} but exited ${code} (${byCode})` };
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

  const selfCheck = readVerdict(await runGate('', 'scripts/license-settings-gate.missing.mjs'));
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
    `${JSON.stringify({ receipt: 'license-settings-plants', at: new Date().toISOString(), results }, null, 2)}\n`,
  );

  const missed = results.filter((r) => !r.caught);
  process.stdout.write('\n--- plant sweep ---\n');
  for (const r of results) {
    process.stdout.write(
      `  ${r.caught ? 'caught ' : 'MISSED '} ${String(r.plant || '(none)').padEnd(18)} ` +
        `expected ${r.expect.padEnd(7)} got ${r.verdict.padEnd(7)} — ${r.guards}\n`,
    );
  }
  if (missed.length > 0) {
    process.stderr.write(
      `\nlicense-settings-plants FAIL: ${missed.length} assertion(s) did not catch their break: ` +
        `${missed.map((r) => r.plant || '(none)').join(', ')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `\nlicense-settings-plants PASS — ${results.length} runs, every break caught\n`,
  );
}

main();
