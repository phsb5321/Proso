#!/usr/bin/env node
/**
 * Digest of the Prisma schema the generated client was built from.
 *
 * Why this exists: `make doctor` only checked that the generated client file
 * existed, never that it still matched the schema. A client generated five
 * months earlier passed the doctor, and the drift surfaced thirty lines later
 * as ~30 `tsc` errors of the form "Property 'paddleTransactionId' does not
 * exist" — which read like broken source rather than a stale build artifact.
 *
 * `scripts/generate-prisma.sh` records this digest next to the client;
 * `scripts/delivery-doctor.sh` compares it and fails closed on a mismatch.
 *
 * Usage: node scripts/prisma-schema-digest.mjs
 * Output: the schema's sha256, hex, no trailing newline.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = resolve(ROOT, 'packages/server/prisma/schema.prisma');

process.stdout.write(createHash('sha256').update(readFileSync(SCHEMA)).digest('hex'));
