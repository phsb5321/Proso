import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { changedLines } from './changed-lines.mjs';

const outputDirectory = mkdtempSync(path.join(tmpdir(), 'proso-jscpd-'));
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
    process.exit(1);
  }
  console.log(
    `Duplication ratchet: ${report.duplicates.length} legacy clones, 0 touching changed lines.`,
  );
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
