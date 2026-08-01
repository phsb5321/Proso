# Implementation Plan: Development Quality Automation

**Branch**: `073-dev-quality-automation` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/073-dev-quality-automation/spec.md`

## Summary

Add automated quality gates across the Proso monorepo: pre-commit hooks (Lefthook + Biome + tsc), CI pipeline enhancements (parallel matrix jobs, coverage enforcement, vulnerability scanning, bundle size tracking), integration/wiring tests, Playwright E2E user journey tests, Zod validation for server endpoints, and test scaffolding tooling. The approach is incremental — each phase can be merged independently.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode) across all 3 packages
**Primary Dependencies**: Lefthook (pre-commit), Codecov (coverage), audit-ci (vulnerabilities), nestjs-zod (server validation), Playwright (E2E), Biome (lint/format)
**Storage**: N/A (infrastructure/tooling only)
**Testing**: Jest 29.x (2400+ extension tests, 237+ server tests), Playwright (E2E, visual)
**Target Platform**: GitHub Actions CI, developer local environments
**Project Type**: Developer tooling and CI/CD infrastructure
**Performance Goals**: Pre-commit hooks < 30s, CI pipeline < 10 minutes total
**Constraints**: Firefox extension E2E not supported by Playwright (Chromium only); coverage thresholds start at 60% (gradual ramp)
**Scale/Scope**: 3 packages, ~88 source files (extension), ~66 source files (server)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicability | Status |
| --------- | ------------- | ------ |
| I. Cross-Browser MV3 | N/A — no extension runtime code changes | PASS |
| II. Privacy by Design | N/A — no user data handling changes | PASS |
| III. Hexagonal Architecture | Applicable — Zod schemas align with port boundaries; contract tests enforce port compliance | PASS |
| IV. Test Coverage | Applicable — this feature IS the test coverage improvement | PASS |
| V. Observability | N/A — no telemetry changes | PASS |
| VI. Simplicity | Applicable — Lefthook + existing Biome is minimal tooling addition | PASS |

**Quality Gates:**
- TypeScript strict mode: Enforced via pre-commit tsc check
- Biome lint: Enforced via pre-commit Biome check
- All tests: Must pass before and after each phase
- E2E on Chromium: Extension E2E tests in CI

**Result: All gates PASS. No violations to justify.**

## Project Structure

### Documentation (this feature)

```text
specs/073-dev-quality-automation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Entity definitions
├── quickstart.md        # Developer setup guide
├── spec.md              # Feature specification
├── checklists/
│   └── requirements.md  # Spec quality checklist
├── contracts/
│   └── quality-gates.md # Gate & pipeline contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code Changes

```text
# Root-level config
lefthook.yml                                    # NEW - pre-commit hook config
.github/workflows/ci.yml                        # MODIFY - add coverage, audit, matrix
.github/workflows/server-ci.yml                 # MODIFY - add coverage, audit

# Extension
packages/extension/jest.config.js               # MODIFY - raise coverage thresholds
packages/extension/package.json                 # MODIFY - add test:affected script
packages/extension/tests/
├── contract/
│   ├── cache-store.contract.test.ts            # NEW - ICacheStore contract tests
│   ├── highlight-sync.contract.test.ts         # NEW - IHighlightSync contract tests
│   ├── text-extractor.contract.test.ts         # NEW - ITextExtractor contract tests
│   ├── content-scorer.contract.test.ts         # NEW - IContentScorer contract tests
│   └── settings-store.contract.test.ts         # NEW - ISettingsStore contract tests
├── integration/
│   ├── composition-root.test.ts                # NEW - wiring/singleton verification
│   └── handler-registry.test.ts                # NEW - handler completeness test
└── e2e/
    └── user-journey.spec.ts                    # NEW - Playwright user journey

# Server
packages/server/package.json                    # MODIFY - add coverage script
packages/server/jest.config.ts                  # MODIFY - add coverage thresholds
packages/server/src/infrastructure/pipes/
│   └── zod-validation.pipe.ts                  # NEW - Zod validation pipe

# Shared
packages/shared/src/schemas/
├── tts.ts                                      # NEW - TTS request/response schemas
├── license.ts                                  # NEW - License validation schemas
└── credits.ts                                  # NEW - Credit balance/deduct schemas
```

---

## Implementation Phases

### Phase 1: Pre-Commit Hooks (FR-001)

**Goal**: Block broken commits locally before they reach CI.

**Tasks**:

1.1. **Install Lefthook**
- `pnpm add -Dw lefthook`
- Add `postinstall` script: `"postinstall": "lefthook install"`
- Verify `npx lefthook version` works

1.2. **Create `lefthook.yml`** at repo root
```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "packages/**/*.{ts,tsx,js,jsx,json}"
      run: npx biome check --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}
    tsc:
      glob: "packages/**/*.{ts,tsx}"
      run: pnpm tsc --build --noEmit
```

1.3. **Enable TypeScript incremental builds**
- Add `"incremental": true` and `"skipLibCheck": true` to root `tsconfig.json`
- Ensure each package tsconfig has `"composite": true` for project references

1.4. **Test pre-commit flow**
- Make intentional type error → commit should fail
- Make intentional lint violation → commit should fail
- Clean commit → should pass in < 15 seconds

**Acceptance**: Commits with type errors or lint violations are blocked locally.

---

### Phase 2: CI Pipeline Enhancements (FR-002, FR-006)

**Goal**: Parallel test execution, coverage enforcement, vulnerability scanning, bundle size tracking.

**Tasks**:

2.1. **Refactor `ci.yml` to matrix strategy**
```yaml
jobs:
  quality:
    strategy:
      matrix:
        include:
          - package: extension
            test-cmd: pnpm --filter @proso/extension test:unit -- --coverage
          - package: server
            test-cmd: pnpm --filter @proso/server test -- --coverage
```
Keep existing visual-tests and e2e-tests jobs.

2.2. **Add coverage upload**
- Install Codecov action: `codecov/codecov-action@v4`
- Upload coverage reports from each matrix job
- Configure `codecov.yml` with patch coverage thresholds

2.3. **Raise extension coverage thresholds**
- In `jest.config.js`, change thresholds: statements 60%, branches 50%, functions 55%, lines 60%

2.4. **Add vulnerability scanning job**
```yaml
security:
  runs-on: ubuntu-latest
  steps:
    - run: pnpm audit --audit-level=high
```

2.5. **Add bundle size check**
- Use `size-limit` or keep existing `Check Firefox extension size` step
- Add 4MB warning threshold (already exists at 5MB)

2.6. **Add PR merge requirements**
- Configure branch protection: require all CI checks to pass

**Acceptance**: CI runs tests in parallel, coverage thresholds enforced, vulnerabilities block PRs.

---

### Phase 3: Integration & Wiring Tests (FR-003)

**Goal**: Catch wiring bugs (like dual-cache-split) before merge.

**Tasks**:

3.1. **Composition root wiring test** (`tests/integration/composition-root.test.ts`)
- Import composition container
- Verify cache adapter singleton: `container.cacheStore === container.cacheStore` (same instance)
- Verify audio generator uses correct provider based on settings
- Verify all port interfaces are bound

3.2. **Handler registry completeness test** (`tests/integration/handler-registry.test.ts`)
- Import all message types from protocol
- Import handler registry
- Verify every message type has a registered handler
- Verify no duplicate registrations

3.3. **Extend contract tests** for untested ports
- `cache-store.contract.test.ts`: Test IndexedDB + InMemory adapters
- `highlight-sync.contract.test.ts`: Test ContentScriptHighlight adapter
- `text-extractor.contract.test.ts`: Test Readability adapter
- `content-scorer.contract.test.ts`: Test Trafilatura adapter
- `settings-store.contract.test.ts`: Test BrowserSettings adapter

**Acceptance**: Wiring bugs caught automatically; every port has contract test.

---

### Phase 4: E2E User Journey Tests (FR-004)

**Goal**: Automated Playwright tests simulating real user workflows.

**Tasks**:

4.1. **Create user journey test** (`tests/e2e/user-journey.spec.ts`)
- Build Chromium extension for testing
- Load extension via `chromium.launchPersistentContext`
- Test flows:
  - Open popup → verify it renders
  - Navigate to sample article page
  - Trigger playback via popup
  - Verify footer appears
  - Pause/resume → verify state changes
  - Stop → verify footer hides

4.2. **Add error scenario tests**
- Invalid API key → verify error message in popup
- Empty page → verify "no content" message

4.3. **Configure retry and Docker**
- Max 2 retries for flaky tests
- Docker-based Chromium in CI
- Deterministic test data (static HTML fixtures)

**Acceptance**: Core user journey passes in CI > 95% of runs.

---

### Phase 5: Zod Validation Standardization (FR-005)

**Goal**: Runtime validation at all data boundaries.

**Tasks**:

5.1. **Create shared Zod schemas** (`packages/shared/src/schemas/`)
- `tts.ts`: SynthesizeRequest/Response schemas
- `license.ts`: LicenseValidate request/response
- `credits.ts`: CreditBalance/Deduct request/response
- Export from `packages/shared/src/index.ts`

5.2. **Add nestjs-zod to server**
- `pnpm --filter @proso/server add nestjs-zod zod`
- Create `ZodValidationPipe` or use nestjs-zod built-in pipe
- Apply to `TtsController.synthesize()` endpoint
- Apply to `LicenseController.validate()` endpoint
- Apply to `CreditsController.balance()` and `deduct()` endpoints

5.3. **Add extension boundary validation**
- Validate server responses in extension API client
- Use existing Zod patterns from `src/utils/messaging/schemas.ts`

**Acceptance**: Invalid requests return 400 with structured errors; no unvalidated controller bodies.

---

### Phase 6: Test Scaffolding (FR-007)

**Goal**: Make it easy to add tests for untested files.

**Tasks**:

6.1. **Create test scaffold script** (`scripts/scaffold-test.sh`)
- Input: source file path
- Output: test file with boilerplate (imports, describe block, factory setup)
- Detect adapter files → generate contract test template
- Detect handler files → generate handler test template

6.2. **Document testing patterns** in project
- Add testing section to CLAUDE.md
- Contract test pattern (per-adapter, shared interface)
- Handler test pattern (registry + mock dependencies)
- Integration test pattern (composition root)

**Acceptance**: Running scaffold command generates working test boilerplate.

---

## Dependency Graph

```
Phase 1 (Pre-Commit) ─────────────────────────────────┐
Phase 2 (CI Pipeline) ────────────────────────────────┤
Phase 3 (Integration Tests) ──────┐                   │
Phase 4 (E2E Tests) ──────────────┤                   │
Phase 5 (Zod Validation) ─────────┤── All independent─┤
Phase 6 (Scaffolding) ────────────┘   of each other   │
                                                       │
                                           All merge to main
```

All phases are independent and can be implemented in any order. Phase 2 (CI) benefits from Phase 3/4/5 being complete (more tests to run), but is not blocked by them.

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Pre-commit hooks slow workflow | Parallel Lefthook execution; only staged files; `--no-verify` escape hatch |
| E2E tests flaky in CI | Docker-based browser; retry logic (max 2); deterministic test fixtures |
| Coverage thresholds block hotfixes | Override mechanism via `!coverage-override` comment; hotfix branches exempt |
| Zod bundle size increase | Tree-shaking removes unused schemas; monitor with size-limit |
| TypeScript incremental builds stale | `.tsbuildinfo` files in `.gitignore`; CI always does clean build |

---

## Verification Checklist

- [ ] Pre-commit hook blocks type errors and lint violations
- [ ] CI runs extension and server tests in parallel
- [ ] Coverage thresholds enforced at 60% statements
- [ ] `pnpm audit --audit-level=high` runs in CI
- [ ] Composition root wiring test catches singleton violations
- [ ] Handler registry test verifies all message types covered
- [ ] At least 1 contract test per port interface
- [ ] Playwright E2E test: popup → playback → footer → stop
- [ ] Server endpoints validate requests with Zod
- [ ] Shared package exports Zod schemas
- [ ] Extension bundle stays under 4MB
- [ ] All existing tests continue to pass
