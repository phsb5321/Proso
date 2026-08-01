# Implementation Plan: Automated Testing Infrastructure & Regression Prevention

**Branch**: `055-automated-testing-ci` | **Date**: 2026-01-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/055-automated-testing-ci/spec.md`

## Summary

Enhance the existing GitHub Actions CI/CD infrastructure to provide comprehensive regression prevention through:
1. Unified CI workflow with proper job dependencies and caching
2. Coverage enforcement with Codecov integration and PR comments
3. Cross-browser E2E testing with artifact preservation
4. Branch protection configuration documentation
5. Consolidated workflow reducing duplication between `ci.yml` and `test.yml`

**Key Technical Decision**: Consolidate existing `ci.yml` and `test.yml` into a single optimized workflow to reduce maintenance burden and improve CI efficiency.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), YAML (GitHub Actions workflows)
**Primary Dependencies**:
- Jest 29.x (unit/contract tests)
- Playwright 1.40+ (E2E/visual tests)
- Biome 1.9.x (linting)
- Codecov Action v4 (coverage)
- pnpm 10.x (package manager)

**Storage**: N/A (CI infrastructure only)
**Testing**: Jest (unit, contract, integration, security, regression), Playwright (E2E, visual)
**Target Platform**: GitHub Actions (ubuntu-latest runners)
**Project Type**: Single repository, browser extension
**Performance Goals**:
- Full CI pipeline < 10 minutes
- Unit tests < 60 seconds
- E2E tests < 5 minutes per browser
**Constraints**:
- GitHub Actions free tier (2,000 min/month private, unlimited public)
- No paid CI services
- Must support Firefox and Chromium E2E testing
**Scale/Scope**: ~82 test files, ~240+ individual tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| **I. Cross-Browser with MV3 Priority** | PASS | E2E tests run in both Firefox and Chromium (FR-015, FR-016) |
| **II. Privacy by Design** | N/A | CI infrastructure doesn't handle user data |
| **III. Hexagonal Architecture** | N/A | No application code changes |
| **IV. Test Coverage** | PASS | Feature directly supports this principle (FR-011-014) |
| **V. Observability** | PASS | Coverage reports provide observability into test health |
| **VI. Simplicity** | PASS | Consolidating workflows reduces complexity |

**Quality Gates Check**:
- TypeScript strict mode: Enforced via existing `tsconfig.json`
- ESLint/Biome: CI runs `pnpm lint` (FR-001)
- All tests must pass: Branch protection enforces this (FR-022)
- E2E on Firefox: Already configured in `test.yml` and `ci.yml`

**Result**: All gates PASS. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/055-automated-testing-ci/
├── plan.md              # This file
├── research.md          # Phase 0: CI/CD best practices research
├── data-model.md        # Phase 1: Workflow job structure
├── quickstart.md        # Phase 1: How to run CI locally
├── contracts/           # Phase 1: Workflow schemas
│   └── ci-workflow.yml  # Consolidated workflow specification
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code (repository root)

```text
.github/
├── workflows/
│   ├── ci.yml           # MODIFY: Consolidate all CI checks
│   ├── test.yml         # DELETE: Merge into ci.yml
│   └── release.yml      # KEEP: Release workflow (already complete)
├── BRANCH_PROTECTION.md # NEW: Branch protection setup guide
└── CODEOWNERS           # EXISTING: Required reviewers

tests/
├── unit/                # ~35 test files
├── contract/            # ~16 test files
├── integration/         # ~6 test files
├── security/            # ~2 test files
├── e2e/                 # ~5 test files (Playwright)
│   └── extension/       # Chromium extension tests
├── visual/              # Visual regression tests
└── setup.js             # Jest setup

jest.config.js           # MODIFY: Add coverage thresholds per directory
playwright.config.js     # KEEP: Already well-configured
```

**Structure Decision**: Minimal changes to existing structure. Focus is on workflow consolidation, not code reorganization.

## Complexity Tracking

No violations to justify. This feature reduces complexity by:
1. Consolidating 2 workflows (ci.yml + test.yml) into 1
2. Adding proper caching to reduce CI time
3. Standardizing artifact naming

## Phase 0: Research Summary

See [research.md](./research.md) for full details.

### Key Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| **Workflow count** | Single `ci.yml` | Reduces maintenance; `test.yml` duplicates `ci.yml` functionality |
| **Coverage platform** | Codecov | Free for public repos; already partially integrated |
| **E2E matrix strategy** | `fail-fast: false` | Allows both browsers to complete even if one fails |
| **Artifact retention** | 7 days (failures), 30 days (releases) | Balance storage costs vs debugging needs |
| **Branch protection** | Manual configuration + documentation | Cannot be automated via code; provide setup guide |

## Phase 1: Design

### CI Workflow Architecture

```text
                    Push/PR Trigger
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
      ┌────────┐    ┌──────────┐    ┌────────┐
      │  Lint  │    │Typecheck │    │  Build │
      │  30s   │    │   30s    │    │   60s  │
      └────┬───┘    └────┬─────┘    └────┬───┘
           │              │              │
           └──────────────┼──────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │   Unit Tests    │
                │  + Coverage     │
                │      60s        │
                └────────┬────────┘
                         │
           ┌─────────────┼─────────────┐
           │             │             │
           ▼             ▼             ▼
      ┌─────────┐  ┌──────────┐  ┌─────────┐
      │Contract │  │ Security │  │Integr.  │
      │  30s    │  │   10s    │  │  30s    │
      └────┬────┘  └────┬─────┘  └────┬────┘
           │             │             │
           └─────────────┼─────────────┘
                         │
                         ▼
              ┌────────────────────┐
              │    E2E Matrix      │
              │ Firefox │ Chromium │
              │   3m    │    3m    │
              └──────────┬─────────┘
                         │
                         ▼
              ┌────────────────────┐
              │   CI Success       │
              │  (Aggregation)     │
              └────────────────────┘
```

**Total Time**: ~8 minutes (parallel execution)

### Job Dependencies

```yaml
jobs:
  lint:        needs: []
  typecheck:   needs: []
  build:       needs: []
  unit-tests:  needs: [lint, typecheck]
  contract:    needs: [unit-tests]
  integration: needs: [unit-tests]
  security:    needs: [unit-tests, build]
  e2e-firefox: needs: [build, unit-tests]
  e2e-chrome:  needs: [build, unit-tests]
  ci-success:  needs: [all above]
```

### Caching Strategy

| Cache | Key Pattern | Restore Keys |
|-------|-------------|--------------|
| pnpm store | `pnpm-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}` | `pnpm-${{ runner.os }}-` |
| Playwright browsers | `playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}` | None (exact match only) |

### Coverage Thresholds

```javascript
// jest.config.js
coverageThreshold: {
  global: { lines: 70, functions: 70, branches: 60, statements: 70 },
  'src/core/**/*.ts': { lines: 85, functions: 85, branches: 75 },
  'src/adapters/**/*.ts': { lines: 80, functions: 80, branches: 70 },
}
```

### Artifact Strategy

| Artifact | When | Retention |
|----------|------|-----------|
| `coverage-report` | Always | 7 days |
| `playwright-report-{browser}` | On failure | 7 days |
| `test-results-{browser}` | On failure | 7 days |
| `extension-{browser}-{sha}` | Always | 7 days |

## Files to Create/Modify

### New Files

1. `.github/BRANCH_PROTECTION.md` - Setup guide for branch protection rules
2. `specs/055-automated-testing-ci/research.md` - Research findings
3. `specs/055-automated-testing-ci/data-model.md` - Workflow structure
4. `specs/055-automated-testing-ci/quickstart.md` - Local CI testing guide

### Modified Files

1. `.github/workflows/ci.yml` - Consolidated CI workflow
2. `jest.config.js` - Add per-directory coverage thresholds

### Deleted Files

1. `.github/workflows/test.yml` - Merged into `ci.yml`

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CI time exceeds 10 min | Medium | Low | Optimize caching; parallelize jobs |
| Flaky E2E tests | High | Medium | 2 retries configured; artifact capture |
| Coverage threshold too high | Low | Medium | Start at 70%; adjust based on current coverage |
| Branch protection blocks maintainer | Low | High | Document bypass procedures |

## Next Steps

1. Run `/speckit.tasks` to generate implementation tasks
2. Implement consolidated workflow
3. Configure branch protection manually in GitHub
4. Verify all success criteria in spec.md
