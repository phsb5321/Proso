# Feature 238 — Make jscpd scan every tracked source

## Problem

jscpd defaults to `--max-lines 1000`. Proso's content entrypoint is more than
1,800 lines, so the changed-code duplication gate omitted the largest file in
Feature 229 while reporting `introduced: []`.

## Goal

The duplication gate either scans every tracked source under its owned source
roots or fails by naming each omitted file. No changed source can disappear
behind a scanner size default.

## Requirements

- REQ-1: Set explicit jscpd line and byte ceilings high enough for every current
  tracked source, including `packages/extension/src/entrypoints/content.ts`.
- REQ-2: Build a tracked-source inventory for extension/server/shared/gateway
  source roots and compare it with jscpd's report sources.
- REQ-3: Missing scanner statistics or any omitted eligible source fails closed
  with the omitted paths.
- REQ-4: Existing changed-clone blocking and classified legacy evidence remain
  unchanged.
- REQ-5: The extension package's direct duplication command uses the same size
  ceilings so its diagnostic output covers the same large files.

## Acceptance

`node scripts/quality/duplication-ratchet.mjs` exits 0 and its artifact contains
`packages/extension/src/entrypoints/content.ts` in the TypeScript source map.
Lowering the line ceiling back to 1,000 makes the inventory check exit non-zero
and name that file.
