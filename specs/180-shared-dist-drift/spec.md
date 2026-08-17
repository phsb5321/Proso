# Feature 180 — `make doctor` rejects a stale SHIPPED artifact (shared dist drift)

**Status**: in progress (17/08/2026)
**Owner**: Dokku deploy seat `w2:pJ`
**Branch**: `180-shared-dist-drift` (from `15fe638`)
**Source**: slice #23 in `docs/reading-journey-status.md` "Next verified slices"

## Problem

PR #173 made `scripts/delivery-doctor.sh` fail closed on Prisma client drift
by stamping the schema sha256 beside the generated client
(`packages/server/src/generated/prisma/.schema.sha256`). But the doctor still
cannot tell a stale `packages/shared/dist` from a fresh one. The server
consumes `@proso/shared` **from dist/** (`main: ./dist/index.js`), so a dist
built months ago passes the doctor and the drift surfaces later as missing
exports / stale types that read like broken source — the exact failure class
the Prisma stamp exists to catch.

## Solution (same source-digest stamp, mirrored)

1. `scripts/shared-source-digest.mjs` — deterministic sha256 of the
   `packages/shared/src` tree (file contents hashed by sorted relative path,
   then the manifest hashed), mirroring `scripts/prisma-schema-digest.mjs`.
2. `packages/shared` build script stamps the digest beside the output:
   `tsc -p tsconfig.build.json && node ../../scripts/shared-source-digest.mjs > dist/.source.sha256`.
   All build paths (`make build`, `build-all`, `build:chrome`+ variants)
   route through this script, so every build stamps.
3. `scripts/delivery-doctor.sh` gains the shared block, in the same
   fail-closed shape as the Prisma block:
   - `packages/shared/dist/index.js` missing → RED "Shared package is not
     built; run make build";
   - stamp file missing (existing checkout predates tracking) → RED
     "Shared dist predates source-drift tracking; run make build";
   - stamp ≠ current source digest → RED naming BOTH digests
     ("built from source X, current source is Y").

## Plants (both directions, plus the no-stamp case)

1. **Stale direction:** touch a shared source file (e.g. append a comment to
   `packages/shared/src/index.ts`) without rebuilding → `make doctor` RED,
   message names the digest mismatch.
2. **Fresh direction:** rebuild shared → `make doctor` exit 0.
3. **No-stamp case:** `rm packages/shared/dist/.source.sha256` (dist exists)
   → RED "predates source-drift tracking" — fails closed, never passes.
4. **Not-built case:** fresh checkout without dist → RED "not built".

## Acceptance criteria

1. All four plants above produce the stated verdicts (receipts pasted).
2. `nix-shell --run "make verify"` exits 0 after building shared.
3. Spec/plan/tasks tracked under `specs/180-shared-dist-drift/`.
4. PR opened (not merged); receipts + PR number reported.
