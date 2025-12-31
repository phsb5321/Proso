# Tasks: UI Quality & Testing Infrastructure

**Input**: Design documents from `/specs/003-ui-quality-testing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included as requested in FR-006 (visual regression) and FR-007 (unit tests)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md, this is a Browser Extension with structure:
- `popup/`, `options/`, `content/`, `background/` at repository root
- `styles/` for design tokens
- `tests/unit/` and `tests/visual/` for new test infrastructure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and test tooling setup

- [x] T001 Create package.json with Jest, Playwright, and web-ext dependencies in package.json
- [x] T002 [P] Create Jest configuration for ES modules in jest.config.js
- [x] T003 [P] Create Playwright configuration for Firefox extension testing in playwright.config.js
- [x] T004 [P] Create test directory structure: tests/unit/, tests/visual/, tests/visual/__snapshots__/
- [x] T005 Install dependencies and verify setup with npm install

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: US1 and US2 share token dependencies; US4-US6 require test infrastructure

- [x] T006 Create stacking layer token variables (z-index system) in styles/tokens.css
- [x] T007 Add isolation utility class for stacking contexts in styles/tokens.css
- [x] T008 [P] Create jest-webextension-mock setup file in tests/setup.js
- [x] T009 [P] Create Playwright extension loading helper in tests/visual/helpers/extension-loader.js

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Fix Visual Stacking Issues (Priority: P1) 🎯 MVP

**Goal**: Ensure all UI elements display in correct visual order without icons floating above overlays

**Independent Test**: Open popup with onboarding overlay and verify no elements poke through

### Implementation for User Story 1

- [x] T010 [US1] Add isolation: isolate to .onboarding-overlay in popup/popup.css
- [x] T011 [US1] Update z-index for .onboarding-tooltip to use local stacking in popup/popup.css
- [x] T012 [US1] Add position: relative and z-index to .visualizer-section in popup/popup.css
- [x] T013 [US1] Update .status-banner z-index to overlay layer (100) in popup/popup.css
- [x] T014 [US1] Add z-index to .player-controls hover states in popup/popup.css
- [x] T015 [US1] Update .play-btn hover transform to not break stacking in popup/popup.css
- [x] T016 [US1] Verify DOM order supports correct stacking without high z-index values in popup/popup.html

**Checkpoint**: User Story 1 complete - all stacking issues fixed, overlay fully covers content

---

## Phase 4: User Story 2 - Replace Purple Color Scheme (Priority: P1) 🎯 MVP

**Goal**: Replace all purple accent colors with Teal/Cyan (#0D9488, #14B8A6)

**Independent Test**: Verify no purple colors visible; all accent elements are teal/cyan

### Implementation for User Story 2

- [x] T017 [US2] Update --color-accent-primary from #7c3aed to #0D9488 in styles/tokens.css
- [x] T018 [US2] Update --color-accent-secondary from #a855f7 to #14B8A6 in styles/tokens.css
- [x] T019 [US2] Update --color-accent-gradient to teal gradient in styles/tokens.css
- [x] T020 [US2] Update --shadow-accent with teal color in styles/tokens.css
- [x] T021 [US2] Update --color-focus-ring with teal color in styles/tokens.css
- [x] T022 [US2] Replace hardcoded rgba(124, 58, 237, *) values in popup/popup.css
- [x] T023 [P] [US2] Replace hardcoded purple values in options/options.css
- [x] T024 [US2] Update light mode accent colors for proper contrast in styles/tokens.css
- [x] T025 [US2] Verify WCAG AA contrast ratios for all text/background combinations

**Checkpoint**: User Story 2 complete - all purple replaced with teal/cyan, contrast verified

---

## Phase 5: User Story 3 - Align with Firefox Design System (Priority: P2)

**Goal**: Match Firefox Photon/Acorn design patterns for native browser feel

**Independent Test**: Compare buttons, inputs, and spacing against Firefox Photon specs

### Implementation for User Story 3

- [x] T026 [US3] Update button border-radius to match Photon (4px) in popup/popup.css
- [x] T027 [US3] Update button padding to match Photon (8px 16px) in popup/popup.css
- [x] T028 [US3] Update input/select styling to match Photon patterns in popup/popup.css
- [x] T029 [US3] Update .slider styling for Photon-like appearance in popup/popup.css
- [x] T030 [P] [US3] Update options page elements to match Photon in options/options.css
- [x] T031 [US3] Adjust focus ring styling to match Firefox conventions in popup/popup.css
- [x] T032 [US3] Update scrollbar styling to match Firefox defaults in popup/popup.css
- [x] T033 [US3] Verify reduced motion preferences are respected (prefers-reduced-motion)

**Checkpoint**: User Story 3 complete - extension matches Firefox native styling

---

## Phase 6: User Story 4 - Implement Visual Regression Testing (Priority: P2)

**Goal**: Automated screenshot comparison to catch CSS regressions

**Independent Test**: Run visual tests, make CSS change, verify diff is detected

### Implementation for User Story 4

- [x] T034 [US4] Create popup visual test for idle state (dark mode) in tests/visual/popup.visual.spec.js
- [x] T035 [P] [US4] Create popup visual test for idle state (light mode) in tests/visual/popup.visual.spec.js
- [x] T036 [P] [US4] Create popup visual test for playing state in tests/visual/popup.visual.spec.js
- [x] T037 [P] [US4] Create popup visual test for paused state in tests/visual/popup.visual.spec.js
- [x] T038 [P] [US4] Create popup visual test for error banner state in tests/visual/popup.visual.spec.js
- [x] T039 [P] [US4] Create popup visual test for onboarding overlay state in tests/visual/popup.visual.spec.js
- [x] T040 [US4] Generate initial baseline screenshots for all states
- [x] T041 [US4] Add npm scripts for visual test commands in package.json
- [x] T042 [US4] Document visual test workflow in specs/003-ui-quality-testing/quickstart.md

**Checkpoint**: User Story 4 complete - visual regression tests cover all UI states

---

## Phase 7: User Story 5 - Refactor CSS Architecture (Priority: P2)

**Goal**: Eliminate hardcoded values; all styles use design tokens

**Independent Test**: Grep for hardcoded colors/spacing; count should be zero outside tokens.css

### Implementation for User Story 5

- [x] T043 [US5] Audit popup/popup.css for hardcoded color values and list replacements
- [x] T044 [US5] Replace all hardcoded hex colors with token references in popup/popup.css
- [x] T045 [P] [US5] Replace all hardcoded hex colors with token references in options/options.css
- [x] T046 [US5] Add semantic tokens for component-specific colors in styles/tokens.css
- [x] T047 [US5] Create --color-accent-bg token for subtle accent backgrounds in styles/tokens.css
- [x] T048 [US5] Verify token changes propagate correctly to all components
- [x] T049 [US5] Document token naming conventions in specs/003-ui-quality-testing/contracts/design-tokens.contract.md

**Checkpoint**: User Story 5 complete - zero hardcoded values outside tokens.css

---

## Phase 8: User Story 6 - Component Unit Testing (Priority: P3)

**Goal**: Unit tests for UI component JavaScript logic with 70%+ coverage

**Independent Test**: Run Jest and verify coverage report shows >70% for each component

### Tests for User Story 6

- [x] T050 [P] [US6] Create accessibility.js unit tests in tests/unit/accessibility.test.js
- [x] T051 [P] [US6] Create onboarding.js unit tests in tests/unit/onboarding.test.js
- [x] T052 [P] [US6] Create visualizer.js unit tests in tests/unit/visualizer.test.js

### Implementation for User Story 6

- [x] T053 [US6] Add screen reader announcement function tests in tests/unit/accessibility.test.js
- [x] T054 [US6] Add focus trap function tests in tests/unit/accessibility.test.js
- [x] T055 [US6] Add tooltip positioning tests in tests/unit/onboarding.test.js
- [x] T056 [US6] Add dismiss/state persistence tests in tests/unit/onboarding.test.js
- [x] T057 [US6] Add canvas drawing tests in tests/unit/visualizer.test.js
- [x] T058 [US6] Add audio data processing tests in tests/unit/visualizer.test.js
- [x] T059 [US6] Configure Jest coverage thresholds (70%) in jest.config.js
- [x] T060 [US6] Add npm scripts for unit test commands in package.json

**Checkpoint**: User Story 6 complete - all components have 70%+ test coverage

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T061 Run web-ext lint to validate manifest.json
- [x] T062 [P] Run all unit tests and verify 70%+ coverage
- [x] T063 [P] Run all visual tests and verify baselines pass
- [x] T064 Test popup in Firefox Developer Edition (dark mode)
- [x] T065 [P] Test popup in Firefox Developer Edition (light mode)
- [x] T066 Verify no console errors in popup, options, or background contexts
- [x] T067 Update CLAUDE.md with testing commands if needed
- [x] T068 Final review against specs/003-ui-quality-testing/spec.md success criteria

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (different CSS concerns)
  - US3 depends on US2 (colors must be finalized first)
  - US4 should follow US1-US3 (visual tests need final styling)
  - US5 can run in parallel with US4
  - US6 can run in parallel with US4-US5
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
       │
       ├────────┬────────┐
       ▼        ▼        │
     US1      US2        │
   (P1)      (P1)        │
       │        │        │
       └───┬────┘        │
           ▼             │
         US3             │
        (P2)             │
           │             │
           ▼             │
         US4◄────────────┤
        (P2)             │
           │             │
       ┌───┴───┐         │
       ▼       ▼         ▼
     US5     US6       US5/US6
    (P2)    (P3)     (parallel)
```

### Parallel Opportunities

**Phase 1 (Setup)**:
- T002, T003, T004 can run in parallel

**Phase 2 (Foundational)**:
- T008, T009 can run in parallel

**Phase 3-4 (US1 & US2)**:
- US1 and US2 can be worked on in parallel by different team members

**Phase 6 (US4 - Visual Tests)**:
- T035, T036, T037, T038, T039 can all run in parallel (different test files)

**Phase 7 (US5 - CSS Refactor)**:
- T044, T045 can run in parallel (different CSS files)

**Phase 8 (US6 - Unit Tests)**:
- T050, T051, T052 can all run in parallel (different test files)

---

## Parallel Example: User Story 4 (Visual Tests)

```bash
# Launch all visual test creation tasks together:
Task: "Create popup visual test for idle state (light mode) in tests/visual/popup.visual.spec.js"
Task: "Create popup visual test for playing state in tests/visual/popup.visual.spec.js"
Task: "Create popup visual test for paused state in tests/visual/popup.visual.spec.js"
Task: "Create popup visual test for error banner state in tests/visual/popup.visual.spec.js"
Task: "Create popup visual test for onboarding overlay state in tests/visual/popup.visual.spec.js"
```

---

## Parallel Example: User Story 6 (Unit Tests)

```bash
# Launch all unit test file creation together:
Task: "Create accessibility.js unit tests in tests/unit/accessibility.test.js"
Task: "Create onboarding.js unit tests in tests/unit/onboarding.test.js"
Task: "Create visualizer.js unit tests in tests/unit/visualizer.test.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Fix Stacking)
4. Complete Phase 4: User Story 2 (Color Scheme)
5. **STOP and VALIDATE**: Test both stories independently
6. Deploy/demo if ready - core UI issues fixed!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 + US2 → Test independently → Deploy (MVP - no more purple, no stacking bugs!)
3. Add US3 → Test independently → Deploy (Photon alignment)
4. Add US4 → Test independently → Deploy (Visual testing infrastructure)
5. Add US5 → Test independently → Deploy (Clean CSS architecture)
6. Add US6 → Test independently → Deploy (Unit test coverage)

### Single Developer Strategy

Execute phases sequentially in priority order:
1. Setup + Foundational: ~30 min
2. US1 (Stacking): ~1 hour
3. US2 (Colors): ~1 hour
4. US3 (Photon): ~1 hour
5. US4 (Visual Tests): ~2 hours
6. US5 (CSS Refactor): ~1 hour
7. US6 (Unit Tests): ~2 hours
8. Polish: ~30 min

---

## Task Summary

| Phase | User Story | Task Count | Parallel Tasks |
|-------|------------|------------|----------------|
| 1 | Setup | 5 | 3 |
| 2 | Foundational | 4 | 2 |
| 3 | US1 - Stacking (P1) | 7 | 0 |
| 4 | US2 - Colors (P1) | 9 | 1 |
| 5 | US3 - Firefox Photon (P2) | 8 | 1 |
| 6 | US4 - Visual Tests (P2) | 9 | 5 |
| 7 | US5 - CSS Architecture (P2) | 7 | 1 |
| 8 | US6 - Unit Tests (P3) | 11 | 3 |
| 9 | Polish | 8 | 2 |
| **Total** | | **68** | **18** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 & US2 are both P1 priority and can be worked in parallel
- Visual tests (US4) should capture final styling after US1-US3
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
