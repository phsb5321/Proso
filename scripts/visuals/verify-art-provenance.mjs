#!/usr/bin/env node
/**
 * Every editorial art file must be traceable to the prompt that made it.
 *
 * Fails when an image has no sidecar, when its bytes no longer match the recorded
 * sha256, when a required field is empty, or when a sidecar outlives its image.
 * The lane and its rules: docs/visual-assets.md.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_DIR = resolve(ROOT, 'packages/site/assets/images/art');
const IMAGE_EXTENTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const REQUIRED_FIELDS = ['id', 'kind', 'tool', 'prompt', 'generated_at', 'sha256'];

export function verifyDir(dir, label = dir) {
  const problems = [];
  let checked = 0;

  if (!existsSync(dir)) {
    return { problems, checked, note: `${label}: no art directory — nothing to verify` };
  }

  const entries = readdirSync(dir).sort();
  const images = entries.filter((name) => IMAGE_EXTENTS.some((ext) => name.toLowerCase().endsWith(ext)));
  const sidecars = entries.filter((name) => name.endsWith('.provenance.json'));

  for (const image of images) {
    checked += 1;
    const path = resolve(dir, image);
    const sidecarPath = `${path}.provenance.json`;
    if (!existsSync(sidecarPath)) {
      problems.push(`${image}: no provenance sidecar — art must record the prompt that made it`);
      continue;
    }

    let sidecar;
    try {
      sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
    } catch (error) {
      problems.push(`${image}: sidecar is not valid JSON (${error.message})`);
      continue;
    }

    for (const field of REQUIRED_FIELDS) {
      const value = sidecar[field];
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${image}: sidecar field "${field}" is missing or empty`);
      }
    }

    const bytes = readFileSync(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (typeof sidecar.sha256 === 'string' && sidecar.sha256.toLowerCase() !== sha256) {
      problems.push(
        `${image}: bytes changed since generation (recorded ${sidecar.sha256.slice(0, 12)}…, actual ${sha256.slice(0, 12)}…)`,
      );
    }
    if (typeof sidecar.bytes === 'number' && sidecar.bytes !== bytes.byteLength) {
      problems.push(`${image}: recorded ${sidecar.bytes} bytes, file is ${bytes.byteLength}`);
    }
  }

  for (const sidecar of sidecars) {
    const image = `${sidecar.replace(/\.provenance\.json$/, '')}`;
    if (!existsSync(resolve(dir, image))) {
      problems.push(`${sidecar}: sidecar without its image — art was deleted, provenance was not`);
    }
  }

  return { problems, checked, note: `${label}: ${checked} art file(s)` };
}

function main() {
  const dirFlag = process.argv.indexOf('--dir');
  const dir = dirFlag === -1 ? DEFAULT_DIR : resolve(process.argv[dirFlag + 1] ?? '.');
  const report = verifyDir(dir, dir);

  console.log(`${report.note}`);
  if (report.problems.length > 0) {
    for (const problem of report.problems) console.error(`  FAIL ${problem}`);
    console.error(`art provenance FAIL: ${report.problems.length} problem(s)`);
    process.exit(1);
  }
  console.log('art provenance PASS — every image traces to its prompt');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
