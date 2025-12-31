# Tasks: Type Safety & Import/Export Validation

**Input**: Design documents from `/specs/009-type-safety-validation/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Not explicitly requested - focusing on manual verification of ESLint catching errors.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Browser extension structure (existing):
- `background/` - Service worker modules
- `content/` - Content script modules
- `popup/` - Popup UI modules
- `shared/` - Cross-context utilities
- Repository root - ESLint configuration

---

## Phase 1: Setup (Dependencies & Configuration)

**Purpose**: Install ESLint and eslint-plugin-import-x, configure for ES modules

- [x] T001 Install ESLint and eslint-plugin-import-x: `npm install --save-dev eslint eslint-plugin-import-x`
- [x] T002 Create eslint.config.js at repository root with flat config format
- [x] T003 [P] Create .eslintignore at repository root (exclude node_modules, tests, coverage)
- [x] T004 Verify baseline: Run `npx eslint .` and record any existing errors in baseline.txt

**Checkpoint**: ESLint installed, basic configuration in place

---

## Phase 2: Foundational (Core ESLint Rules)

**Purpose**: Configure import/export validation rules that all user stories depend on

**⚠️ CRITICAL**: These rules must be configured before any user story can be verified

- [x] T005 Configure import-x/named rule in eslint.config.js to detect missing named exports
- [x] T006 [P] Configure import-x/namespace rule for namespace import validation
- [x] T007 [P] Configure import-x/default rule for default export validation
- [x] T008 [P] Configure import-x/export rule to detect duplicate exports
- [x] T009 Configure import-x/no-unresolved with browser global ignored
- [x] T010 Add WebExtension globals (browser, document, window, etc.) to eslint.config.js languageOptions
- [x] T011 Configure import-x/resolver settings for .js extensions
- [x] T012 Run `npx eslint .` and verify no false positives on valid imports

**Checkpoint**: ESLint import rules configured and passing on valid codebase

---

## Phase 3: User Story 1 - Developer Catches Export Mismatches (Priority: P1) 🎯 MVP

**Goal**: Import/export mismatches are detected at lint time with clear error messages

**Independent Test**: Introduce `import { nonExistent } from './visualizer.js'` in popup/popup-ui.js, run `npm run lint`, verify it fails with clear error

### Implementation for User Story 1

- [x] T013 [US1] Test: Temporarily add bad import to popup/popup-ui.js, verify ESLint catches it
- [x] T014 [US1] Verify error message includes file path, module path, and missing export name
- [x] T015 [US1] Revert test change in popup/popup-ui.js
- [x] T016 [US1] Test: Verify aliased imports like `{ setState as setVisualizerState }` pass validation
- [x] T017 [US1] Document in quickstart.md: Example of error format for import mismatches

**Checkpoint**: User Story 1 complete - Import mismatches are caught by ESLint

---

## Phase 4: User Story 2 - Developer Gets Clear Error Messages (Priority: P1)

**Goal**: Error messages include all required context (file, module, missing export, available exports)

**Independent Test**: Verify ESLint output format contains file:line, module path, missing name

### Implementation for User Story 2

- [x] T018 [US2] Verify ESLint default output includes source file path and line number
- [x] T019 [US2] Verify ESLint default output includes target module path
- [x] T020 [US2] Verify ESLint default output includes missing export name
- [x] T021 [US2] If available exports not shown: Research custom ESLint formatter options (SKIP: Not critical, error messages are actionable without listing all exports)
- [x] T022 [US2] Update quickstart.md with example error output format

**Checkpoint**: User Story 2 complete - Error messages are clear and actionable

---

## Phase 5: User Story 3 - Validation Integrates with Workflow (Priority: P2)

**Goal**: `npm test` runs import validation automatically before Jest

**Independent Test**: Run `npm test`, verify lint runs first and fails early on import errors

### Implementation for User Story 3

- [x] T023 [US3] Add "lint" script to package.json: `"lint": "eslint ."`
- [x] T024 [P] [US3] Add "lint:fix" script to package.json: `"lint:fix": "eslint . --fix"`
- [x] T025 [US3] Modify "test" script in package.json to run lint first: `"test": "npm run lint && jest"`
- [x] T026 [US3] Test workflow: Introduce bad import, run `npm test`, verify early failure (verified in T013)
- [x] T027 [US3] Test workflow: Fix bad import, run `npm test`, verify all tests pass (153 tests pass)
- [x] T028 [US3] Add ESLint caching for performance: Update lint script to `eslint --cache .`

**Checkpoint**: User Story 3 complete - Workflow integration working

---

## Phase 6: User Story 4 - Message Contract Validation (Priority: P3 - Optional)

**Goal**: Message payloads validated against schemas using Zod

**Independent Test**: Define play message schema, send invalid payload, verify test failure

### Implementation for User Story 4

- [x] T029 [US4] Install Zod: `npm install --save-dev zod` (dev dependency only)
- [x] T030 [US4] Create shared/message-schemas.js with basic message type schemas
- [x] T031 [P] [US4] Define PlayMessage schema with provider, voice, speed, mode fields
- [x] T032 [P] [US4] Define PauseMessage, StopMessage, NextMessage, PrevMessage schemas
- [x] T033 [P] [US4] Define SetVoiceMessage, SetSpeedMessage, SetProviderMessage schemas
- [x] T034 [US4] Create tests/unit/message-schemas.test.js to validate schema definitions (55 tests)
- [x] T035 [US4] Document message schema usage in quickstart.md

**Checkpoint**: User Story 4 complete (optional) - Message contracts defined

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T036 Run full quality check: `npm run lint && npm test` (153 tests pass)
- [x] T037 Verify ESLint completes in <5 seconds on full codebase (3.38s)
- [x] T038 [P] Update CLAUDE.md with new npm scripts (lint, lint:fix, lint:manifest, test:unit)
- [x] T039 Run verification from plan.md: Test that Feature 008 bug would be caught (VERIFIED: ESLint catches it)
- [x] T040 Update specs/009-type-safety-validation/checklist.md with task completion status

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - core validation
- **User Story 2 (Phase 4)**: Depends on Foundational - error message quality
- **User Story 3 (Phase 5)**: Depends on Foundational - workflow integration
- **User Story 4 (Phase 6)**: Depends on Setup only - Zod is independent of ESLint
- **Polish (Phase 7)**: Depends on US1, US2, US3 complete (US4 optional)

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational - Integrates lint into test script
- **User Story 4 (P3)**: Independent of US1/US2/US3 - uses Zod, not ESLint import rules

### Within Each User Story

- Verify rules before testing outcomes
- Test with intentional errors before declaring success
- Document in quickstart.md for each story

### Parallel Opportunities

**Phase 1 (Setup)**:
- T003 can run in parallel with T002

**Phase 2 (Foundational)**:
- T006, T007, T008 can run in parallel (different rules)

**Phase 5 (US3)**:
- T024 can run in parallel with T023

**Phase 6 (US4)**:
- T031, T032, T033 can ALL run in parallel (different schemas)

---

## Parallel Example: User Story 4

```bash
# Launch schema definitions in parallel:
Task: "Define PlayMessage schema in shared/message-schemas.js"
Task: "Define PauseMessage, StopMessage schemas in shared/message-schemas.js"
Task: "Define SetVoiceMessage, SetSpeedMessage schemas in shared/message-schemas.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T012)
3. Complete Phase 3: User Story 1 (T013-T017)
4. **STOP and VALIDATE**: Import mismatches are caught
5. Extension development is now protected from import bugs

### Incremental Delivery

1. Setup + Foundational → ESLint configured
2. Add User Story 1 → Import validation working → MVP complete!
3. Add User Story 2 → Error messages verified → Better DX
4. Add User Story 3 → Workflow integrated → Seamless testing
5. Add User Story 4 (optional) → Message contracts → Type-safe messaging

### Gradual Rollout

For each phase:
1. Implement configuration/code
2. Run `npx eslint .` or `npm test`
3. Verify expected behavior
4. Commit if green
5. Proceed to next phase

---

## Success Criteria Verification

| Criterion | Task | Target |
|-----------|------|--------|
| SC-001: 100% accuracy | T013 | All import mismatches caught |
| SC-002: Error messages | T018-T021 | File, module, missing name shown |
| SC-003: <5 seconds | T037 | Performance check |
| SC-004: Zero false positives | T012 | No errors on valid imports |
| SC-005: Catches F008 bug | T039 | Specific verification |
| SC-006: No prod changes | T001-T028 | Only dev deps and config |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- US4 (Zod) is optional P3 - can be skipped for MVP
- ESLint caching (T028) improves repeated lint performance
- All changes are dev-time only - no production code modified
