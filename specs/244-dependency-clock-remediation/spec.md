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
  (`multer@<2.3.0`, `smol-toml@<=1.7.0` (upstream fix 1.7.1; 1.8.0 chosen as
  the current release), `browserslist@<=4.28.6`, `fast-uri@>=3.0.0 <3.1.6`,
  `js-yaml@>=3.0.0 <3.15.2`, `js-yaml@>=4.0.0 <4.3.2`,
  `mysql2@<3.23.1` (highest fix across GHSA-3f6p-5ww8-9rcr's 3.22.0 and
  GHSA-rgwj-5xj2-c3m3's 3.23.1), `svgo` direct bump to 4.1.0,
  `hono@>=4.0.0 <4.13.5`, `qs@<6.16.0`, `vitest`/`@vitest/mocker` to 4.1.11).
- **One selector per package, highest floor.** With multiple matching
  selectors the LAST match wins, so superseded keys silently shadow newer
  floors — that is exactly how multer stayed at 2.2.0 despite a correct
  override. Every package's keys are consolidated to a single selector whose
  range covers all vulnerable versions and whose floor is the highest fix
  (including pre-existing overlaps for hono, qs, fast-uri, js-yaml, vitest,
  @hono/node-server, protobufjs). Selectors only match vulnerable ranges, so
  consolidation can never downgrade an already-fixed version.
- **Baseline only the no-fix advisory.** GHSA-vwc7-r8mq-g2x9 (adm-zip symlink
  overwrite) lists no fixed release; it rides the dev-tooling chain
  (extraction tooling, not runtime server code). Added to
  `quality-baselines/osv.json` with owner/reason and the shared baseline
  expiry, mirroring the existing image-size/deepmerge-ts entries.
- **Derive the fixture clock, never hard-code it.** `paddle-provisioning-journey`
  now builds every date from `Date.now()` (purchase modeled 30 days ago, 31-day
  period → live at processing time; renewal at period end; cancel/older-update
  ordering preserved). Production expiry semantics are untouched; the
  expired-period-yields-zero behavior is asserted at the contract/unit layer
  (`packages/server/tests/contract/prisma-credit.repository.spec.ts` and
  `packages/server/tests/unit/core/subscription/license-validation.service.spec.ts`)
  — the journey itself models the live-period case.

## Verification

- `make verify-full` exits 0 (run inside `nix-shell` — brand-assets needs the
  shell.nix python toolchain: fonttools + uharfbuzz).
- `make security` passes: 3 allowlisted advisory paths (no-fix upstreams),
  0 failures.
- Server suite: 506/506; integration 27/27 (paddle 13/13).
- OSV ratchet: 8 known, 0 new, expires 2026-10-30.
