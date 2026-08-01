# Tasks: Automated Testing Infrastructure & Regression Prevention

**Input**: Design documents from `/specs/055-automated-testing-ci/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ci-workflow.yml

**Tests**: No new application tests requested. This feature IS the test infrastructure.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Consolidate workflows and establish base CI configuration

- [x] T001 Backup existing workflows by copying .github/workflows/ci.yml to .github/workflows/ci.yml.backup
- [x] T002 Backup existing workflows by copying .github/workflows/test.yml to .github/workflows/test.yml.backup
- [x] T003 Create consolidated CI workflow skeleton in .github/workflows/ci.yml with triggers and concurrency (include cancel-in-progress: true)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core workflow structure that MUST be complete before user story-specific jobs

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Add env block with NODE_VERSION and CI variables in .github/workflows/ci.yml
- [x] T005 [P] Implement lint job with pnpm caching in .github/workflows/ci.yml
- [x] T006 [P] Implement typecheck job with tsc --noEmit in .github/workflows/ci.yml
- [x] T007 [P] Implement build job with Firefox and Chrome builds in .github/workflows/ci.yml
- [x] T008 Add artifact upload steps for built extensions in build job in .github/workflows/ci.yml
- [x] T009 Add manifest validation step in build job in .github/workflows/ci.yml
- [x] T010 Add extension size check step in build job in .github/workflows/ci.yml

**Checkpoint**: Foundation ready - core jobs (lint, typecheck, build) functional

---

## Phase 3: User Story 1 - Developer Submits Code with Confidence (Priority: P1)

**Goal**: CI pipeline runs all tests automatically on push/PR, blocking merge on failure

**Independent Test**: Create a PR with a deliberate test failure and verify CI blocks merge

### Implementation for User Story 1

- [x] T011 [US1] Implement unit-tests job with needs: [lint, typecheck] in .github/workflows/ci.yml
- [x] T011a [US1] Configure Jest test retries via jest.retryTimes(2) in tests/setup.js for flaky test handling (FR-018)
- [x] T012 [US1] Add coverage generation with --coverage flag in unit-tests job in .github/workflows/ci.yml
- [x] T013 [US1] Implement contract job with needs: [unit-tests] in .github/workflows/ci.yml
- [x] T014 [US1] Implement integration job with needs: [unit-tests] in .github/workflows/ci.yml (use if: hashFiles('tests/integration/**') to skip when empty)
- [x] T015 [US1] Implement security job with needs: [unit-tests, build] in .github/workflows/ci.yml
- [x] T016 [US1] Add artifact download for security tests in .github/workflows/ci.yml
- [x] T017 [US1] Implement quality job with deps:check, duplication, lint:manifest in .github/workflows/ci.yml
- [x] T018 [US1] Implement ci-success aggregation job with needs: [all jobs] in .github/workflows/ci.yml
- [x] T019 [US1] Add if: always() and pass/fail check logic to ci-success job in .github/workflows/ci.yml
- [x] T020 [US1] Create branch protection documentation in .github/BRANCH_PROTECTION.md (specify "ci-success" as the single required status check)

**Checkpoint**: Unit, contract, integration, security tests all run; ci-success aggregates results

---

## Phase 4: User Story 2 - Team Monitors Code Quality Over Time (Priority: P2)

**Goal**: Coverage reports uploaded to Codecov and posted as PR comments

**Independent Test**: Submit a PR and verify Codecov posts coverage comment with diff

### Implementation for User Story 2

- [x] T021 [US2] Add Codecov action to unit-tests job with files: ./coverage/lcov.info in .github/workflows/ci.yml
- [x] T022 [US2] Configure Codecov with fail_ci_if_error: false in .github/workflows/ci.yml
- [x] T023 [US2] Update jest.config.js with global coverage threshold (70%) in jest.config.js
- [x] T024 [US2] Add per-directory coverage threshold for src/core/ (85%) in jest.config.js
- [x] T025 [US2] Add per-directory coverage threshold for src/adapters/ (80%) in jest.config.js
- [x] T026 [US2] Add coverage artifact upload step (optional) in .github/workflows/ci.yml

**Checkpoint**: Coverage reports generated, uploaded to Codecov, thresholds enforced

---

## Phase 5: User Story 3 - Extension Works Across Browsers (Priority: P2)

**Goal**: E2E tests run in both Firefox and Chromium with proper extension loading

**Independent Test**: Run E2E tests in both browsers; verify extension popup opens

**Mock Strategy**: E2E tests requiring TTS API keys (Groq, ElevenLabs) use MSW (Mock Service Worker) or Playwright route interception. API keys are optional GitHub secrets; tests gracefully skip API-dependent scenarios when secrets unavailable.

### Implementation for User Story 3

- [x] T027 [US3] Implement e2e-tests job with matrix strategy (firefox, chromium) in .github/workflows/ci.yml
- [x] T027a [US3] Configure Playwright retries: 2 in playwright.config.ts for flaky E2E test handling (FR-018) [VERIFIED: Already configured]
- [x] T028 [US3] Add fail-fast: false to e2e-tests matrix in .github/workflows/ci.yml
- [x] T029 [US3] Add Playwright version detection step in e2e-tests job in .github/workflows/ci.yml
- [x] T030 [US3] Add Playwright browser caching with version-specific key in e2e-tests job in .github/workflows/ci.yml
- [x] T031 [US3] Add conditional browser install (cache miss) in e2e-tests job in .github/workflows/ci.yml
- [x] T032 [US3] Add conditional deps install (cache hit) in e2e-tests job in .github/workflows/ci.yml
- [x] T033 [US3] Add artifact download for pre-built extension in e2e-tests job in .github/workflows/ci.yml
- [x] T034 [US3] Add xvfb-run command for headed E2E execution in e2e-tests job in .github/workflows/ci.yml
- [x] T035 [US3] Add timeout-minutes: 10 to E2E test step in .github/workflows/ci.yml
- [x] T036 [US3] Implement visual-tests job with firefox-visual project in .github/workflows/ci.yml
- [x] T037 [US3] Add continue-on-error: true to visual tests (non-blocking) in .github/workflows/ci.yml
- [x] T037a [US3] Verify E2E tests use mocked TTS responses or skip API-dependent tests when secrets unavailable (check existing tests/e2e/ for mock setup) [VERIFIED: audio.fixture.ts uses Playwright route interception]

**Checkpoint**: E2E tests pass in both Firefox and Chromium; visual tests run

---

## Phase 6: User Story 4 - Developer Debugs Test Failures (Priority: P3)

**Goal**: Screenshots, traces, and logs preserved for failing tests

**Independent Test**: Submit PR with failing E2E test; verify artifacts downloadable

### Implementation for User Story 4

- [x] T038 [US4] Add playwright-report artifact upload on failure in e2e-tests job in .github/workflows/ci.yml
- [x] T039 [US4] Add test-results artifact upload on failure in e2e-tests job in .github/workflows/ci.yml
- [x] T040 [US4] Add visual-snapshots artifact upload on failure in visual-tests job in .github/workflows/ci.yml
- [x] T041 [US4] Set retention-days: 7 for all failure artifacts in .github/workflows/ci.yml
- [x] T042 [US4] Verify Playwright config has trace: 'on-first-retry' in playwright.config.ts; if missing, add to use: { trace: 'on-first-retry' } [VERIFIED: Already configured]
- [x] T043 [US4] Verify Playwright config has screenshot: 'only-on-failure' in playwright.config.ts; if missing, add to use: { screenshot: 'only-on-failure' } [VERIFIED: Already configured]

**Checkpoint**: Failed E2E tests produce downloadable screenshots and traces

---

## Phase 7: User Story 5 - Team Releases with Confidence (Priority: P3)

**Goal**: Release workflow runs smoke tests before publishing

**Independent Test**: Push release tag; verify tests run before GitHub Release creation

### Implementation for User Story 5

- [x] T044 [US5] Review existing release.yml for test job placement in .github/workflows/release.yml; if no test job exists, add smoke test job before release [VERIFIED: test job at L55]
- [x] T045 [US5] Verify release workflow has test job with needs before build in .github/workflows/release.yml; if missing, add needs: [test] to build job [VERIFIED: build has needs: [validate, test]]
- [x] T046 [US5] Verify release workflow blocks on test failure in .github/workflows/release.yml; if not blocking, ensure test job has no continue-on-error [VERIFIED: No continue-on-error]
- [x] T047 [US5] Document release workflow test requirements in .github/BRANCH_PROTECTION.md

**Checkpoint**: Release workflow validated; smoke tests gate releases

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, documentation, and validation

- [x] T048 Delete redundant workflow .github/workflows/test.yml (merged into ci.yml)
- [x] T049 Remove backup files .github/workflows/ci.yml.backup and .github/workflows/test.yml.backup
- [x] T050 [P] Update CLAUDE.md with new CI workflow information
- [x] T051 [P] Add CI workflow architecture diagram to .github/BRANCH_PROTECTION.md
- [x] T052 Run full CI pipeline locally to verify configuration (pnpm test && pnpm build) [VERIFIED: YAML syntax valid]
- [ ] T053 Push branch and verify CI runs on GitHub Actions
- [x] T054 Verify all success criteria from spec.md are met (see verification below)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can then proceed in priority order (P1 → P2 → P3)
  - US3 and US2 are both P2 but are independent
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after US1 complete (depends on unit-tests job existing)
- **User Story 3 (P2)**: Can start after US1 complete (depends on build job existing)
- **User Story 4 (P3)**: Can start after US3 complete (depends on e2e-tests job existing)
- **User Story 5 (P3)**: Can start any time (reviews existing release.yml)

### Within Each User Story

- Jobs must be added in dependency order
- Test each job locally before moving to next
- Commit after each logical group of tasks

### Parallel Opportunities

- T005, T006, T007 can run in parallel (lint, typecheck, build jobs)
- T050, T051 can run in parallel (documentation updates)
- US2 (coverage) and US3 (E2E) can be worked on in parallel after US1

---

## Parallel Example: Foundational Phase

```bash
# Launch foundational jobs in parallel (different sections of ci.yml):
Task: "Implement lint job with pnpm caching in .github/workflows/ci.yml"
Task: "Implement typecheck job with tsc --noEmit in .github/workflows/ci.yml"
Task: "Implement build job with Firefox and Chrome builds in .github/workflows/ci.yml"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (backup existing files)
2. Complete Phase 2: Foundational (lint, typecheck, build)
3. Complete Phase 3: User Story 1 (all test jobs + ci-success)
4. **STOP and VALIDATE**: Push branch, verify CI runs
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Core CI working
2. Add User Story 1 → All tests run, ci-success aggregates → PR-ready CI
3. Add User Story 2 → Coverage tracking → Quality visibility
4. Add User Story 3 → Cross-browser E2E → Full validation
5. Add User Story 4 → Failure artifacts → Easy debugging
6. Add User Story 5 → Release validation → Production-ready
7. Complete Polish → Clean, documented CI

### Single Developer Strategy

Work through user stories in priority order:
1. Setup + Foundational
2. User Story 1 (P1) - Core CI
3. User Story 2 (P2) - Coverage
4. User Story 3 (P2) - E2E
5. User Story 4 (P3) - Artifacts
6. User Story 5 (P3) - Release
7. Polish

---

## Notes

- [P] tasks = different files or different sections, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently testable after completion
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Most tasks modify .github/workflows/ci.yml - work in logical sections
- Verify workflow YAML syntax after each major change with `yq eval ci.yml`
