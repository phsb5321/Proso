# Refactor @proso/extension — Log

**Executed by**: parent session
**Date**: 2026-04-24
**Iterations**: 8

## Before (baseline at commit `bf7f368`)

| Metric | Value |
|---|---|
| Unused exports (whole repo) | 353 |
| Unused exported types | 326 |
| Unused enum members | 4 |
| Duplicate exports | 3 |
| Unused files | 33 |
| Unused deps | 2 |
| Extension tests passing | 2178 |

## Commits

| SHA | Subject | Delta |
|---|---|---|
| `1e0129e` | refactor(extension): trim telemetry/usage barrel to actually-consumed exports | -97, +14 = -83 LOC |
| `3f60a3d` | refactor(extension): trim playback barrel + drop load log | -36, +9 = -27 LOC |
| `e9eb796` | refactor(extension): remove 3 unused default exports | -6 LOC |

**Total extension delta**: −116 LOC across 4 files.

## After

| Metric | Value | Delta |
|---|---|---|
| Unused exports | 319 | −34 ✅ |
| Unused exported types | 288 | −38 ✅ |
| Unused enum members | 1 | −3 ✅ |
| Duplicate exports | 0 | −3 ✅ |
| Extension tests passing | 2178 | unchanged ✅ |
| Server tests passing | 360 unit | unchanged ✅ |

## Decisions

- **Barrel audit methodology**: per-symbol, `rg` excluding the module's own source files. False-positive detection via cross-check: JSDoc-embedded symbol names match knip's "used" signal but aren't real imports.
- **Kept `UsageTracker` class export**: single public-facing type for telemetry tracker, sibling of `usageTracker` singleton. Even when no current consumer imports the class, it's part of the public contract for tests and typechecks.
- **Removed `console.log('... loaded')` dev-pollution** from `playback/index.ts`. esbuild strips in prod builds but dev runs suffered.
- **Skipped aggressive removals**: 33 "unused files" per knip includes entrypoints that `wxt.config.ts` / `jest.config.ts` haven't been fully declared to knip. Configuration hints exist. Adding them is follow-up — aggressive removal risks deleting legitimate entrypoints.

## Deferred

- `lamejs` replacement (Quick Win #3) — requires audio MP3 encoder swap, larger touch area. Separate sprint.
- 319 remaining unused exports / 288 types — long tail. Most are public-surface or test-entrypoint symbols knip cannot trace. Fix knip config first, then revisit.
- 33 unused files — likely knip config gap (e.g. WXT-scanned entrypoints). Config tuning pass.

## Verification trail

1. `pnpm --filter @proso/extension test:unit` after each commit → 2178 pass (baseline 2178) ✅
2. `pnpm --filter @proso/server test` → 360 unit pass (baseline 360) ✅ (shared change compat)
3. `pnpm exec knip` → deltas captured above

## Verdict

PASS — extension refactor pass 1 complete. Material reduction in dead surface area. No feature regression. Further gains available but require knip config refinement first.
