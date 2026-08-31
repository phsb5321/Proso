import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { changedLines } from './changed-lines.mjs';

const outputDirectory = mkdtempSync(path.join(tmpdir(), 'proso-jscpd-'));
const evidenceDirectory = path.resolve('.artifacts/quality');
const evidencePath = path.join(evidenceDirectory, 'jscpd-report.json');
const pendingEvidencePath = `${evidencePath}.${process.pid}.tmp`;
mkdirSync(evidenceDirectory, { recursive: true });
rmSync(evidencePath, { force: true });
rmSync(pendingEvidencePath, { force: true });

try {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'jscpd',
      '--reporters',
      'json',
      '--output',
      outputDirectory,
      '--threshold',
      '100',
      '--min-tokens',
      '50',
      'packages/extension/src',
      'packages/server/src',
      'packages/shared/src',
      'services/proso-log-gateway/src',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0 || result.error) {
    throw new Error(`jscpd failed: ${result.error?.message ?? result.stderr}`);
  }

  const reportPath = path.join(outputDirectory, 'jscpd-report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (!Array.isArray(report.duplicates)) throw new Error('jscpd report has an invalid schema');
  const changed = changedLines();
  const introduced = report.duplicates.filter((duplicate) => {
    for (const side of [duplicate.firstFile, duplicate.secondFile]) {
      const lines = changed.get(side.name);
      if (lines === undefined) continue;
      for (let line = side.start; line <= side.end; line += 1) {
        if (lines.has(line)) return true;
      }
    }
    return false;
  });

  const introducedSet = new Set(introduced);
  const legacy = report.duplicates.filter((duplicate) => !introducedSet.has(duplicate));
  const evidence = {
    schemaVersion: 1,
    summary: {
      total: report.duplicates.length,
      legacy: legacy.length,
      introduced: introduced.length,
    },
    statistics: report.statistics,
    legacy,
    introduced,
  };
  writeFileSync(pendingEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  renameSync(pendingEvidencePath, evidencePath);

  const persisted = JSON.parse(readFileSync(evidencePath, 'utf8'));
  if (
    persisted.schemaVersion !== 1 ||
    !Array.isArray(persisted.legacy) ||
    !Array.isArray(persisted.introduced) ||
    persisted.summary?.total !== report.duplicates.length ||
    persisted.legacy.length + persisted.introduced.length !== report.duplicates.length
  ) {
    throw new Error('persisted jscpd evidence failed schema or count validation');
  }

  if (introduced.length > 0) {
    console.error(
      `Changed-code duplication detected:\n${introduced
        .map(
          (duplicate) =>
            `${duplicate.firstFile.name}:${duplicate.firstFile.start}-${duplicate.firstFile.end} ↔ ` +
            `${duplicate.secondFile.name}:${duplicate.secondFile.start}-${duplicate.secondFile.end}`,
        )
        .join('\n')}`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Duplication ratchet: ${legacy.length} legacy clones, 0 touching changed lines.`);
  }
  console.log(`Detailed report: ${path.relative(process.cwd(), evidencePath)}`);
} finally {
  rmSync(pendingEvidencePath, { force: true });
  rmSync(outputDirectory, { recursive: true, force: true });
}
