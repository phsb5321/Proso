# Baseline — Refactor Sprint 079

Captured: 2026-04-23 on branch `079-refactor-sprint` at commit `96f05c5`.

## Test counts (must not regress)

| Package | Pass | Skip | Fail | Notes |
|---|---|---|---|---|
| `@proso/shared` | 0 | — | — | No test script (type-only pkg) |
| `@proso/server` | 360 | 0 | 43 | 43 contract failures are env-blocked, not code — NixOS Prisma engine checksum 404 |
| `@proso/extension` | 2178 | 1 | 0 | All unit tests green |
| **Total** | **2538** | **1** | **43\*** | \*env-blocked, excluded from regression gate |

## Quality metrics (from CLAUDE.md spec 034 + 063)

- Circular dependencies: 0
- Code duplication: ≤ 2% (extension historically ~1.6–1.8%)
- TypeScript strict mode: enabled (strictNullChecks, noImplicitAny, strictFunctionTypes)

## Working-tree state

- Branch `079-refactor-sprint` off `main @ 96f05c5`
- Pre-branch state had accidental deletions (`.gitignore` × 4, 7 server test specs); all restored via `git restore`
- No pending commits

## Exit criteria for sprint

1. Pass count ≥ 2538 (≥ baseline) across all 3 packages
2. Bundle size ≤ current (extension `.output/firefox-mv2/*.js` total)
3. 0 circular dependencies (`pnpm run deps:check` in extension)
4. Code duplication ≤ 2% (`pnpm run duplication`)
5. All features from `features-inventory.md` present and working
6. Sonar quality gate passes (A rating, 0 bugs, 0 vulnerabilities, debt ≤ 1 day)
7. CI green on PR

## Environment notes

- pnpm `/nix/store/qlbqwsia8a9rk3cp6v58y1x58c0j2wyk-pnpm-10.33.0/bin/pnpm` — needs explicit PATH
- Prisma contract tests require non-NixOS engine or upstream fix (separate track)
- Node via `/run/current-system/sw/bin/node`

## Sprint 079 final (2026-04-24)

| Gate | Baseline | Final | Status |
|---|---|---|---|
| Tests passing | 2538 | 2538 | ✅ held |
| Circular deps | 0 | 0 | ✅ |
| Duplication | ~1.6–1.8% | 1.7% (195 clones, 2584 LOC) | ✅ |
| Extension JS bundle | not measured | 914,406 bytes | — (new baseline) |
| Extension total build | not measured | 1.06 MB | — (new baseline) |
| knip unused exports | 353 | 319 | −34 ✅ |
| knip unused types | 326 | 288 | −38 ✅ |
| knip unused enum members | 4 | 1 | −3 ✅ (kept ValidationError) |
| knip duplicate exports | 3 | 0 | −3 ✅ |
| Sonar gate | — | blocked | ⏳ needs SONAR_HOST_URL + SONAR_TOKEN |

**8 commits on branch `079-refactor-sprint`** (see git log).
