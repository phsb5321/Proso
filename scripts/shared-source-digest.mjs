#!/usr/bin/env node
/**
 * Digest of the @proso/shared source tree the built dist was compiled from.
 *
 * Why this exists: `make doctor` only checked that the Prisma client was
 * fresh; a `packages/shared/dist` built five months earlier passed the doctor
 * even though the server consumes `@proso/shared` from dist/, so the drift
 * surfaced later as missing exports / stale types that read like broken
 * source rather than a stale build artifact (Feature 180, slice #23).
 *
 * The shared build script records this digest next to the output as
 * `packages/shared/dist/.source.sha256`; `scripts/delivery-doctor.sh`
 * compares it and fails closed on a mismatch — mirroring the Prisma client
 * stamp (scripts/prisma-schema-digest.mjs + generate-prisma.sh).
 *
 * Deterministic: file contents are hashed by sorted relative path, then the
 * manifest itself is hashed, so reordering files never changes the digest.
 *
 * Usage: node scripts/shared-source-digest.mjs
 * Output: sha256 hex of the source tree, no trailing newline.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'packages/shared/src');

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

const manifest = collectFiles(SRC)
  .sort()
  .map((file) => {
    const rel = relative(SRC, file);
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    return `${rel}\n${hash}`;
  })
  .join('\n');

process.stdout.write(createHash('sha256').update(manifest).digest('hex'));
