#!/usr/bin/env node
/**
 * Plants for the art-provenance gate: prove it fails closed by name.
 *
 * Untraceable art is the failure this gate exists for, so each plant is an image
 * whose provenance is missing, stale, or incomplete. All four must be caught.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDir } from './verify-art-provenance.mjs';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const sidecar = (overrides = {}) => ({
  id: 'listening-hero',
  kind: 'hero',
  tool: 'gpt-image — ChatGPT web UI, fleet identity chatgpt-c',
  prompt: 'a wide editorial illustration',
  generated_at: '2026-09-21T00:00:00.000Z',
  format: 'png',
  bytes: png.byteLength,
  sha256: createHash('sha256').update(png).digest('hex'),
  ...overrides,
});

const scenario = (name, build, expectProblemFragment) => ({ name, build, expectProblemFragment });

const scenarios = [
  scenario(
    'valid pair',
    (dir) => {
      writeFileSync(join(dir, 'listening-hero.png'), png);
      writeFileSync(join(dir, 'listening-hero.png.provenance.json'), JSON.stringify(sidecar()));
    },
    null,
  ),
  scenario(
    'image with no sidecar',
    (dir) => writeFileSync(join(dir, 'listening-hero.png'), png),
    'no provenance sidecar',
  ),
  scenario(
    'bytes changed after generation',
    (dir) => {
      writeFileSync(join(dir, 'listening-hero.png'), png);
      writeFileSync(
        join(dir, 'listening-hero.png.provenance.json'),
        JSON.stringify(sidecar({ sha256: 'f'.repeat(64) })),
      );
    },
    'bytes changed since generation',
  ),
  scenario(
    'sidecar with an empty prompt',
    (dir) => {
      writeFileSync(join(dir, 'listening-hero.png'), png);
      writeFileSync(
        join(dir, 'listening-hero.png.provenance.json'),
        JSON.stringify(sidecar({ prompt: '' })),
      );
    },
    'field "prompt" is missing or empty',
  ),
  scenario(
    'sidecar whose image is gone',
    (dir) =>
      writeFileSync(join(dir, 'listening-hero.png.provenance.json'), JSON.stringify(sidecar())),
    'sidecar without its image',
  ),
];

const root = mkdtempSync(join(tmpdir(), 'proso-art-plants-'));
const failures = [];

try {
  for (const { name, build, expectProblemFragment } of scenarios) {
    const dir = join(root, name.replaceAll(' ', '-'));
    mkdirSync(dir, { recursive: true });
    build(dir);
    const { problems } = verifyDir(dir, name);
    const caught = expectProblemFragment
      ? problems.some((problem) => problem.includes(expectProblemFragment))
      : problems.length === 0;

    if (caught) {
      console.log(`  ok   ${name}${expectProblemFragment ? ` → caught: ${expectProblemFragment}` : ''}`);
    } else {
      const detail = problems.length > 0 ? problems.join(' | ') : 'no problem reported';
      console.error(`  FAIL ${name}: expected ${expectProblemFragment ?? 'a clean pass'}, got ${detail}`);
      failures.push(name);
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`art provenance plants FAIL: ${failures.length} plant(s) not caught`);
  process.exit(1);
}
console.log(`art provenance plants PASS — ${scenarios.length} plants behaved`);
