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
const excludedPattern = /(^|\/)(generated\/|.*\.d\.ts$)/;

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
  if (!sourcePattern.test(file) || excludedPattern.test(file)) continue;
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
