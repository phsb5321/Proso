import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { changedLines } from './changed-lines.mjs';

const threshold = Number(process.env.DIFF_COVERAGE_MIN ?? 80);
const reportPaths = [
  'packages/extension/coverage/lcov.info',
  'packages/server/coverage/lcov.info',
  'services/proso-log-gateway/coverage/lcov.info',
];
const sourcePattern =
  /^(packages\/(extension|server|shared)|services\/proso-log-gateway)\/src\/.*\.ts$/;
// Extension ports are contracts, but not all of them are type-only:
// api-client.port.ts carries an executable factory. A changed port file is
// therefore skipped only when its CONTENT is type-only (no function, class,
// arrow, or new-expression) — those modules are erased before execution and
// no LCOV record can ever exist for them. Executable port code stays charged;
// server ports are always charged (abstract classes with runtime surface).
const excludedPattern = /(^|\/)(generated\/|.*\.d\.ts$)/;
const portDirPattern = /^packages\/extension\/src\/ports\//;
const executableTokenPattern = /\b(function|class)\b|=>|\bnew /;
const repositoryRootForPorts = process.cwd();
function isTypeOnlyPortFile(file) {
  if (!portDirPattern.test(file)) return false;
  try {
    const content = readFileSync(path.join(repositoryRootForPorts, file), 'utf8');
    return !executableTokenPattern.test(content);
  } catch {
    return false;
  }
}

function normalizeSource(source, reportPath) {
  const repositoryRoot = process.cwd();
  const packageRoot = path.dirname(path.dirname(path.resolve(reportPath)));
  const absolute = path.isAbsolute(source) ? source : path.resolve(packageRoot, source);
  return path.relative(repositoryRoot, absolute).replaceAll(path.sep, '/');
}

function readCoverage(reportPath, coverage) {
  if (!existsSync(reportPath)) {
    throw new Error(`required coverage report is missing: ${reportPath}`);
  }

  let source;
  for (const line of readFileSync(reportPath, 'utf8').split('\n')) {
    if (line.startsWith('SF:')) {
      source = normalizeSource(line.slice(3), reportPath);
      if (!coverage.has(source)) coverage.set(source, new Map());
    } else if (line.startsWith('DA:') && source !== undefined) {
      const [lineNumber, hits] = line.slice(3).split(',').map(Number);
      coverage.get(source).set(lineNumber, hits);
    } else if (line === 'end_of_record') {
      source = undefined;
    }
  }
}

const coverage = new Map();
for (const reportPath of reportPaths) readCoverage(reportPath, coverage);
if (coverage.size === 0) throw new Error('coverage reports contained no source records');

let coverable = 0;
let covered = 0;
const missingFiles = [];
const uncovered = [];

for (const [file, lines] of changedLines()) {
  // A deletion-only/type-only formatting diff has no added line to cover and
  // may legitimately have no LCOV source record. Missing LCOV still fails for
  // every file with at least one added production line (self-test scenario 2).
  if (!sourcePattern.test(file) || excludedPattern.test(file) || lines.size === 0) continue;
  if (isTypeOnlyPortFile(file)) continue;
  const fileCoverage = coverage.get(file);
  if (fileCoverage === undefined) {
    missingFiles.push(file);
    continue;
  }

  for (const line of lines) {
    if (!fileCoverage.has(line)) continue;
    coverable += 1;
    if (fileCoverage.get(line) > 0) {
      covered += 1;
    } else {
      uncovered.push(`${file}:${line}`);
    }
  }
}

if (missingFiles.length > 0) {
  throw new Error(
    `changed production file(s) absent from coverage reports: ${missingFiles.join(', ')}`,
  );
}

if (coverable === 0) {
  console.log('Diff coverage: no changed executable production lines.');
  process.exit(0);
}

const percentage = (covered / coverable) * 100;
console.log(
  `Diff coverage: ${covered}/${coverable} lines (${percentage.toFixed(2)}%, required ${threshold}%).`,
);
if (percentage < threshold) {
  console.error(`Uncovered changed lines:\n${uncovered.join('\n')}`);
  process.exit(1);
}
