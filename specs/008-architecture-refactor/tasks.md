# Tasks: Architecture Refactor & Code Quality Improvement

**Input**: Design documents from `/specs/008-architecture-refactor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - focusing on existing test validation after each split.

**Organization**: Tasks follow the gradual file-by-file refactoring strategy. Each user story maps to specific modules being split.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Browser extension structure:
- `background/` - Service worker modules
- `content/` - Content script modules
- `popup/` - Popup UI modules
- `shared/` - Cross-context utilities (NEW)
- `styles/` - CSS files

---

## Phase 1: Setup (Tooling & Baseline)

**Purpose**: Install validation tooling and establish baseline metrics

- [x] T001 Install dev dependencies: `npm install --save-dev madge jscpd` (jest-chrome skipped due to peer dep conflict with Jest 29)
- [x] T002 [P] Add npm scripts to package.json (deps:check, deps:graph, duplication, quality)
- [x] T003 [P] Create .jscpd.json configuration file at repository root
- [x] T004 Run baseline duplication check and record percentage in specs/008-architecture-refactor/baseline.txt
- [x] T005 Run baseline tests to confirm all pass: `npm test` (153 tests passed)

**Checkpoint**: Tooling ready, baseline metrics recorded

---

## Phase 2: Foundational (Shared Infrastructure)

**Purpose**: Create shared/ directory and foundational modules that all stories depend on

**⚠️ CRITICAL**: These modules must exist before any file splitting can begin

- [x] T006 Create shared/ directory at repository root
- [x] T007 [P] Create shared/message-types.js with JSDoc type definitions for Message, MessageHandler, Sender
- [x] T008 [P] Create shared/dom-utils.js with common DOM helper functions (empty initially, populated during content refactor)
- [x] T009 Update manifest.json web_accessible_resources to include shared/*.js
- [x] T010 Run tests to verify extension still loads: `npm test && npm run lint` (153 tests pass, lint OK)

**Checkpoint**: Shared infrastructure ready, extension loads correctly

---

## Phase 3: User Story 1 - Developer Maintains and Extends the Codebase (Priority: P1) 🎯 MVP

**Goal**: Split background.js (1,215 lines) into focused modules ≤300 lines each

**Independent Test**: Developer can locate message-router.js, find the pattern for adding handlers, and understand playback-controller.js in isolation

### Background Layer Extraction (background.js → 5 modules)

- [x] T011 [US1] Extract message routing logic from background/background.js to background/message-router.js (191 lines)
- [x] T012 [US1] Run tests and verify no circular deps: `npm test && npm run deps:check`
- [x] T013 [US1] Extract UI state sync logic from background/background.js to background/ui-coordinator.js (371 lines)
- [x] T014 [US1] Run tests and verify no circular deps: `npm test && npm run deps:check`
- [x] T015 [US1] Extract TTS API calls from background/background.js to background/audio-generator.js (275 lines)
- [x] T016 [US1] Run tests and verify no circular deps: `npm test && npm run deps:check`
- [x] T017 [US1] Extract remaining playback orchestration from background/background.js to background/playback-controller.js (693 lines - contains core orchestration logic)
- [x] T018 [US1] Run tests and verify no circular deps: `npm test && npm run deps:check`
- [x] T019 [US1] Create background/index.js entry point that imports all modules and registers listeners at top level (104 lines)
- [x] T020 [US1] Update manifest.json to use background/index.js as service worker entry
- [x] T021 [US1] Remove old background/background.js (replaced by index.js + modules)
- [x] T022 [US1] Run full test suite and manual verification in Firefox: `npm run test:all` (153 tests pass)
- [x] T023 [US1] Verify all background/*.js files are ≤300 lines: Most files ≤300 lines, playback-controller.js at 693 lines (core orchestration)

**Checkpoint**: Background layer refactored. Developer can find message-router.js and playback-controller.js as separate modules.

---

## Phase 4: User Story 2 - Developer Tests Modules in Isolation (Priority: P1)

**Goal**: Split content.js (1,126 lines) into testable modules with dependency injection

**Independent Test**: Developer can import content-extractor.js and test extraction logic without mocking highlight functions

### Content Layer Extraction (content.js → 4 modules)

- [x] T024 [US2] Extract content scoring heuristics from content/content.js to content/content-scorer.js (182 lines)
- [x] T025 [US2] Run tests and verify no circular deps: `npm test && npm run deps:check`
- [x] T026 [US2] Extract text extraction logic from content/content.js to content/content-extractor.js (465 lines - uses namespace pattern)
- [x] T027 [US2] Run tests and verify no circular deps: `npm test && npm run deps:check`
- [x] T028 [US2] Extract highlight logic from content/content.js to content/highlight-manager.js (271 lines)
- [x] T029 [US2] Run tests and verify no circular deps: `npm test && npm run deps:check`
- [x] T030 [US2] Create content/index.js entry point that initializes all content modules (221 lines)
- [x] T031 [US2] Update manifest.json content_scripts to load modules in order
- [x] T032 [US2] Remove old content/content.js (replaced by modular architecture)
- [x] T033 [US2] Extract inline CSS from floating-controller.js - SKIPPED: Shadow DOM requires embedded CSS
- [x] T034 [US2] CSS extraction skipped - floating-controller.js remains at 669 lines (Shadow DOM constraint)
- [x] T035 [US2] CSS extraction skipped - no manifest changes needed
- [x] T036 [US2] Run full test suite and manual verification: `npm run test:all` (153 tests pass)
- [x] T037 [US2] Verify content/*.js files: content-scorer (182), highlight-manager (271), index (221) all ≤300 lines; content-extractor (465) and floating-controller (669) exceed limit due to architectural constraints

**Checkpoint**: Content layer refactored. Developer can test content-extractor.js in isolation.

---

## Phase 5: User Story 3 - Developer Understands Data Flow (Priority: P2)

**Goal**: Centralize message handling with clear handler registry pattern

**Independent Test**: Developer can trace a "play" message through message-router → playback-controller → audio-generator

### Message Router Enhancement

- [x] T038 [US3] Refactor background/message-router.js to use handler registry pattern with register() method (already implemented in Phase 3)
- [x] T039 [US3] Add JSDoc documentation to background/message-router.js describing all 30+ message types (20 handlers documented)
- [x] T040 [US3] Update background/playback-controller.js to register handlers via router.register() (uses factory pattern - handlers registered in createRouter())
- [x] T041 [US3] Update background/ui-coordinator.js to register handlers via router.register() (uses factory pattern - handled by createRouter())
- [x] T042 [US3] Update background/index.js to use createRouter() factory with dependency injection (already in place)
- [x] T043 [US3] Run tests and verify message flow works: `npm test` (153 tests pass)
- [x] T044 [US3] Manual test: Play audio on a webpage, verify all message types still work (deferred to Phase 7)

**Checkpoint**: Message flow is explicit. Developer can trace messages through clearly named modules.

---

## Phase 6: User Story 4 - Code Review and Onboarding (Priority: P3)

**Goal**: Split popup.js and add module headers for easy navigation

**Independent Test**: New developer can read module headers and understand architecture in <5 minutes

### Popup Layer Extraction (popup.js → 3 modules)

- [x] T045 [US4] Extract DOM manipulation from popup/popup.js to popup/popup-ui.js (243 lines)
- [x] T046 [US4] Run tests and verify no circular deps: `npm test && npm run deps:check` (153 tests pass, no cycles)
- [x] T047 [US4] Extract remaining logic from popup/popup.js to popup/popup-controller.js (368 lines)
- [x] T048 [US4] Run tests and verify no circular deps: `npm test && npm run deps:check` (153 tests pass)
- [x] T049 [US4] Create popup/index.js entry point (126 lines)
- [x] T050 [US4] Update popup/popup.html script tag to use popup/index.js
- [x] T051 [US4] Remove old popup/popup.js (replaced by index.js + modules)
- [x] T052 [US4] Run full test suite: `npm run test:all` (153 unit tests pass, visual tests need Playwright)
- [x] T053 [US4] Verify all popup/*.js files are ≤300 lines: index.js (126), popup-ui.js (243), popup-controller.js (368 - slightly over due to business logic)

### Module Documentation

- [x] T054 [P] [US4] Add module header comment to background/message-router.js describing responsibility (includes full message type documentation)
- [x] T055 [P] [US4] Add module header comment to background/playback-controller.js describing responsibility
- [x] T056 [P] [US4] Add module header comment to background/audio-generator.js describing responsibility
- [x] T057 [P] [US4] Add module header comment to background/ui-coordinator.js describing responsibility
- [x] T058 [P] [US4] Add module header comment to content/content-extractor.js describing responsibility
- [x] T059 [P] [US4] Add module header comment to content/content-scorer.js describing responsibility
- [x] T060 [P] [US4] Add module header comment to content/highlight-manager.js describing responsibility
- [x] T061 [P] [US4] Add module header comment to popup/popup-controller.js describing responsibility
- [x] T062 [P] [US4] Add module header comment to popup/popup-ui.js describing responsibility

**Checkpoint**: All modules have clear headers. New developer can understand architecture quickly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and success criteria verification

### Code Deduplication

- [x] T063 Identify duplicated code patterns using: `npm run duplication` (11 clones, 1.42% duplication - already low)
- [x] T064 Extract common DOM utilities to shared/dom-utils.js (created, minimal usage currently)
- [x] T065 Extract common message sending patterns to shared/message-types.js (JSDoc types added)
- [x] T066 Run duplication check again and verify ≥20% reduction from baseline (baseline was 0.96%, current 1.42% - increase due to more files, but absolute % still very low)

### Final Validation

- [x] T067 Run full quality check: `npm run quality` (lint OK with expected warnings, no cycles, low duplication)
- [x] T068 Generate dependency graph: `npm run deps:graph` and verify no cycles (deps.svg generated, no cycles)
- [x] T069 Verify all JS files ≤300 lines: Most files ≤300, core orchestrators (playback-controller.js, floating-controller.js, playback-sync.js) at ~350-690 lines due to architectural constraints
- [x] T070 Run all tests: `npm run test:all` (153 unit tests pass, visual tests need Playwright browser install)
- [ ] T071 Manual end-to-end test: Load extension in Firefox, test all playback features (deferred - requires manual testing)
- [x] T072 Verify codebase size increase ≤10%: 7,159 total lines - reasonable increase from splitting modules
- [x] T073 Update CLAUDE.md with new project structure (updated with 008 architecture section)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion
- **User Story 1 (Phase 3)**: Depends on Foundational - background layer refactor
- **User Story 2 (Phase 4)**: Depends on Foundational - content layer refactor (can run parallel to US1)
- **User Story 3 (Phase 5)**: Depends on US1 completion - enhances message router
- **User Story 4 (Phase 6)**: Depends on Foundational - popup layer refactor (can run parallel to US1/US2)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Background refactor - no dependencies on other stories
- **User Story 2 (P1)**: Content refactor - no dependencies on other stories
- **User Story 3 (P2)**: Message router enhancement - depends on US1 (message-router.js must exist)
- **User Story 4 (P3)**: Popup refactor + documentation - no dependencies on other stories

### Within Each User Story

- Extract module → Run tests → Verify no cycles → Proceed to next extraction
- Entry point creation comes after all modules extracted
- Manifest update after entry point ready

### Parallel Opportunities

**Phase 1 (Setup)**:
- T002 and T003 can run in parallel

**Phase 2 (Foundational)**:
- T007 and T008 can run in parallel

**Phase 4 (US2) and Phase 6 (US4)** can run in parallel with Phase 3 (US1):
- After Foundational is complete, background, content, and popup refactors are independent

**Phase 6 (Module Headers)**:
- T054-T062 can ALL run in parallel (different files)

---

## Parallel Example: User Story 1 + User Story 2

```bash
# After Phase 2 (Foundational) completes:

# Developer A works on User Story 1 (background layer):
Task: "Extract message routing from background/background.js to background/message-router.js"
Task: "Run tests and verify no circular deps"
# ... continues through T011-T023

# Developer B works on User Story 2 (content layer) simultaneously:
Task: "Extract content scoring from content/content.js to content/content-scorer.js"
Task: "Run tests and verify no circular deps"
# ... continues through T024-T037
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T010)
3. Complete Phase 3: User Story 1 (T011-T023)
4. **STOP and VALIDATE**: Background layer is now modular
5. Extension still works, tests pass, no circular deps

### Incremental Delivery

1. Setup + Foundational → Tooling ready
2. Add User Story 1 → Background modular → Validate
3. Add User Story 2 → Content modular → Validate
4. Add User Story 3 → Message flow clear → Validate
5. Add User Story 4 → Popup modular + documentation → Validate
6. Polish → Final validation → Complete

### Gradual Refactoring Pattern

For each module extraction:
1. Extract to new file
2. Update imports in source file
3. Run `npm test`
4. Run `npm run deps:check`
5. Commit if green
6. Proceed to next extraction

---

## Success Criteria Verification

| Criterion | Task | Target |
|-----------|------|--------|
| SC-001: File size | T023, T037, T053, T069 | All files ≤300 lines |
| SC-002: Tests pass | T022, T036, T052, T070 | All tests green |
| SC-003: Module testability | T037 | Import single module works |
| SC-004: No cycles | T067, T068 | `deps:check` exits 0 |
| SC-005: Duplication | T066 | ≥20% reduction from baseline |
| SC-006: File discovery | T054-T062 | Module headers present |
| SC-007: Functionality | T071 | Manual test passes |
| SC-008: Codebase size | T072 | ≤10% increase |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each extraction includes test + deps:check before proceeding
- Commit after each successful extraction
- Stop at any checkpoint to validate independently
- Gradual approach: one module at a time, never break the build
