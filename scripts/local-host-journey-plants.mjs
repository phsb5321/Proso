/**
 * `make local-host-journey-plants` — prove the local-host journey gate can fail.
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
 * never started from one that ran and went red. Both rules are inherited from
 * `scripts/public-actor-plants.mjs`, where scoring by exit code once counted
 * four crashed runs as caught plants.
 *
 * @module scripts/local-host-journey-plants
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from './lib/reading-fixture-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const artifactDir = path.join(repoRoot, '.artifacts/local-host-journey-gate');

/** Exit code -> verdict, matching `scripts/local-host-journey-gate.mjs`. */
const VERDICT = { 0: 'PASS', 1: 'FAIL', 2: 'BLOCKED' };

/** The banner the gate prints for itself; an exit code alone is not trusted. */
const VERDICT_LINE = /^local-host-journey-gate (PASS|FAIL|BLOCKED)\b[: ]?(.*)$/m;

/**
 * One entry per assertion the gate makes. `expect` is the verdict the severed
 * link must produce; `guards` names the assertion under test.
 */
const PLANTS = [
  { plant: '', expect: 'PASS', guards: 'the unsevered account-free journey (control run)' },
  {
    plant: '',
    label: 'continue-control',
    expect: 'PASS',
    env: { LOCAL_HOST_TAB_BEHAVIOR: 'continue' },
    guards: 'the public opt-out preserves background playback across tab activation',
  },
  {
    plant: 'tab-stop-disabled',
    expect: 'FAIL',
    guards: 'the enabled default must stop the old reading session on tab activation',
  },
  {
    plant: 'server-route',
    expect: 'FAIL',
    guards: 'audio comes from the reader\u2019s host, not the managed route (PROSO-135/136)',
  },
  {
    plant: 'no-enable',
    expect: 'FAIL',
    guards: 'storing an address alone never routes audio to it — enabling is load-bearing',
  },
  {
    plant: 'host-down',
    expect: 'FAIL',
    guards: 'an unreachable host is a failure, never a pass',
  },
  {
    plant: 'enable-name',
    expect: 'BLOCKED',
    guards: 'the enable control is addressed by the public name it carries',
  },
  {
    plant: 'stale-cleanup',
    expect: 'FAIL',
    guards: 'obsolete page-player roots are gone before playback starts',
  },
  {
    plant: 'approximate-label',
    expect: 'FAIL',
    guards: 'the no-marks route is visibly labelled approximate',
  },
  {
    plant: 'tools-name',
    expect: 'BLOCKED',
    guards: 'the Tools panel is reached by its public tab name',
  },
  {
    plant: 'queue-add-hidden',
    expect: 'BLOCKED',
    guards: 'Queue exposes a usable public Add control',
  },
  {
    plant: 'double-prefetch',
    expect: 'FAIL',
    guards: 'chunked playback is the only speculative local request path',
  },
  {
    plant: 'list-in-nav',
    expect: 'FAIL',
    guards: "the article's own list is read, and a list in a landmark is not",
  },
];

const REAL_HOST_PLANTS = [
  {
    plant: 'real-host-alternate-voices',
    expect: 'PASS',
    voices: [
      {
        id: 'alternate-english-voice',
        language: 'en-US',
        mediaTypes: ['audio/wav'],
        markKinds: [],
      },
    ],
    guards: 'real-host adoption comes from capabilities, not fixture-specific voice ids',
  },
  {
    plant: 'real-host-empty-voices',
    expect: 'BLOCKED',
    voices: [],
    guards: 'a ready real host that publishes no voice is blocked before browser launch',
  },
];

function runGate(plant, script = 'scripts/local-host-journey-gate.mjs', extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv, LOCAL_HOST_PLANT: plant },
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
    const label = (entry.label ?? entry.plant) || '(none)';
    process.stdout.write(`\n=== plant ${label} — expect ${entry.expect} ===\n`);
    const run = await runGate(entry.plant, 'scripts/local-host-journey-gate.mjs', entry.env);
    const { verdict, reason } = readVerdict(run);
    const caught = verdict === entry.expect;
    results.push({ ...entry, verdict, caught, reason });
    process.stdout.write(`${caught ? '  caught' : '  MISSED'} — ${verdict}: ${reason}\n`);
  }

  for (const entry of REAL_HOST_PLANTS) {
    process.stdout.write(`\n=== plant ${entry.plant} — expect ${entry.expect} ===\n`);
    const host = await startFixtureServer({ localHostVoices: entry.voices });
    let run;
    try {
      run = await runGate('', 'scripts/local-host-journey-gate.mjs', {
        LOCAL_HOST_APPLIANCE_URL: host.origin,
      });
    } finally {
      await host.close();
    }
    const { verdict, reason } = readVerdict(run);
    const caught = verdict === entry.expect;
    results.push({ ...entry, voices: undefined, verdict, caught, reason });
    process.stdout.write(`${caught ? '  caught' : '  MISSED'} — ${verdict}: ${reason}\n`);
  }

  const selfCheck = readVerdict(await runGate('', 'scripts/local-host-journey-gate.missing.mjs'));
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
    `${JSON.stringify({ receipt: 'local-host-journey-plants', at: new Date().toISOString(), results }, null, 2)}\n`,
  );

  const missed = results.filter((r) => !r.caught);
  process.stdout.write('\n--- plant sweep ---\n');
  for (const r of results) {
    process.stdout.write(
      `  ${r.caught ? 'caught ' : 'MISSED '} ${String(r.plant || '(none)').padEnd(13)} ` +
        `expected ${r.expect.padEnd(7)} got ${r.verdict.padEnd(7)} — ${r.guards}\n`,
    );
  }
  if (missed.length > 0) {
    process.stderr.write(
      `\nlocal-host-journey-plants FAIL: ${missed.length} assertion(s) did not catch their break: ` +
        `${missed.map((r) => r.plant || '(none)').join(', ')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `\nlocal-host-journey-plants PASS — ${results.length} runs, every break caught\n`,
  );
}

main();
