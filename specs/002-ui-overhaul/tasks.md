# Tasks: Premium UI Overhaul

**Input**: Design documents from `/specs/002-ui-overhaul/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - manual accessibility testing included in final phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Browser extension structure:
- `popup/` - Popup UI files
- `options/` - Options page files
- `background/` - Background service worker
- `styles/` - Shared CSS
- `popup/components/` - New modular UI components

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create foundational design system and project structure

- [x] T001 Create directory `popup/components/` for modular UI components
- [x] T002 Create directory `styles/` for shared CSS tokens
- [x] T003 [P] Create design tokens file with color, spacing, typography, and animation variables in `styles/tokens.css`
- [x] T004 [P] Add `.sr-only` utility class for screen-reader-only content in `styles/tokens.css`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core theming infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Refactor `popup/popup.css` to import and use CSS custom properties from `styles/tokens.css`
- [x] T006 Add dark theme color values as default (current behavior) in `styles/tokens.css`
- [x] T007 Add light theme color values via `@media (prefers-color-scheme: light)` in `styles/tokens.css`
- [x] T008 Update `popup/popup.html` to link `styles/tokens.css` before `popup.css`
- [x] T009 Verify popup renders correctly in both light and dark system themes

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - First-Time User Onboarding (Priority: P1)

**Goal**: New users can immediately understand how to use VoxPage without documentation

**Independent Test**: Install extension fresh, verify user can play first TTS audio within 30 seconds without help

### Implementation for User Story 1

- [x] T010 [US1] Add onboarding state tracking (`ui.onboardingComplete`) to storage schema in `popup/popup.js`
- [x] T011 [US1] Create first-time tooltip component that highlights play button in `popup/components/onboarding.js`
- [x] T012 [US1] Add tooltip HTML structure with dismissible overlay to `popup/popup.html`
- [x] T013 [US1] Style onboarding tooltip with arrow pointing to play button in `popup/popup.css`
- [x] T014 [US1] Implement `setOnboardingComplete` message handler in `background/background.js`
- [x] T015 [US1] Create user-friendly API key missing guidance with link to settings in `popup/popup.js`
- [x] T016 [US1] Add "Selection mode requires text" message for empty selection in `popup/popup.js`
- [x] T017 [US1] Wire onboarding component to check/set first-visit state on popup load in `popup/popup.js`

**Checkpoint**: User Story 1 complete - new users receive guided onboarding experience

---

## Phase 4: User Story 2 - Audio Playback with Visual Feedback (Priority: P1)

**Goal**: Users see real-time visual feedback during audio playback

**Independent Test**: Play any TTS content and verify smooth visual feedback appears synced to audio

### Implementation for User Story 2

- [x] T018 [P] [US2] Create AudioVisualizer module with AnalyserNode setup in `background/audio-visualizer.js`
- [x] T019 [P] [US2] Add Canvas element for visualizer display to `popup/popup.html`
- [x] T020 [US2] Create visualizer component with Canvas rendering in `popup/components/visualizer.js`
- [x] T021 [US2] Implement `getVisualizerData` message handler in `background/background.js`
- [x] T022 [US2] Connect AnalyserNode to audio output pipeline in `background/background.js`
- [x] T023 [US2] Implement requestAnimationFrame loop for 60fps visualization in `popup/components/visualizer.js`
- [x] T024 [US2] Add idle/playing/paused visual states for visualizer in `popup/components/visualizer.js`
- [x] T025 [US2] Style visualizer canvas to match theme colors in `popup/popup.css`
- [x] T026 [US2] Handle graceful degradation when Web Audio API unavailable in `popup/components/visualizer.js`
- [x] T027 [US2] Wire visualizer component to playback state in `popup/popup.js`

**Checkpoint**: User Story 2 complete - audio visualization works during playback

---

## Phase 5: User Story 3 - Keyboard-Only Navigation (Priority: P1)

**Goal**: Users can fully operate VoxPage using only keyboard input

**Independent Test**: Disconnect mouse and verify all popup functionality accessible via keyboard

### Implementation for User Story 3

- [x] T028 [P] [US3] Add visible focus indicators (outline) for all interactive elements in `popup/popup.css`
- [x] T029 [P] [US3] Ensure minimum 44x44px touch targets for all buttons in `popup/popup.css`
- [x] T030 [US3] Convert provider tabs to proper tablist with role="tablist" and role="tab" in `popup/popup.html`
- [x] T031 [US3] Implement roving tabindex for provider tabs (arrow key navigation) in `popup/popup.js`
- [x] T032 [US3] Create keyboard navigation helper module in `popup/components/accessibility.js`
- [x] T033 [US3] Add keyboard event handlers for Enter/Space on all buttons in `popup/popup.js`
- [x] T034 [US3] Ensure logical tab order: Header → Player → Settings → Provider → Voice → Mode in `popup/popup.html`
- [x] T035 [US3] Verify slider controls respond to arrow key adjustments in `popup/popup.js`

**Checkpoint**: User Story 3 complete - full keyboard navigation works

---

## Phase 6: User Story 4 - Screen Reader Compatibility (Priority: P1)

**Goal**: Screen reader users can understand and operate all controls

**Independent Test**: Enable screen reader, verify all controls announced meaningfully and state changes communicated

### Implementation for User Story 4

- [x] T036 [P] [US4] Add aria-label to all icon-only buttons in `popup/popup.html`
- [x] T037 [P] [US4] Add aria-pressed attribute to play/pause toggle button in `popup/popup.html`
- [x] T038 [US4] Create screen reader announcer live region (aria-live="polite") in `popup/popup.html`
- [x] T039 [US4] Implement announce() helper function in `popup/components/accessibility.js`
- [x] T040 [US4] Update play/pause to set aria-pressed and aria-label dynamically in `popup/popup.js`
- [x] T041 [US4] Announce playback state changes ("Playing", "Paused", "Stopped") in `popup/popup.js`
- [x] T042 [US4] Add aria-selected to provider tabs for current selection in `popup/popup.js`
- [x] T043 [US4] Add aria-valuenow, aria-valuemin, aria-valuemax to speed slider in `popup/popup.html`
- [x] T044 [US4] Announce error messages via assertive live region in `popup/popup.js`
- [x] T045 [US4] Add role="status" to status banner element in `popup/popup.html`

**Checkpoint**: User Story 4 complete - screen readers work properly

---

## Phase 7: User Story 5 - Light/Dark Theme Adaptation (Priority: P2)

**Goal**: Extension respects system color scheme preference

**Independent Test**: Toggle system light/dark mode and verify extension theme updates

### Implementation for User Story 5

- [x] T046 [P] [US5] Audit all hardcoded colors in `popup/popup.css` and replace with CSS variables
- [x] T047 [P] [US5] Audit all hardcoded colors in `options/options.css` and replace with CSS variables
- [x] T048 [US5] Add `styles/tokens.css` link to `options/options.html`
- [x] T049 [US5] Verify color contrast meets WCAG 4.5:1 for text in light theme in `styles/tokens.css`
- [x] T050 [US5] Verify color contrast meets WCAG 4.5:1 for text in dark theme in `styles/tokens.css`
- [x] T051 [US5] Adjust accent colors for sufficient contrast in both themes in `styles/tokens.css`
- [x] T052 [US5] Test theme auto-switching without popup restart

**Checkpoint**: User Story 5 complete - theme adapts to system preference

---

## Phase 8: User Story 6 - Quick Settings Access (Priority: P2)

**Goal**: Users can adjust common settings directly from popup with immediate feedback

**Independent Test**: Change voice/speed/provider in popup and verify immediate save and feedback

### Implementation for User Story 6

- [x] T053 [US6] Ensure voice selection change triggers immediate save in `popup/popup.js`
- [x] T054 [US6] Show real-time speed value update as slider moves in `popup/popup.js`
- [x] T055 [US6] Update voice dropdown immediately when provider changes in `popup/popup.js`
- [x] T056 [US6] Add provider name prefix to voice dropdown options for clarity in `popup/popup.js`
- [x] T057 [US6] Add visual feedback (brief highlight) when settings saved in `popup/popup.css`

**Checkpoint**: User Story 6 complete - settings accessible and responsive

---

## Phase 9: User Story 7 - Responsive Design (Priority: P2)

**Goal**: Popup remains usable across different zoom levels and DPI settings

**Independent Test**: View popup at 80%, 100%, 150%, 200% zoom and verify all content accessible

### Implementation for User Story 7

- [x] T058 [P] [US7] Use relative units (rem/em) instead of px for font sizes in `popup/popup.css`
- [x] T059 [P] [US7] Use relative units for spacing where appropriate in `popup/popup.css`
- [x] T060 [US7] Add max-width constraints to prevent horizontal overflow in `popup/popup.css`
- [x] T061 [US7] Test text truncation with ellipsis for long voice names in `popup/popup.css`
- [x] T062 [US7] Ensure buttons maintain 44px minimum size at all zoom levels in `popup/popup.css`
- [x] T063 [US7] Verify layout at 150% zoom using Firefox Responsive Design Mode

**Checkpoint**: User Story 7 complete - responsive layout works

---

## Phase 10: User Story 8 - Smooth Micro-Interactions (Priority: P3)

**Goal**: All UI interactions feel responsive and polished

**Independent Test**: Interact with all UI elements and verify smooth, consistent animations

### Implementation for User Story 8

- [x] T064 [P] [US8] Add hover state transitions to all buttons in `popup/popup.css`
- [x] T065 [P] [US8] Add active (pressed) state styles to all buttons in `popup/popup.css`
- [x] T066 [US8] Add loading spinner/indicator for audio loading state in `popup/popup.css`
- [x] T067 [US8] Add `@media (prefers-reduced-motion: reduce)` rules to disable animations in `styles/tokens.css`
- [x] T068 [US8] Ensure all transitions complete within 300ms in `popup/popup.css`
- [x] T069 [US8] Add fade-in animation for status banner in `popup/popup.css`
- [x] T070 [US8] Add smooth progress bar animation in `popup/popup.css`

**Checkpoint**: User Story 8 complete - polished micro-interactions

---

## Phase 11: Options Page Alignment

**Purpose**: Apply consistent styling and accessibility to options page

- [x] T071 [P] Refactor `options/options.css` to use design tokens from `styles/tokens.css`
- [x] T072 [P] Add ARIA labels to all form controls in `options/options.html`
- [x] T073 Add visible focus indicators to options page controls in `options/options.css`
- [x] T074 Ensure keyboard navigation works for all options controls in `options/options.js`
- [x] T075 Add `prefers-color-scheme` theming support to options page in `options/options.css`

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T076 Run `web-ext lint` and fix any manifest/code issues
- [x] T077 Verify no console errors in popup, options, or background contexts
- [x] T078 Manual keyboard-only navigation testing of all popup controls
- [x] T079 Manual screen reader testing with NVDA or VoiceOver
- [x] T080 Verify WCAG contrast ratios using browser DevTools
- [x] T081 Profile popup load time - verify < 200ms interactive
- [x] T082 Profile visualizer frame rate - verify 60fps during playback
- [x] T083 Test edge case: popup on restricted page (about:, moz-extension:)
- [x] T084 Test edge case: extremely long voice names (truncation)
- [x] T085 Test edge case: rapid play/pause clicking (debounce)
- [x] T086 Update quickstart.md validation - run through all steps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-10)**: All depend on Foundational phase completion
  - US1-US4 (P1): Can proceed in parallel or sequentially
  - US5-US7 (P2): Can start after Foundational, no dependencies on P1 stories
  - US8 (P3): Can start after Foundational, best after US5 theming
- **Options Alignment (Phase 11)**: Best after US5 theming complete
- **Polish (Phase 12)**: Depends on all user stories being complete

### User Story Dependencies

| Story | Priority | Can Start After | Dependencies on Other Stories |
|-------|----------|-----------------|------------------------------|
| US1 - Onboarding | P1 | Foundational | None |
| US2 - Visualizer | P1 | Foundational | None |
| US3 - Keyboard Nav | P1 | Foundational | None |
| US4 - Screen Reader | P1 | Foundational | Benefits from US3 |
| US5 - Theming | P2 | Foundational | None |
| US6 - Quick Settings | P2 | Foundational | None |
| US7 - Responsive | P2 | Foundational | Benefits from US5 |
| US8 - Micro-interactions | P3 | Foundational | Benefits from US5 |

### Within Each User Story

- HTML structure changes first
- CSS styling second
- JavaScript functionality last
- Story complete before moving to next priority

### Parallel Opportunities

**Setup Phase**:
```
T003 Create tokens.css ─┬─ parallel
T004 Add sr-only class ─┘
```

**User Story 2 (Visualizer)**:
```
T018 Background AudioVisualizer ─┬─ parallel (different files)
T019 Popup Canvas HTML           ─┘
```

**User Story 3 (Keyboard)**:
```
T028 Focus indicators CSS ─┬─ parallel
T029 Touch targets CSS     ─┘
```

**User Story 4 (Screen Reader)**:
```
T036 aria-label on buttons ─┬─ parallel
T037 aria-pressed on play  ─┘
```

**User Story 5 (Theming)**:
```
T046 Audit popup.css colors   ─┬─ parallel
T047 Audit options.css colors ─┘
```

---

## Parallel Example: Multiple Stories

With multiple developers, after Foundational phase:

```bash
# Developer A: User Story 1 (Onboarding)
# Developer B: User Story 2 (Visualizer)
# Developer C: User Story 3 (Keyboard Nav)

# All can work in parallel since they touch different files:
# - US1: popup/components/onboarding.js (new file)
# - US2: background/audio-visualizer.js, popup/components/visualizer.js (new files)
# - US3: popup/components/accessibility.js (new file), popup.html (ARIA), popup.css (focus)
```

---

## Implementation Strategy

### MVP First (User Stories 1-4 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 - Onboarding
4. Complete Phase 4: User Story 2 - Visualizer
5. Complete Phase 5: User Story 3 - Keyboard Nav
6. Complete Phase 6: User Story 4 - Screen Reader
7. **STOP and VALIDATE**: All P1 stories complete, core accessibility achieved
8. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Onboarding) → First-time users guided → Demo
3. US2 (Visualizer) → Premium audio feedback → Demo
4. US3 + US4 (Accessibility) → Full accessibility → Demo
5. US5-US7 (Polish) → Theming + responsive → Demo
6. US8 (Micro-interactions) → Final polish → Release

### Suggested MVP Scope

**MVP = Setup + Foundational + US3 (Keyboard) + US4 (Screen Reader)**

Rationale: Accessibility is the highest-value improvement and addresses legal/ethical requirements. Onboarding and visualizer can follow.

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Tasks** | 86 |
| **Setup Phase** | 4 tasks |
| **Foundational Phase** | 5 tasks |
| **US1 - Onboarding** | 8 tasks |
| **US2 - Visualizer** | 10 tasks |
| **US3 - Keyboard Nav** | 8 tasks |
| **US4 - Screen Reader** | 10 tasks |
| **US5 - Theming** | 7 tasks |
| **US6 - Quick Settings** | 5 tasks |
| **US7 - Responsive** | 6 tasks |
| **US8 - Micro-interactions** | 7 tasks |
| **Options Alignment** | 5 tasks |
| **Polish Phase** | 11 tasks |
| **Parallel Opportunities** | 12 task pairs |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- No external dependencies added - all native browser APIs
