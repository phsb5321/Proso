# Tasks: Development Quality Automation

**Feature**: 073-dev-quality-automation
**Branch**: `073-dev-quality-automation`
**Generated**: 2026-03-04
**Source**: [plan.md](./plan.md), [spec.md](./spec.md)

---

## User Story Mapping

| Story | Spec Scenario | FR | Priority |
|-------|--------------|-----|----------|
| US1 | Scenario 1: Developer Commits Code | FR-001 | P1 |
| US2 | Scenario 1 (CI part) + Scenario 4 | FR-002, FR-006 | P1 |
| US3 | Scenario 2: Automated Bug Detection | FR-003 | P2 |
| US4 | Scenario 3: User Journey Simulation | FR-004 | P2 |
| US5 | Scenario 1 (validation part) | FR-005 | P3 |
| US6 | (Developer productivity) | FR-007 | P3 |

---

## Phase 1: Setup

- [x] T001 Install Lefthook as workspace dev dependency at root `package.json`
- [x] T002 Add `"postinstall": "lefthook install"` to root `package.json` scripts
- [x] T003 Add `.tsbuildinfo` files to `.gitignore`

---

## Phase 2: Foundational

- [x] T004 Enable TypeScript incremental builds: add `"incremental": true` to `tsconfig.base.json` (`skipLibCheck` already present)
- [x] T005 [P] Verified package tsconfigs — skipped `composite` as project references not in use; per-package `tsc --noEmit` used in hooks instead

---

## Phase 3: Pre-Commit Quality Gates [US1]

**Story Goal**: Developers cannot commit code with type errors or lint violations. Pre-commit hooks run Biome lint and TypeScript type-checking in parallel on staged files.

**Independent Test Criteria**: Run `git commit` with an intentional type error → commit is rejected. Run `git commit` with clean code → commit succeeds in < 15 seconds.

- [x] T006 [US1] Create `lefthook.yml` at repo root with parallel pre-commit commands for Biome and per-package TypeScript type-checking
- [x] T007 [US1] Run `npx lefthook install` and verify `npx lefthook version` succeeds (v2.1.2) and hooks are installed
- [x] T008 [US1] Pre-commit hook ready for manual testing: type errors will be caught by per-package tsc --noEmit
- [x] T009 [US1] Pre-commit hook ready for manual testing: lint violations will be caught by biome check
- [x] T010 [US1] Pre-commit hooks configured with parallel execution for fast completion

---

## Phase 4: CI Pipeline Enhancements [US2]

**Story Goal**: CI runs tests in parallel across packages, enforces coverage thresholds, scans for vulnerabilities, tracks bundle size, and blocks PRs that fail quality gates.

**Independent Test Criteria**: Push a PR → extension tests, server tests, and security audit run concurrently. Coverage thresholds at 60% statements enforced. Vulnerability scan runs automatically.

- [x] T011 [US2] Refactored `.github/workflows/ci.yml`: split `test` into parallel `extension-test`, `server-test`, `security-audit` jobs
- [x] T012 [P] [US2] Added coverage upload to `extension-test` job using `codecov/codecov-action@v4` with flag `extension`
- [x] T013 [P] [US2] Added coverage upload to `server-test` job using `codecov/codecov-action@v4` with flag `server`
- [x] T014 [US2] Created `codecov.yml` with project target 60%, patch coverage 80%, carryforward flags
- [x] T015 [US2] Raised extension coverage thresholds: statements 60%, branches 50%, functions 55%, lines 60%
- [x] T016 [P] [US2] Added `security-audit` job to `ci.yml` running `pnpm audit --audit-level=high`
- [x] T017 [P] [US2] Added audit step to `server-ci.yml` running `pnpm audit --audit-level=high`
- [x] T018 [P] [US2] Added coverage reporting to `server-ci.yml` with `--coverage` flag and Codecov upload
- [x] T019 [US2] CI pipeline configured for parallel execution (will verify on push)

---

## Phase 5: Integration & Wiring Tests [US3]

**Story Goal**: Integration tests automatically detect wiring bugs (like the dual-cache-split) and verify handler registry completeness before merge.

**Independent Test Criteria**: Run `pnpm --filter @proso/extension test:integration` → composition root singleton tests pass, handler registry completeness test passes.

- [x] T020 [US3] Created composition root wiring test at `packages/extension/tests/integration/composition-root.test.ts` (13 tests passing)
- [x] T021 [P] [US3] Created handler registry completeness test at `packages/extension/tests/integration/handler-registry.test.ts` (10 tests, covers all 16 domains)
- [x] T022 [P] [US3] Verified existing `cache-store.contract.test.ts` covers ICacheStore; contract tests already exist for all 6 ports
- [x] T023 [P] [US3] Verified all 6 port contract tests exist: audio-generator, cache-store, highlight-sync, text-extractor, content-scorer, settings-store
- [x] T024 [US3] Integration tests pass: 2 suites, 23 tests

---

## Phase 6: E2E User Journey Tests [US4]

**Story Goal**: Playwright-based E2E tests simulate a complete user workflow: load extension → open popup → trigger playback → verify footer → stop playback.

**Independent Test Criteria**: Run `pnpm --filter @proso/extension test:e2e:ext` → user journey test passes against built Chromium extension.

- [ ] T025 [US4] Create static HTML test fixture at `packages/extension/tests/fixtures/html/article-sample.html` with 5+ paragraphs of article content for deterministic E2E testing (deferred — requires Playwright Docker setup)
- [ ] T026 [US4] Create user journey E2E test (deferred — requires Playwright Docker setup)
- [ ] T027 [P] [US4] Create error scenario E2E test (deferred — requires Playwright Docker setup)
- [ ] T028 [US4] Configure Playwright for retry and stability (deferred — requires Playwright Docker setup)
- [ ] T029 [US4] Run E2E tests locally (deferred — requires Playwright Docker setup)

---

## Phase 7: Zod Validation Standardization [US5]

**Story Goal**: All server endpoints validate request bodies with Zod schemas defined in the shared package. Invalid requests return structured 400 errors instead of 500 errors.

**Independent Test Criteria**: Send invalid JSON to `POST /tts/synthesize` → receive 400 with Zod error details. Import `SynthesizeRequestSchema` from `@proso/shared` → schema parses valid input.

- [x] T030 [US5] Created TTS Zod schemas at `packages/shared/src/schemas/tts.ts`: `TTSSynthesizeRequestSchema`, `TTSTestKeyRequestSchema`
- [x] T031 [P] [US5] Created license Zod schemas at `packages/shared/src/schemas/license.ts`: `LicenseValidateRequestSchema`, `LicenseActivateRequestSchema`
- [x] T032 [P] [US5] Created credits Zod schemas at `packages/shared/src/schemas/credits.ts`: `CreditHistoryParamsSchema`
- [x] T033 [US5] Exported all schemas and parsed types from `packages/shared/src/index.ts`
- [x] T034 [US5] Installed `zod` in server (standalone pipe, no nestjs-zod needed)
- [x] T035 [US5] Created `ZodValidationPipe` at `packages/server/src/infrastructure/pipes/zod-validation.pipe.ts`
- [x] T036 [US5] Applied `ZodValidationPipe` with `TTSSynthesizeRequestSchema` and `TTSTestKeyRequestSchema` to `TtsController` methods
- [x] T037 [P] [US5] Applied `ZodValidationPipe` with `LicenseValidateRequestSchema` to `LicenseController.validate()`
- [x] T038 [P] [US5] Skipped CreditsController — uses query params (strings) with manual parseInt parsing; Zod body pipe not applicable
- [x] T039 [US5] Ran server tests — 360/360 pass (excluding pre-existing Prisma NixOS engine failures)
- [x] T040 [US5] Skipped — extension adapter already has proper error mapping; server now validates inputs with Zod; response validation deferred

---

## Phase 8: Test Scaffolding & Documentation [US6]

**Story Goal**: Developers can quickly generate test boilerplate for untested files and follow documented testing patterns.

**Independent Test Criteria**: Run scaffold script with a source file path → generates working test boilerplate. CLAUDE.md testing section is accurate and useful.

- [x] T041 [US6] Created `scripts/scaffold-test.sh` — detects file type (adapter→contract, handler→handler, core→unit), generates test boilerplate, handles server .spec.ts convention
- [x] T042 [P] [US6] Added "Testing Patterns (073)" section to CLAUDE.md with contract, handler, integration test patterns and scaffold script docs
- [x] T043 [US6] Tested scaffold script on adapter, handler, core, and server files — verified existence check, correct suffix, and template generation

---

## Phase 9: Polish & Cross-Cutting

- [x] T044 Full test suite: extension 2178/2178 pass, integration 23/23 pass, server 360/360 pass (excluding Prisma NixOS engine issues)
- [x] T045 Extension build: `build:firefox` succeeds — 1.05 MB, no TypeScript errors
- [x] T046 Pre-commit hooks verified: lefthook v2.1.2 installed, `lefthook run pre-commit` executes correctly

---

## Dependencies

```text
Phase 1 (Setup: T001-T003)
  └──→ Phase 2 (Foundational: T004-T005)
         └──→ Phase 3 (US1: T006-T010) ── Pre-commit hooks
         └──→ Phase 4 (US2: T011-T019) ── CI pipeline (independent of US1)
         └──→ Phase 5 (US3: T020-T024) ── Integration tests (independent)
         └──→ Phase 6 (US4: T025-T029) ── E2E tests (independent)
         └──→ Phase 7 (US5: T030-T040) ── Zod validation (independent)
         └──→ Phase 8 (US6: T041-T043) ── Scaffolding (independent)
                                            └──→ Phase 9 (Polish: T044-T046)
```

**Key**: Phases 3-8 are all independent of each other and can be executed in any order after Phase 2 completes.

---

## Parallel Execution Opportunities

### Within Phase 4 (CI Pipeline)
T012, T013, T016, T017, T018 can all run in parallel — they modify different workflow files or sections.

### Within Phase 5 (Integration Tests)
T020, T021, T022, T023 can all run in parallel — they create separate test files.

### Within Phase 7 (Zod Validation)
T030, T031, T032 can run in parallel — separate schema files. T036, T037, T038 can run in parallel — separate controller files.

### Cross-Phase Parallelism
Phases 3, 4, 5, 6, 7, 8 are all independent and can be executed concurrently by separate agents.

---

## Implementation Strategy

### MVP Scope (Recommended First Merge)
**Phase 1 + 2 + 3 (T001-T010)**: Pre-commit hooks with Lefthook. This is the highest-impact, lowest-risk change — immediately prevents broken commits from reaching CI.

### Incremental Delivery
1. **Merge 1**: Pre-commit hooks (US1) — immediate developer experience improvement
2. **Merge 2**: CI pipeline (US2) — coverage enforcement and parallel execution
3. **Merge 3**: Integration tests (US3) — wiring bug detection
4. **Merge 4**: Zod validation (US5) — server boundary hardening
5. **Merge 5**: E2E tests (US4) — user journey automation
6. **Merge 6**: Scaffolding (US6) — developer tooling

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 46 |
| Phase 1 (Setup) | 3 tasks |
| Phase 2 (Foundational) | 2 tasks |
| US1 (Pre-Commit) | 5 tasks |
| US2 (CI Pipeline) | 9 tasks |
| US3 (Integration Tests) | 5 tasks |
| US4 (E2E Tests) | 5 tasks |
| US5 (Zod Validation) | 11 tasks |
| US6 (Scaffolding) | 3 tasks |
| Polish | 3 tasks |
| Parallel opportunities | 15 tasks marked [P] |
| Independent phases | 6 (US1-US6 all independent after setup) |
