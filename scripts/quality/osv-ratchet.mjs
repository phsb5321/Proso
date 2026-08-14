import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { requireReviewDate, requireText } from './review-metadata.mjs';

const reportPath = process.argv[2];
const baselinePath = 'quality-baselines/osv.json';
const writeBaseline = process.env.UPDATE_BASELINE === '1';
const expires = process.env.QUALITY_BASELINE_EXPIRES ?? '2026-10-30';
if (!reportPath || !existsSync(reportPath)) throw new Error('OSV JSON report is missing');

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
if (!Array.isArray(report.results)) throw new Error('OSV report has an invalid schema');

const current = [];
for (const result of report.results) {
  for (const packageResult of result.packages ?? []) {
    for (const vulnerability of packageResult.vulnerabilities ?? []) {
      const packageName = packageResult.package?.name;
      const version = packageResult.package?.version;
      const advisory = vulnerability.id;
      if (!packageName || !version || !advisory) throw new Error('Malformed OSV finding');
      const identity = `${packageName}\0${version}\0${advisory}`;
      current.push({
        fingerprint: createHash('sha256').update(identity).digest('hex'),
        package: packageName,
        version,
        advisory,
        severity: vulnerability.database_specific?.severity ?? 'UNKNOWN',
      });
    }
  }
}
current.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));

if (writeBaseline) {
  const generatedFrom = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const findings = current.map((finding) => ({
    tool: 'osv-scanner',
    ...finding,
    owner: 'proso',
    reason: 'Known transitive advisory; remediate by reachability and fixed-version priority.',
    issue: 'quality-depth-slice-2',
  }));
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ schemaVersion: 1, generatedFrom, expires, findings }, null, 2)}\n`,
  );
  console.log(`Wrote ${findings.length} OSV baseline fingerprints to ${baselinePath}.`);
  process.exit(0);
}

if (!existsSync(baselinePath)) throw new Error(`OSV baseline is missing: ${baselinePath}`);
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (baseline.schemaVersion !== 1 || !Array.isArray(baseline.findings)) {
  throw new Error('OSV baseline has an invalid top-level schema');
}
if (requireReviewDate(baseline.expires, 'OSV baseline expires') < Date.now()) {
  throw new Error(`OSV baseline expired on ${baseline.expires}`);
}
for (const finding of baseline.findings) {
  if (finding.tool !== 'osv-scanner') {
    throw new Error('OSV baseline entry is missing tool/fingerprint/owner/reason/issue');
  }
  requireText(finding.fingerprint, 'OSV baseline fingerprint');
  requireText(finding.owner, 'OSV baseline owner');
  requireText(finding.reason, 'OSV baseline reason');
  requireText(finding.issue, 'OSV baseline issue');
}

const known = new Set(baseline.findings.map((finding) => finding.fingerprint));
const observed = new Set(current.map((finding) => finding.fingerprint));
const introduced = current.filter((finding) => !known.has(finding.fingerprint));
const stale = baseline.findings.filter((finding) => !observed.has(finding.fingerprint));
if (introduced.length > 0 || stale.length > 0) {
  if (introduced.length > 0) {
    console.error(`New OSV findings:\n${JSON.stringify(introduced, null, 2)}`);
  }
  if (stale.length > 0) {
    console.error(
      `Stale OSV baseline fingerprints must be removed:\n${JSON.stringify(stale, null, 2)}`,
    );
  }
  process.exit(1);
}

console.log(`OSV ratchet: ${current.length} known advisories, 0 new, expires ${baseline.expires}.`);
