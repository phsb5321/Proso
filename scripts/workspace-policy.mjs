import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const forbiddenLocks = new Set(['npm-shrinkwrap.json', 'package-lock.json', 'yarn.lock']);

async function manifest(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function findForbiddenLocks() {
  // Ask git for the files the repository actually carries: tracked plus untracked
  // that are not git-ignored. Walking the tree by hand flagged git-ignored agent
  // runtime state (`.opencode/package-lock.json`), which CI never sees, so the
  // whole local delivery floor failed on a file the repository does not ship.
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, maxBuffer: 64 * 1024 * 1024 },
  );

  return stdout
    .split('\0')
    .filter((relative) => relative !== '')
    .filter(
      (relative) =>
        forbiddenLocks.has(path.basename(relative)) ||
        (path.basename(relative) === 'pnpm-lock.yaml' && relative !== 'pnpm-lock.yaml'),
    );
}

// PR #202 committed five `node_modules` SYMLINKS. `.gitignore` carried only
// `node_modules/`, and a trailing slash matches a directory but never a symlink
// of the same name, so `git add -A` swept them in. Every CI job then died at
// install with `ENOTDIR: not a directory, mkdir '.../node_modules'` -- pnpm
// cannot create the directory over a checked-out symlink -- and a fresh clone
// was equally broken. .gitignore was repaired in #203, but ignore rules only
// stop the ACCIDENT; they do not detect a path already in the index. This gate
// does, and it asks git rather than the filesystem so it sees exactly what the
// repository would hand a cloner.
async function findTrackedDependencyDirs() {
  const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '-z'], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });

  return stdout
    .split('\0')
    .filter((relative) => relative !== '')
    .filter((relative) => relative.split('/').includes('node_modules'));
}

const workspace = await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
for (const requiredPattern of ['packages/*', 'services/*']) {
  if (!workspace.includes(`"${requiredPattern}"`)) {
    throw new Error(`pnpm workspace is missing shipped package pattern: ${requiredPattern}`);
  }
}

const rootManifest = await manifest('package.json');
if (rootManifest.packageManager !== 'pnpm@10.30.3') {
  throw new Error(
    `packageManager must be exactly pnpm@10.30.3; found ${rootManifest.packageManager ?? 'missing'}`,
  );
}

const locks = await findForbiddenLocks(root);
if (locks.length > 0) {
  throw new Error(`non-canonical package-manager lockfile(s): ${locks.sort().join(', ')}`);
}

const trackedDependencyDirs = await findTrackedDependencyDirs();
if (trackedDependencyDirs.length > 0) {
  throw new Error(
    `node_modules must never be tracked; git carries: ${trackedDependencyDirs.sort().join(', ')}. ` +
      'Run `git rm --cached <path>` on each. A symlink named node_modules is the usual cause ' +
      '(sharing installed deps into a worktree) and `node_modules/` in .gitignore does NOT ' +
      'match it, because a trailing slash matches only a directory.',
  );
}

const zodSpecs = new Map();
for (const relativePath of [
  'packages/extension/package.json',
  'packages/server/package.json',
  'packages/shared/package.json',
  'services/proso-log-gateway/package.json',
]) {
  const packageManifest = await manifest(relativePath);
  zodSpecs.set(relativePath, packageManifest.dependencies?.zod);
}
const expectedZod = zodSpecs.get('packages/shared/package.json');
const divergentZod = [...zodSpecs].filter(([, version]) => version !== expectedZod);
if (divergentZod.length > 0) {
  throw new Error(
    `Zod versions must match ${expectedZod}: ${divergentZod
      .map(([file, version]) => `${file}=${version ?? 'missing'}`)
      .join(', ')}`,
  );
}

console.log(
  `Workspace policy ready (${rootManifest.packageManager}, one lockfile, Zod ${expectedZod}).`,
);
