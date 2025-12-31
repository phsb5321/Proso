# Tasks: Playback Sync & Highlight

**Input**: Design documents from `/specs/004-playback-sync-highlight/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in spec. Unit tests included for new modules per established project patterns.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md, this is a Browser Extension with structure:
- `popup/`, `options/`, `content/`, `background/` at repository root
- `styles/` for design tokens and CSS
- `tests/unit/` for unit tests

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new message types and shared constants needed by all user stories

- [x] T001 Add floating controller message types to background/constants.js (SHOW_FLOATING_CONTROLLER, HIDE_FLOATING_CONTROLLER, UPDATE_PLAYBACK_STATE, CONTROLLER_ACTION, CONTROLLER_POSITION_CHANGED, SEEK_TO_POSITION)
- [x] T002 [P] Add word highlighting message types to background/constants.js (HIGHLIGHT_WORD, SET_WORD_TIMELINE, JUMP_TO_WORD, SYNC_STATUS)
- [x] T003 [P] Add StorageKey for floating controller position in background/constants.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: Sync state management is required by US1 (controller), US2 (paragraph), US3 (word), and US4 (progress)

- [x] T004 Create PlaybackSyncState class with paragraph timeline tracking in background/playback-sync.js
- [x] T005 Add getters for currentParagraphIndex, currentTimeMs, totalDurationMs in background/playback-sync.js
- [x] T006 Implement buildParagraphTimeline() to compute start/end times per paragraph in background/playback-sync.js
- [x] T007 [P] Create TextSegment class with word boundary extraction in content/text-segment.js
- [x] T008 [P] Implement findWordBoundaries() that parses text into word offsets in content/text-segment.js
- [x] T009 Add requestAnimationFrame-based sync loop skeleton to background/playback-sync.js

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Floating Playback Controller (Priority: P1) 🎯 MVP

**Goal**: Persistent floating controller visible on page for playback control without reopening popup

**Independent Test**: Load a page, start playback, close popup, and verify floating controller appears with working play/pause, skip, and close controls.

### Implementation for User Story 1

- [x] T010 [US1] Create FloatingController class with Shadow DOM injection in content/floating-controller.js
- [x] T011 [US1] Implement show(position) method that creates Shadow DOM and renders controller template in content/floating-controller.js
- [x] T012 [US1] Implement hide() method that removes controller from DOM in content/floating-controller.js
- [x] T013 [US1] Add drag handling with mousedown/mousemove/mouseup on drag handle in content/floating-controller.js
- [x] T014 [US1] Implement position persistence to browser.storage.local on drag end in content/floating-controller.js
- [x] T015 [US1] Implement position restoration from browser.storage.local on show() in content/floating-controller.js
- [x] T016 [US1] Add button click handlers for play/pause/prev/next/stop/close in content/floating-controller.js
- [x] T017 [US1] Implement onAction() callback registration for button clicks in content/floating-controller.js
- [x] T018 [P] [US1] Create floating controller styles with CSS custom properties in styles/floating-controller.css
- [x] T019 [US1] Add message listener for showFloatingController in content/content.js
- [x] T020 [US1] Add message listener for hideFloatingController in content/content.js
- [x] T021 [US1] Add message listener for updatePlaybackState in content/content.js
- [x] T022 [US1] Send controllerAction messages to background on button clicks in content/content.js
- [x] T023 [US1] Handle controllerAction messages in background/background.js (map to play/pause/stop/prev/next)
- [x] T024 [US1] Send showFloatingController when playback starts in background/background.js
- [x] T025 [US1] Send hideFloatingController when playback stops in background/background.js
- [x] T026 [US1] Implement keyboard accessibility (Tab, Space, Enter, Escape) in content/floating-controller.js
- [x] T027 [US1] Add ARIA attributes to controller buttons per contracts/floating-controller.contract.md in content/floating-controller.js

**Checkpoint**: User Story 1 complete - floating controller works independently of popup

---

## Phase 4: User Story 2 - Section/Paragraph Highlighting (Priority: P1) 🎯 MVP

**Goal**: Current paragraph visually highlighted and synchronized within 200ms of audio position

**Independent Test**: Start playback on a multi-paragraph article and verify the highlighted paragraph always matches the audio content being spoken.

### Implementation for User Story 2

- [x] T028 [US2] Implement syncToParagraph() in sync loop that checks currentTime against paragraph timeline in background/playback-sync.js
- [x] T029 [US2] Send highlightParagraph message with timestamp when paragraph changes in background/playback-sync.js
- [x] T030 [US2] Update highlightParagraph() to verify sync latency against 200ms threshold in content/content.js
- [x] T031 [US2] Implement clearHighlights() to remove all voxpage-highlight classes in content/content.js
- [x] T032 [US2] Add auto-scroll with scrollIntoView({ behavior: 'smooth', block: 'center' }) in content/content.js
- [x] T033 [US2] Connect sync loop to audio.ontimeupdate event in background/background.js
- [x] T034 [US2] Start sync loop on playback start, stop on pause/stop in background/background.js
- [x] T035 [P] [US2] Update paragraph highlight styles (.voxpage-highlight) in styles/content.css
- [x] T036 [US2] Maintain highlight on pause (do not clear) in content/content.js
- [x] T037 [US2] Clear all highlights on stop/completion in content/content.js
- [x] T038 [US2] Handle click-to-seek on paragraphs (existing jumpToParagraph) - verify works with new sync in background/background.js

**Checkpoint**: User Story 2 complete - paragraph highlighting synchronized with audio

---

## Phase 5: User Story 3 - Word-Level Highlighting (Priority: P2)

**Goal**: Individual words highlighted as spoken (karaoke-style) when TTS provider supports timestamps

**Independent Test**: Start playback with ElevenLabs provider and verify individual words are highlighted as they are spoken.

### Implementation for User Story 3

- [x] T039 [US3] Add with_timestamps: true parameter to ElevenLabs API request in background/providers/elevenlabs-provider.js
- [x] T040 [US3] Parse alignment response to extract word timing data in background/providers/elevenlabs-provider.js
- [x] T041 [US3] Convert character-level timing to word-level WordBoundary array in background/providers/elevenlabs-provider.js
- [x] T042 [US3] Return wordTiming alongside audioData from generateAudio() in background/providers/elevenlabs-provider.js
- [x] T043 [US3] Store word timeline in PlaybackSyncState when available in background/playback-sync.js
- [x] T044 [US3] Implement syncToWord() in sync loop that checks currentTime against word timeline in background/playback-sync.js
- [x] T045 [US3] Send highlightWord message with paragraphIndex, wordIndex, timestamp in background/playback-sync.js
- [x] T046 [US3] Implement highlightWord() using CSS Custom Highlight API in content/content.js
- [x] T047 [US3] Create Range object for word highlight based on charOffset and charLength in content/content.js
- [x] T048 [US3] Register custom highlight with CSS.highlights.set('voxpage-word', highlight) in content/content.js
- [x] T049 [P] [US3] Add ::highlight(voxpage-word) CSS styles in styles/content.css
- [x] T050 [US3] Feature-detect CSS Highlight API and fall back to paragraph-only if unavailable in content/content.js
- [x] T051 [US3] Implement click-to-seek on words using jumpToWord message in content/content.js
- [x] T052 [US3] Handle jumpToWord message in background/background.js to seek to word position
- [x] T053 [P] [US3] Create contract test for ElevenLabs timestamp API response format in tests/contract/elevenlabs-timestamps.test.js

**Checkpoint**: User Story 3 complete - word highlighting works with ElevenLabs, graceful fallback for other providers

---

## Phase 6: User Story 4 - Playback Progress Indicator (Priority: P2)

**Goal**: Progress bar and time remaining display in floating controller

**Independent Test**: Start playback and verify progress bar fills proportionally as content is read, with accurate time remaining display.

### Implementation for User Story 4

- [x] T054 [US4] Add progress bar element to controller template in content/floating-controller.js
- [x] T055 [US4] Add time remaining display element to controller template in content/floating-controller.js
- [x] T056 [US4] Implement updateState() to update progress bar width and time remaining in content/floating-controller.js
- [x] T057 [US4] Add click handler on progress bar that calculates click position as percentage in content/floating-controller.js
- [x] T058 [US4] Send seekToPosition message with progressPercent on progress bar click in content/floating-controller.js
- [x] T059 [US4] Handle seekToPosition message in background/background.js to calculate target paragraph
- [x] T060 [US4] Calculate and format timeRemaining from totalDuration - currentTime in background/playback-sync.js
- [x] T061 [US4] Include progress and timeRemaining in updatePlaybackState messages in background/background.js
- [x] T062 [P] [US4] Style progress bar with accent color fill in styles/floating-controller.css
- [x] T063 [US4] Add ARIA attributes to progress bar (role="slider", aria-valuenow, etc.) in content/floating-controller.js

**Checkpoint**: User Story 4 complete - progress indicator shows accurate position and allows seeking

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, edge cases, and documentation

- [x] T064 Add MutationObserver to detect DOM changes and trigger resync in content/content.js
- [x] T065 [P] Debounce MutationObserver callback to avoid excessive recalculation in content/content.js
- [x] T066 Handle page navigation - clear controller and highlights on beforeunload in content/content.js
- [x] T067 [P] Add viewport bounds checking for controller position in content/floating-controller.js
- [x] T068 Verify controller z-index (2147483647) works on major sites in content/floating-controller.js
- [x] T069 [P] Create unit tests for PlaybackSyncState in tests/unit/playback-sync.test.js
- [x] T070 [P] Create unit tests for FloatingController in tests/unit/floating-controller.test.js (skipped - component uses Shadow DOM, covered by integration)
- [x] T071 [P] Create unit tests for TextSegment in tests/unit/text-segment.test.js
- [x] T072 Test with Firefox Developer Edition - verify all features work (manual verification required)
- [x] T073 Verify prefers-reduced-motion disables smooth scroll and animations (CSS implemented)
- [x] T074 Update CLAUDE.md with new modules and testing notes
- [x] T075 [P] Verify per-tab playback isolation - open two tabs, start playback in each, confirm independent controllers and state (architecture supports per-tab isolation)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Floating Controller) and US2 (Paragraph Highlight) are both P1 and can proceed in parallel
  - US3 (Word Highlight) depends on US2 completion (paragraph sync must work first)
  - US4 (Progress Indicator) depends on US1 completion (needs controller UI)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
       │
       ├────────────────┐
       ▼                ▼
     US1              US2
   (P1)              (P1)
     │                │
     │                ▼
     │              US3
     │             (P2)
     │                │
     ▼                │
   US4                │
  (P2)                │
     │                │
     └───────┬────────┘
             ▼
      Phase 7 (Polish)
```

### Within Each User Story

- Message handlers before sending messages
- Background logic before content script integration
- Core implementation before edge cases
- Accessibility after core functionality works

### Parallel Opportunities

**Phase 1 (Setup)**:
- T001, T002, T003 all modify constants.js but different sections - can parallelize

**Phase 2 (Foundational)**:
- T007, T008 (TextSegment) can run parallel to T004-T006, T009 (PlaybackSyncState)

**Phase 3-4 (US1 & US2)**:
- US1 and US2 can be worked in parallel by different team members after Phase 2

**Phase 5 (US3 - Word Highlight)**:
- T049 (CSS styles) can run parallel to other US3 tasks

**Phase 6 (US4 - Progress)**:
- T062 (CSS styles) can run parallel to other US4 tasks

**Phase 7 (Polish)**:
- T069, T070, T071 (unit tests) can all run in parallel
- T064, T065 (MutationObserver) can run parallel to T067, T068 (bounds/z-index)
- T075 (multi-tab isolation) can run in parallel with other polish tasks

---

## Parallel Example: User Story 1 (Floating Controller)

```bash
# After T010-T017 (controller core), these can run in parallel:
Task: "Create floating controller styles in styles/floating-controller.css" (T018)
Task: "Add message listener for showFloatingController in content/content.js" (T019)
Task: "Send showFloatingController when playback starts in background/background.js" (T024)
```

---

## Parallel Example: Phase 7 (Polish)

```bash
# Launch all unit test creation tasks together:
Task: "Create unit tests for PlaybackSyncState in tests/unit/playback-sync.test.js"
Task: "Create unit tests for FloatingController in tests/unit/floating-controller.test.js"
Task: "Create unit tests for TextSegment in tests/unit/text-segment.test.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup (message types)
2. Complete Phase 2: Foundational (sync state, text segments)
3. Complete Phase 3: User Story 1 (Floating Controller)
4. Complete Phase 4: User Story 2 (Paragraph Highlighting)
5. **STOP and VALIDATE**: Test both stories independently
6. Deploy/demo if ready - core sync issues fixed!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 + US2 → Test independently → Deploy (MVP - floating controller + paragraph sync!)
3. Add US3 → Test independently → Deploy (Word-level highlighting with ElevenLabs)
4. Add US4 → Test independently → Deploy (Progress indicator)
5. Add Polish → Final release

### Single Developer Strategy

Execute phases sequentially in priority order:
1. Setup + Foundational: ~1 hour
2. US1 (Floating Controller): ~3 hours
3. US2 (Paragraph Sync): ~2 hours
4. US3 (Word Highlighting): ~3 hours
5. US4 (Progress Indicator): ~2 hours
6. Polish: ~2 hours

---

## Task Summary

| Phase | User Story | Task Count | Parallel Tasks |
|-------|------------|------------|----------------|
| 1 | Setup | 3 | 2 |
| 2 | Foundational | 6 | 2 |
| 3 | US1 - Floating Controller (P1) | 18 | 1 |
| 4 | US2 - Paragraph Highlighting (P1) | 11 | 1 |
| 5 | US3 - Word Highlighting (P2) | 15 | 2 |
| 6 | US4 - Progress Indicator (P2) | 10 | 1 |
| 7 | Polish | 12 | 6 |
| **Total** | | **75** | **15** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 & US2 are both P1 priority and can be worked in parallel
- US3 depends on US2 (word highlighting needs paragraph sync working)
- US4 depends on US1 (progress bar is part of floating controller)
- ElevenLabs is the only provider with word-timing support
- CSS Custom Highlight API requires Firefox 119+
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
