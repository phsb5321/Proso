import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.output',
  '.pnpm-store',
  '.wxt',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const forbiddenLocks = new Set(['npm-shrinkwrap.json', 'package-lock.json', 'yarn.lock']);

async function manifest(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function findForbiddenLocks(directory, findings = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isDirectory()) {
      await findForbiddenLocks(absolute, findings);
    } else if (
      forbiddenLocks.has(entry.name) ||
      (entry.name === 'pnpm-lock.yaml' && relative !== 'pnpm-lock.yaml')
    ) {
      findings.push(relative);
    }
  }
  return findings;
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
