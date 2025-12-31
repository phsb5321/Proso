# Tasks: Fix Highlight Synchronization

**Input**: Design documents from `/specs/005-fix-highlight-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Unit tests will be added for new behaviors per established project patterns (existing test infrastructure).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md, this is a Browser Extension with structure:
- `background/` for background scripts
- `content/` for content scripts
- `styles/` for CSS
- `tests/unit/` for unit tests

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new state tracking variables and prepare codebase for fixes

- [x] T001 Add scroll tracking variables (lastManualScrollTime, isProgrammaticScrolling, SCROLL_COOLDOWN_MS) to content/content.js
- [x] T002 [P] Add hasInitialSyncFired flag to PlaybackSyncState class in background/playback-sync.js
- [x] T003 [P] Add isTimelineAccurate flag to PlaybackSyncState class in background/playback-sync.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core fixes that MUST be complete before user story verification

**⚠️ CRITICAL**: These fixes enable all user stories to work correctly

- [x] T004 Create clearParagraphHighlights() function (paragraph-only clearing) in content/content.js
- [x] T005 Modify highlightParagraph() to use clearParagraphHighlights() instead of clearHighlights() in content/content.js
- [x] T006 Update clearHighlights() to call clearParagraphHighlights() + clearWordHighlight() for full clear in content/content.js
- [x] T007 Add rebuildTimelineWithDuration(actualDurationMs) method to PlaybackSyncState in background/playback-sync.js
- [x] T008 Ensure rebuildTimelineWithDuration() closes timing gaps (each paragraph.endTimeMs = next.startTimeMs) in background/playback-sync.js
- [x] T009 Modify start() method to fire initial onParagraphChange callback in background/playback-sync.js
- [x] T010 Add audio.loadedmetadata event listener to call rebuildTimelineWithDuration() in background/background.js

**Checkpoint**: Foundation ready - all core bugs fixed, user story verification can begin

---

## Phase 3: User Story 1 - Reliable Paragraph Highlighting (Priority: P1) 🎯 MVP

**Goal**: Every paragraph is highlighted in sequence during playback, with no sections skipped

**Independent Test**: Start playback on any multi-paragraph article and verify every paragraph is highlighted in order as spoken.

### Implementation for User Story 1

- [x] T011 [US1] Verify first paragraph highlights immediately on playback start (test initial callback fix) in background/playback-sync.js
- [x] T012 [US1] Add smart scroll detection: track user scroll events in content/content.js
- [x] T013 [US1] Implement scroll cooldown logic (skip auto-scroll if manual scroll within 4 seconds) in content/content.js
- [x] T014 [US1] Set isProgrammaticScrolling flag during scrollIntoView() and reset after 500ms in content/content.js
- [x] T015 [US1] Update highlightParagraph() to check scroll cooldown before auto-scrolling in content/content.js
- [x] T016 [P] [US1] Add unit test for rebuildTimelineWithDuration() scaling in tests/unit/playback-sync.test.js
- [x] T017 [P] [US1] Add unit test for initial paragraph callback on start() in tests/unit/playback-sync.test.js
- [x] T018 [US1] Add unit test for timeline gap closure in tests/unit/playback-sync.test.js

**Checkpoint**: User Story 1 complete - paragraph highlighting is reliable with no skips and smart scrolling

---

## Phase 4: User Story 2 - Dual-Layer Highlighting (Priority: P1) 🎯 MVP

**Goal**: Both paragraph AND word are highlighted simultaneously when word timing is available

**Independent Test**: Start playback with ElevenLabs provider and verify paragraph background highlight remains visible while word highlight appears on current word.

### Implementation for User Story 2

- [x] T019 [US2] Verify highlightWord() does NOT clear paragraph highlight (test separation fix) in content/content.js
- [x] T020 [US2] Update highlightWord() to ensure paragraph highlight persists when applying word highlight in content/content.js
- [x] T021 [P] [US2] Update paragraph highlight CSS to use 15% opacity for visual distinction in styles/content.css
- [x] T022 [P] [US2] Update word highlight CSS (::highlight(voxpage-word)) to use 40% opacity in styles/content.css
- [x] T023 [US2] Ensure clearHighlights() is only called on stop/completion, not on paragraph change in content/content.js
- [x] T024 [US2] Add graceful fallback when word timing is unavailable (paragraph-only, no errors) in content/content.js

**Checkpoint**: User Story 2 complete - dual highlighting works, paragraph + word visible simultaneously

---

## Phase 5: User Story 3 - Accurate Timing Synchronization (Priority: P2)

**Goal**: Highlights stay synchronized with audio within latency thresholds (200ms paragraph, 100ms word)

**Independent Test**: Play content and observe highlights change within perceptible timeframe of spoken text.

### Implementation for User Story 3

- [x] T025 [US3] Verify latency logging is active for paragraph highlights (200ms threshold) in content/content.js
- [x] T026 [US3] Verify latency logging is active for word highlights (100ms threshold) in content/content.js
- [x] T027 [US3] Test seek functionality updates highlight immediately in background/playback-sync.js
- [x] T028 [US3] Ensure syncToParagraph() handles boundary conditions (time at exact paragraph boundary) in background/playback-sync.js
- [x] T029 [P] [US3] Add fallback in syncToParagraph() to use closest paragraph if no exact match in background/playback-sync.js

**Checkpoint**: User Story 3 complete - sync is accurate within thresholds

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, edge cases, and documentation

- [x] T030 Handle edge case: paragraph element removed from DOM during playback in content/content.js
- [x] T031 [P] Handle edge case: very short paragraphs (< 0.5s duration) still highlight in background/playback-sync.js
- [x] T032 [P] Handle edge case: rapid click-through paragraphs doesn't break sync in background/playback-sync.js
- [x] T033 [P] Handle edge case: incomplete/malformed word timing data (graceful degradation) in content/content.js
- [x] T034 Run web-ext lint and verify no errors
- [x] T035 [P] Manual testing: verify all acceptance scenarios from spec.md
- [x] T036 [P] Run full test suite (npm test) and verify all tests pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (Reliable Paragraph) and US2 (Dual Highlighting) are both P1 and can proceed in parallel
  - US3 (Timing Accuracy) is P2 and can proceed after Foundational
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
       │
       ├────────────────┬────────────────┐
       ▼                ▼                ▼
     US1              US2              US3
   (P1)              (P1)             (P2)
       │                │                │
       └────────┬───────┴────────────────┘
                ▼
         Phase 6 (Polish)
```

### Within Each User Story

- Implementation tasks in order listed
- Tests can run in parallel with implementation (TDD optional)
- Verify checkpoint before moving to next story

### Parallel Opportunities

**Phase 1 (Setup)**:
- T002, T003 can run in parallel (different state flags)

**Phase 2 (Foundational)**:
- T004-T006 must be sequential (same function dependencies)
- T007-T009 can run in parallel with T004-T006 (different files)

**Phase 3-5 (User Stories)**:
- US1 and US2 can be worked in parallel after Phase 2
- US3 can be worked in parallel with US1/US2
- Test tasks within each story (T016-T018, etc.) can run in parallel

**Phase 6 (Polish)**:
- T030-T033 edge cases can all run in parallel
- T034-T036 validation can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch content script fixes and background fixes in parallel:
Task: "Create clearParagraphHighlights() function in content/content.js" (T004)
Task: "Add rebuildTimelineWithDuration() method in background/playback-sync.js" (T007)
```

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all unit test tasks together:
Task: "Add unit test for rebuildTimelineWithDuration() scaling" (T016)
Task: "Add unit test for initial paragraph callback on start()" (T017)
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup (state variables)
2. Complete Phase 2: Foundational (core fixes)
3. Complete Phase 3: User Story 1 (paragraph highlighting)
4. Complete Phase 4: User Story 2 (dual highlighting)
5. **STOP and VALIDATE**: Test both stories - this fixes the main reported bugs
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Core fixes in place
2. Add US1 + US2 → Test independently → Deploy (MVP - main bugs fixed!)
3. Add US3 → Test independently → Deploy (Timing accuracy)
4. Add Polish → Final release

### Single Developer Strategy

Execute phases sequentially in priority order:
1. Setup: ~15 minutes
2. Foundational: ~1 hour
3. US1 (Paragraph Highlighting): ~1 hour
4. US2 (Dual Highlighting): ~45 minutes
5. US3 (Timing Accuracy): ~30 minutes
6. Polish: ~45 minutes

---

## Task Summary

| Phase | User Story | Task Count | Parallel Tasks |
|-------|------------|------------|----------------|
| 1 | Setup | 3 | 2 |
| 2 | Foundational | 7 | 3 |
| 3 | US1 - Reliable Paragraph (P1) | 8 | 2 |
| 4 | US2 - Dual Highlighting (P1) | 6 | 2 |
| 5 | US3 - Timing Accuracy (P2) | 5 | 1 |
| 6 | Polish | 7 | 4 |
| **Total** | | **36** | **14** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 & US2 are both P1 priority and can be worked in parallel
- US3 is P2 priority but has no dependencies on US1/US2
- All changes are to existing files - no new files created
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
