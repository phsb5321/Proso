import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repositoryRoot = process.cwd();
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'proso-diff-coverage-self-test.'));

function run(command, arguments_, options = {}) {
  return spawnSync(command, arguments_, {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: { ...process.env, DIFF_BASE_REF: 'HEAD' },
    ...options,
  });
}

function assert(condition, message, result) {
  if (condition) return;
  if (result) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
  }
  throw new Error(message);
}

try {
  mkdirSync(path.join(fixtureRoot, 'scripts/quality'), { recursive: true });
  cpSync(
    path.join(repositoryRoot, 'scripts/quality/changed-lines.mjs'),
    path.join(fixtureRoot, 'scripts/quality/changed-lines.mjs'),
  );
  cpSync(
    path.join(repositoryRoot, 'scripts/quality/diff-coverage.mjs'),
    path.join(fixtureRoot, 'scripts/quality/diff-coverage.mjs'),
  );

  const extensionSource = path.join(fixtureRoot, 'packages/extension/src');
  const extensionCoverage = path.join(fixtureRoot, 'packages/extension/coverage');
  const serverCoverage = path.join(fixtureRoot, 'packages/server/coverage');
  const gatewayCoverage = path.join(fixtureRoot, 'services/proso-log-gateway/coverage');
  for (const directory of [extensionSource, extensionCoverage, serverCoverage, gatewayCoverage]) {
    mkdirSync(directory, { recursive: true });
  }

  writeFileSync(
    path.join(extensionSource, 'type-only.port.ts'),
    'export interface TypeOnlyPort {\n  readonly value: string;\n}\n\n\n',
  );
  writeFileSync(path.join(extensionSource, 'covered.ts'), 'export const covered = 1;\n');
  writeFileSync(
    path.join(extensionCoverage, 'lcov.info'),
    'TN:\nSF:src/covered.ts\nDA:1,1\nend_of_record\n',
  );
  writeFileSync(path.join(serverCoverage, 'lcov.info'), 'TN:\n');
  writeFileSync(path.join(gatewayCoverage, 'lcov.info'), 'TN:\n');

  execFileSync('git', ['init', '--quiet'], { cwd: fixtureRoot });
  execFileSync('git', ['config', 'user.name', 'Diff Coverage Self-Test'], { cwd: fixtureRoot });
  execFileSync('git', ['config', 'user.email', 'diff-coverage@example.invalid'], {
    cwd: fixtureRoot,
  });
  execFileSync('git', ['add', '.'], { cwd: fixtureRoot });
  execFileSync(
    'git',
    [
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ],
    { cwd: fixtureRoot },
  );

  // Scenario 1: deleting blank/type-only lines adds no executable line. The
  // file has no LCOV record by construction and must not be treated as a
  // missing coverage report.
  writeFileSync(
    path.join(extensionSource, 'type-only.port.ts'),
    'export interface TypeOnlyPort {\n  readonly value: string;\n}\n',
  );
  const deletionOnly = run(process.execPath, ['scripts/quality/diff-coverage.mjs']);
  assert(
    deletionOnly.status === 0 &&
      deletionOnly.stdout.includes('Diff coverage: no changed executable production lines.'),
    'deletion-only/type-only changes were not skipped',
    deletionOnly,
  );

  // Scenario 2: a new executable production file is intentionally absent from
  // LCOV. The same checker must still fail closed and name that exact file.
  const uncoveredPath = 'packages/extension/src/uncovered-plant.ts';
  writeFileSync(
    path.join(fixtureRoot, uncoveredPath),
    'export function uncoveredPlant(): number {\n  return 153;\n}\n',
  );
  const uncovered = run(process.execPath, ['scripts/quality/diff-coverage.mjs']);
  const uncoveredOutput = `${uncovered.stdout}${uncovered.stderr}`;
  assert(
    uncovered.status !== 0 &&
      uncoveredOutput.includes(
        `changed production file(s) absent from coverage reports: ${uncoveredPath}`,
      ),
    'an uncovered added production file did not fail closed',
    uncovered,
  );

  // Scenario 3: added type-only lines under the extension's ports directory
  // are contract surface, not executable code — type-imported modules are
  // erased before execution, so no LCOV record can ever exist for them. The
  // exclusion must not mask scenario 2's fail-closed behavior for real code.
  mkdirSync(path.join(extensionSource, 'ports'), { recursive: true });
  writeFileSync(
    path.join(extensionSource, 'ports', 'reader.port.ts'),
    'export interface ReaderPort {\n  readonly started: boolean;\n}\n',
  );
  const plantStillFails = run(process.execPath, ['scripts/quality/diff-coverage.mjs']);
  assert(
    plantStillFails.status !== 0 &&
      `${plantStillFails.stdout}${plantStillFails.stderr}`.includes('uncovered-plant'),
    'the ports exclusion masked the uncovered plant',
    plantStillFails,
  );
  rmSync(path.join(fixtureRoot, uncoveredPath));
  const portsSkipped = run(process.execPath, ['scripts/quality/diff-coverage.mjs']);
  assert(
    portsSkipped.status === 0 &&
      portsSkipped.stdout.includes('no changed executable production lines.'),
    'added type-only lines under src/ports were not skipped',
    portsSkipped,
  );

  // Scenario 4: executable code inside the ports directory is NOT covered by
  // the type-only exemption. A planted function in a port file must fail
  // closed and name the exact file.
  const executablePortPath = 'packages/extension/src/ports/executable.port.ts';
  writeFileSync(
    path.join(fixtureRoot, executablePortPath),
    'export function portFactory(): number {\n  return 7;\n}\n',
  );
  const executablePort = run(process.execPath, ['scripts/quality/diff-coverage.mjs']);
  const executablePortOutput = `${executablePort.stdout}${executablePort.stderr}`;
  assert(
    executablePort.status !== 0 &&
      executablePortOutput.includes(
        `changed production file(s) absent from coverage reports: ${executablePortPath}`,
      ),
    'executable code inside ports/ was not charged',
    executablePort,
  );

  process.stdout.write(
    'Diff coverage self-test: deletion-only file skipped; uncovered added file failed closed; type-only ports skipped; executable ports charged.',
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
