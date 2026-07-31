import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function changedLines(base = process.env.DIFF_BASE_REF ?? 'origin/main') {
  const diff = execFileSync(
    'git',
    ['diff', '--unified=0', '--no-ext-diff', '--no-color', base, '--'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const changed = new Map();
  let file;
  let newLine = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      if (!changed.has(file)) changed.set(file, new Set());
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (file === undefined || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      changed.get(file).add(newLine);
      newLine += 1;
    } else if (!line.startsWith('-') && !line.startsWith('\\')) {
      newLine += 1;
    }
  }

  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  });
  for (const candidate of untracked.split('\0').filter(Boolean)) {
    if (!/^(packages|services)\/.*\/src\/.*\.(?:js|jsx|ts|tsx)$/.test(candidate)) continue;
    const lineCount = readFileSync(candidate, 'utf8').split('\n').length;
    changed.set(candidate, new Set(Array.from({ length: lineCount }, (_, index) => index + 1)));
  }

  return changed;
}
