import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const cases = [
  { plant: '', verdict: 'PASS', code: 0, failure: null },
  { plant: 'voice', verdict: 'FAIL', code: 1, failure: 'synthesis uses selected voice Atlas' },
  { plant: 'retry', verdict: 'FAIL', code: 1, failure: 'Play retries the failed voice/paragraph' },
];
const directory = path.resolve('.artifacts/reader-controls-gate');
mkdirSync(directory, { recursive: true });

function matches(result, expected, startedAt) {
  const receipt = result.receipt;
  return (
    !result.signal &&
    receipt?.verdict === expected.verdict &&
    result.code === expected.code &&
    receipt.exitCode === result.code &&
    receipt.plant === expected.plant &&
    Date.parse(receipt.startedAt) >= startedAt &&
    (expected.failure ? receipt.failure?.includes(expected.failure) : receipt.failure === null)
  );
}
assert.equal(
  matches({ code: 1, receipt: null }, cases[1], Date.now()),
  false,
  'a crash is not a caught plant',
);
assert.equal(
  matches(
    {
      code: 1,
      receipt: {
        verdict: 'FAIL',
        exitCode: 1,
        plant: 'voice',
        startedAt: '2000-01-01',
        failure: cases[1].failure,
      },
    },
    cases[1],
    Date.now(),
  ),
  false,
  'a stale receipt is not evidence',
);

const results = await Promise.all(
  cases.map(
    (entry) =>
      new Promise((resolve) => {
        const startedAt = Date.now();
        const child = spawn(process.execPath, ['scripts/local-host-journey-gate.mjs'], {
          env: { ...process.env, READER_CONTROLS: '1', FOOTER_CONTROLS_PLANT: entry.plant },
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        const capture = (data) => {
          output = (output + data).slice(-2_000_000);
        };
        child.stdout.on('data', capture);
        child.stderr.on('data', capture);
        const timer = setTimeout(() => {
          // This child's isolated test process group only, never shared browsers.
          if (child.pid) {
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch (error) {
              capture(`\nTimeout cleanup: ${error.message}`);
            }
          }
        }, 180000);
        child.on('error', capture);
        child.on('close', (code, signal) => {
          clearTimeout(timer);
          writeFileSync(path.join(directory, `${entry.plant || 'baseline'}.log`), output);
          let receipt = null;
          try {
            receipt = JSON.parse(
              readFileSync(
                path.join(
                  directory,
                  entry.plant || 'baseline',
                  'footer-controls/footer-receipt.json',
                ),
                'utf8',
              ),
            );
          } catch (error) {
            console.error(`No valid ${entry.plant || 'baseline'} receipt: ${error.message}`);
          }
          const caught = matches({ code, signal, receipt }, entry, startedAt);
          console.log(
            `${caught ? 'PASS' : 'FAIL'} ${entry.plant || 'baseline'}: ${receipt?.failure ?? receipt?.verdict ?? 'no fresh receipt'}`,
          );
          resolve({ ...entry, code, signal, caught });
        });
      }),
  ),
);
writeFileSync(path.join(directory, 'plants.json'), JSON.stringify({ results }, null, 2) + '\n');
assert.ok(
  results.every((result) => result.caught),
  'footer plant sweep failed',
);
console.log('reader-controls-plants PASS: baseline and both severed actions checked');
