import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const baselinePath = 'quality-baselines/knip.json';
const writeBaseline = process.argv.includes('--write-baseline');
const expires = process.env.QUALITY_BASELINE_EXPIRES ?? '2026-10-30';

function runKnip(arguments_) {
  const result = spawnSync('pnpm', ['exec', 'knip', '--reporter', 'json', ...arguments_], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (![0, 1].includes(result.status ?? -1) || result.error) {
    throw new Error(`Knip failed: ${result.error?.message ?? result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Knip returned malformed JSON: ${result.stdout.slice(0, 200)}`);
  }
}

function collect(report, scope, categories) {
  const findings = [];
  for (const issue of report.issues ?? []) {
    for (const category of categories) {
      for (const item of issue[category] ?? []) {
        const identity = `${scope}\0${category}\0${issue.file}\0${item.name}`;
        findings.push({
          fingerprint: createHash('sha256').update(identity).digest('hex'),
          scope,
          category,
          file: issue.file,
          symbol: item.name,
        });
      }
    }
  }
  return findings;
}

const full = runKnip(['--include', 'files,dependencies,devDependencies']);
const production = runKnip(['--production', '--include', 'files,exports,dependencies']);
const current = [
  ...collect(full, 'all', ['files', 'dependencies', 'devDependencies']),
  ...collect(production, 'production', ['files', 'exports', 'dependencies']),
]
  .filter(
    (finding, index, all) =>
      all.findIndex((candidate) => candidate.fingerprint === finding.fingerprint) === index,
  )
  .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));

if (writeBaseline) {
  const generatedFrom = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const findings = current.map((finding) => ({
    tool: 'knip',
    ...finding,
    owner: 'proso',
    reason: 'Classified legacy production/dependency debt; removal requires reachability review.',
    issue: 'quality-depth-slice-2',
  }));
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ schemaVersion: 1, generatedFrom, expires, findings }, null, 2)}\n`,
  );
  console.log(`Wrote ${findings.length} Knip baseline fingerprints to ${baselinePath}.`);
  process.exit(0);
}

if (!existsSync(baselinePath)) throw new Error(`Knip baseline is missing: ${baselinePath}`);
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (
  baseline.schemaVersion !== 1 ||
  typeof baseline.generatedFrom !== 'string' ||
  !Array.isArray(baseline.findings)
) {
  throw new Error('Knip baseline has an invalid top-level schema');
}
if (Date.parse(`${baseline.expires}T00:00:00Z`) < Date.now()) {
  throw new Error(`Knip baseline expired on ${baseline.expires}`);
}
for (const finding of baseline.findings) {
  if (
    finding.tool !== 'knip' ||
    typeof finding.fingerprint !== 'string' ||
    typeof finding.owner !== 'string' ||
    typeof finding.reason !== 'string' ||
    typeof finding.issue !== 'string'
  ) {
    throw new Error('Knip baseline entry is missing tool/fingerprint/owner/reason/issue');
  }
}

const known = new Set(baseline.findings.map((finding) => finding.fingerprint));
const observed = new Set(current.map((finding) => finding.fingerprint));
const introduced = current.filter((finding) => !known.has(finding.fingerprint));
const stale = baseline.findings.filter((finding) => !observed.has(finding.fingerprint));
if (introduced.length > 0 || stale.length > 0) {
  if (introduced.length > 0) {
    console.error(`New Knip findings:\n${JSON.stringify(introduced, null, 2)}`);
  }
  if (stale.length > 0) {
    console.error(
      `Stale Knip baseline fingerprints must be removed:\n${JSON.stringify(stale, null, 2)}`,
    );
  }
  process.exit(1);
}

console.log(`Knip ratchet: ${current.length} known findings, 0 new, expires ${baseline.expires}.`);
