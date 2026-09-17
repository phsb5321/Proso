# 244 — Dependency & test-clock remediation

## Problem

`make verify-full` failed closed on two independent fronts:

1. **Dependency advisories** on the unchanged lockfile (first observed 12/09:
   14 high paths; on 17/09 the live OSV feed had drifted — multer ×3, smol-toml,
   browserslist, mysql2, fast-uri, js-yaml ×2, svgo, hono, qs, vitest ×2 —
   plus one no-fix advisory on adm-zip).
2. **Rotted test clock** in `paddle-provisioning-journey.spec.ts`: the fixture
   billing period ended 12/09/2026 at 20:00Z. Production correctly treats the
   expired period as granting zero credits, so two assertions expecting a live
   Pro allocation failed. The defect is in the fixture clock, not production.

## Decisions

- **Remediate by override, not allowlist, wherever upstream ships a fix.**
  Version-qualified pnpm overrides follow the existing ratchet style
  (`multer@<2.3.0`, `smol-toml@<=1.7.0`, `browserslist@<=4.28.6`,
  `fast-uri@>=3.0.0 <3.1.6`, `js-yaml@>=3.0.0 <3.15.2`,
  `js-yaml@>=4.0.0 <4.3.2`, `mysql2@<3.22.0`, `svgo` direct bump to 4.1.0,
  `hono@>=4.0.0 <4.13.5`, `qs@<6.16.0`, `vitest`/`@vitest/mocker` to 4.1.11).
  Superseded multer ratchet keys were removed: with multiple matching
  selectors pnpm resolved the stale range and silently kept 2.2.0.
- **Baseline only the no-fix advisory.** GHSA-vwc7-r8mq-g2x9 (adm-zip symlink
  overwrite) lists no fixed release; it rides the dev-tooling chain
  (extraction tooling, not runtime server code). Added to
  `quality-baselines/osv.json` with owner/reason and the shared baseline
  expiry, mirroring the existing image-size/deepmerge-ts entries.
- **Derive the fixture clock, never hard-code it.** `paddle-provisioning-journey`
  now builds every date from `Date.now()` (purchase modeled 30 days ago, 31-day
  period → live at processing time; renewal at period end; cancel/older-update
  ordering preserved). Production expiry semantics are untouched and still
  asserted: an expired period yields zero credits.

## Verification

- `make verify-full` exits 0 (run inside `nix-shell` — brand-assets needs the
  shell.nix python toolchain: fonttools + uharfbuzz).
- `make security` passes: 3 allowlisted advisory paths (no-fix upstreams),
  0 failures.
- Server suite: 506/506; integration 27/27 (paddle 13/13).
- OSV ratchet: 8 known, 0 new, expires 2026-10-30.
