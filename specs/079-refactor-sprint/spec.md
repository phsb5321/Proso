# Spec 079 — Refactor Sprint

**Status**: in-flight
**Branch**: `079-refactor-sprint`
**Opened**: 2026-04-23
**Target close**: 2026-05-31
**Owner**: Pedro H S Balbino

## Overview

Reduce monorepo footprint (bundle size, dependency count, dead code, duplication) while preserving every existing feature. Integrate SonarQube quality gate on Dokku-hosted instance. No public-API changes. No user-visible regressions.

## Why

1. Vulnerability patch spree (spec 078) added `pnpm overrides` but didn't touch code surface. Follow-up = actually eliminate transitive bloat and simplify.
2. Sonar instance already deployed on Dokku — no excuse to not wire it up.
3. CLAUDE.md drifted to 1284 lines of per-feature log (now trimmed to 135). Related: many specs dir is accreting without pruning. Refactor is also a docs cleanup.
4. 43 server contract tests env-blocked on NixOS Prisma engine — one of: fix, suppress, or relocate to CI-only.

## Success criteria (the "perfect" in the user's brief)

Hard gates (all must pass before PR merges):

| Gate | Metric | Baseline | Target |
|---|---|---|---|
| Tests pass | unit suites green | 2538 pass | ≥ 2538 |
| Bundle size | ext `.output/firefox-mv2/*.js` total bytes | TBD (measure) | ≤ baseline |
| Circular deps | `pnpm --filter @proso/extension run deps:check` | 0 | 0 |
| Duplication | `pnpm --filter @proso/extension run duplication` | ~1.6–1.8% | ≤ 2% |
| Feature parity | `features-inventory.md` 73 rows | all present | all present |
| Sonar | quality gate on PR | — | Pass (A, 0 bugs, 0 vuln) |

Soft gates (nice-to-have, measured but not blocking):

- Total `node_modules` size reduction
- `pnpm -r build` wall time reduction
- Dead code removal count (`knip` recommendation, see research.md)
- Dep count reduction in each package.json

## Scope

### In scope
- All 3 packages (`extension`, `server`, `shared`) — sequence: shared → server → extension
- `services/proso-log-gateway/`
- `sonar-project.properties` + `.github/workflows/sonar.yml` (done, committed `bf7f368`)
- Developer tooling improvements that measurably affect the above gates
- Dependency graph analysis + dead-code removal
- Port/adapter seam cleanup per spec 034 hexagonal architecture

### Out of scope
- New user features (handled in separate specs)
- Payment/billing changes (Paddle SDK stays)
- UI/visual changes beyond those required by dead-code removal
- NixOS Prisma engine fix (upstream track — log as known environment limitation)
- Browser support expansion (Firefox MV2 only this sprint)
- AMO submission (separate release track)

## User stories (refactor stakeholders)

- **As a developer** starting work on Proso, I want project context under 200 lines in CLAUDE.md so Claude's context window isn't pre-burned. ✅ done 2026-04-23 (135 lines)
- **As a reviewer**, I want Sonar quality gate on every PR so I can trust code signal without reading every diff line.
- **As a release engineer**, I want the extension `.xpi` size to not grow sprint-over-sprint without explicit approval.
- **As a user**, I want every feature from the 73-row inventory to keep working exactly as before.

## Technical approach

See `plan.md` (next to write). High-level:

1. **Research** (`research.md` — subagent running). Recommend packages for perf/reliability/DX. Pick ≤5 quick wins (S effort) for this sprint. Defer rest.
2. **Per-package refactor loop** via child claude-code CLIs with bounded budget (`--max-budget-usd 8 --max-turns 80`). Each child gets a brief file with exit criteria + allowlisted Bash.
3. **Continuous verification**: after each child finishes, run baseline suite + quality metrics. Delta against baseline. Reject if any hard gate fails.
4. **Sonar adoption**: smoke-test on this PR. Calibrate gate strictness based on first-scan noise.
5. **PR**: Pedro reviews. Squash-merge.

## Constraints

- No direct push to `main` (use feature branch + PR)
- No AI attribution anywhere reaching GitHub
- No destructive ops without Pedro approval (`rm`, force-push, etc.)
- Respect `.gitignore` — do not commit `CLAUDE.md`, `.claude/`, `.mcp.json`, `.specify/`, `specs/`
- Playwright only via Docker (for any e2e validation)

## Dependencies

- Feature inventory: `features-inventory.md` (73 rows — done, 2026-04-23)
- Package research: `research.md` (subagent running)
- PARA vault note: `~/Documents/Notes/1. Projects/Proso/Proso.md` (done, 2026-04-23)
- Baseline metrics: `baseline.md` (done, 2026-04-23)

## Open questions (for Pedro)

1. `SONAR_HOST_URL` — what's the Dokku Sonar URL? (`https://sonar.home301server.com.br`?)
2. Tolerate 43 env-blocked contract tests as non-regression, or fix NixOS Prisma engine this sprint?
3. Refactor sequence: shared → server → extension — confirm?
4. Bundle size baseline: measure from current `main` or from this branch's first successful build?

## Status

See `../../Notes/1. Projects/Proso/Proso.md` status log.
