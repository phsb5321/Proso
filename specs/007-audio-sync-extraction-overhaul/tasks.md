# Tasks: Audio-Text Sync & Content Extraction Overhaul

**Input**: Design documents from `/specs/007-audio-sync-extraction-overhaul/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: This feature specification includes test coverage requirements (V. Test Coverage for Critical Paths). Tests are included below.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md project structure:
- `background/` - Service worker modules
- `content/` - Content scripts
- `styles/` - CSS files
- `tests/unit/` - Jest unit tests
- `tests/contract/` - API contract tests
- `tests/integration/` - Integration tests

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and message type definitions

- [x] T001 Add new message types to background/constants.js (REQUEST_EXTRACT_CONTENT, CONTENT_EXTRACTED, HIGHLIGHT_PARAGRAPH, HIGHLIGHT_WORD, CLEAR_HIGHLIGHTS, SYNC_STATE_UPDATE, REQUEST_RESYNC, SYNC_ERROR)
- [x] T002 [P] Add word highlight CSS rule for CSS Custom Highlight API in styles/content.css
- [x] T003 [P] Add storage key constants for word timing cache in background/constants.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement normalizeWordTiming() function in background/playback-sync.js to handle both startMs/endMs and startTimeMs/endTimeMs formats (FR-004)
- [x] T005 [P] Add CSS Custom Highlight API feature detection in content/content.js (check for CSS.highlights support)
- [x] T006 [P] Add visibilitychange event listener scaffolding in content/content.js for tab visibility tracking
- [x] T007 Implement message routing for new sync message types in background/background.js (switch/case for all new types from contracts/)
- [x] T008 [P] Implement message routing for new sync message types in content/content.js (switch/case for HIGHLIGHT_PARAGRAPH, HIGHLIGHT_WORD, CLEAR_HIGHLIGHTS, SYNC_STATE_UPDATE, SYNC_ERROR)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 2 - Smart Content Extraction (Priority: P1)

**Goal**: Extract only main article content, filtering out navigation, ads, sidebars

**Independent Test**: On wiki/news/blog sites, verify only article content extracted. No navigation text.

### Tests for User Story 2

- [ ] T009 [P] [US2] Create content extraction unit tests in tests/unit/content-extraction.test.js (test wiki selectors, content scoring, link density filtering)

### Implementation for User Story 2

- [x] T010 [P] [US2] Implement wiki-specific selector detection in content/content.js - extractArticle() function (FR-012: #wiki-content-block, #WikiaArticle, #mw-content-text, .mw-parser-output, article, [role="main"])
- [x] T011 [P] [US2] Implement calculateContentScore() in content/content.js (FR-013: paragraph count, text length, link density, heading count)
- [x] T012 [P] [US2] Implement calculateLinkDensity() helper in content/content.js (FR-016: compute link text ratio, threshold 70%)
- [x] T013 [US2] Implement filterNavigationElements() in content/content.js (FR-014: filter by class/id patterns nav, menu, sidebar, header, footer, comment, ad)
- [x] T014 [US2] Implement extractCleanTextFromElement() in content/content.js (FR-015, FR-017: minimum 30 chars, remove scripts/styles/forms/hidden/cookies/social)
- [x] T015 [US2] Implement findContentParagraphs() in content/content.js to build ContentBlock array with scoring
- [x] T016 [US2] Implement isInsideUnwantedElement() helper in content/content.js for nested element checking
- [x] T017 [US2] Implement CONTENT_EXTRACTED response message in content/content.js with extractionMethod, extractionDurationMs fields
- [x] T018 [US2] Implement findElementByText() in content/content.js for text-based DOM matching (FR-018)

**Checkpoint**: Content extraction should filter 95%+ of navigation/boilerplate (SC-003)

---

## Phase 4: User Story 1 - Accurate Word-by-Word Highlighting (Priority: P1)

**Goal**: Each word highlights within 100ms of being spoken

**Independent Test**: Play any paragraph, visually confirm word highlights sync with audio

### Tests for User Story 1

- [ ] T019 [P] [US1] Create word timing format contract tests in tests/contract/word-timing-formats.test.js (test Groq format, ElevenLabs format, normalization)
- [x] T020 [P] [US1] Add word sync tests to tests/unit/playback-sync.test.js (test syncToWord with both timing formats, binary search efficiency)

### Implementation for User Story 1

- [x] T021 [US1] Implement audio.currentTime as authoritative time source in background/background.js (FR-001: remove any competing timers)
- [x] T022 [US1] Implement timeupdate event listener in background/background.js for 4Hz baseline sync (FR-002)
- [x] T023 [US1] Implement requestAnimationFrame sync loop in background/playback-sync.js for 60fps visual updates (FR-003)
- [x] T024 [US1] Implement binary search word lookup in syncToWord() in background/playback-sync.js (FR-005)
- [x] T025 [US1] Implement syncWordFromTime() in background/background.js to find and highlight current word
- [x] T026 [US1] Implement HIGHLIGHT_WORD message sender in background/background.js with charOffset, charLength, timestamp
- [x] T027 [US1] Implement CSS Custom Highlight API word highlighting in content/content.js (FR-019: register highlight, create Range)
- [x] T028 [US1] Implement clearWordHighlight() in content/content.js to clear previous highlight before new (FR-022)
- [x] T029 [US1] Implement dual-layer highlighting in content/content.js (FR-021: paragraph background + word highlight simultaneously)
- [x] T030 [US1] Add latency measurement in content/content.js HIGHLIGHT_WORD handler (compare payload.timestamp to performance.now)

**Checkpoint**: Word highlighting achieves <100ms latency (SC-001)

---

## Phase 5: User Story 3 - Paragraph-Audio Alignment (Priority: P2)

**Goal**: Correct paragraph highlights when audio plays, smooth scroll into view

**Independent Test**: Play 5 paragraphs, verify each highlights and scrolls correctly

### Implementation for User Story 3

- [x] T031 [P] [US3] Implement HIGHLIGHT_PARAGRAPH message sender in background/background.js with paragraphText for matching
- [x] T032 [US3] Implement paragraph highlighting in content/content.js using findElementByText() (FR-018)
- [x] T033 [US3] Implement smooth scroll into view in content/content.js (FR-023: scrollIntoView with behavior smooth)
- [x] T034 [US3] Implement SEEK_TO_PARAGRAPH handler in background/background.js for paragraph click navigation
- [x] T035 [US3] Add paragraph click listener in content/content.js to send SEEK_TO_PARAGRAPH message
- [x] T036 [US3] Implement paragraph transition without flash/flicker in content/content.js (clear old highlight before applying new)

**Checkpoint**: Paragraph highlighting achieves <200ms latency (SC-002)

---

## Phase 6: User Story 4 - Graceful Fallback (Priority: P2)

**Goal**: Paragraph-level highlighting works when Groq API unavailable

**Independent Test**: Disable Groq API key, verify paragraph highlighting works

### Implementation for User Story 4

- [x] T037 [P] [US4] Implement Groq API availability check in background/background.js (check for API key in settings)
- [x] T038 [US4] Implement word timing extraction via Groq Whisper in background/background.js (FR-008)
- [x] T039 [US4] Implement fuzzy word alignment in background/background.js (FR-009: handle contractions, numbers, abbreviations)
- [x] T040 [US4] Implement word timing cache in background/audio-cache.js (FR-010: key by paragraph text hash, LRU eviction at 5MB)
- [x] T041 [US4] Implement timing scale adjustment in background/playback-sync.js (FR-011: scale when actual duration differs)
- [x] T042 [US4] Implement fallback to paragraph-only sync in background/background.js when word timing fails (FR-020)
- [x] T043 [US4] Implement SYNC_ERROR message for word timing failures with recoverable=true, fallbackMode='paragraph-only'
- [ ] T044 [US4] Implement subtle error indicator in content/floating-controller.js (non-blocking notification)

**Checkpoint**: Fallback to paragraph-only sync works 100% (SC-006)

---

## Phase 7: User Story 5 - Resilient Sync Recovery (Priority: P3)

**Goal**: Sync auto-recovers when user returns from background tab

**Independent Test**: Switch away for 30 seconds, return, verify sync recovers within 500ms

### Tests for User Story 5

- [ ] T045 [P] [US5] Add drift detection tests to tests/unit/playback-sync.test.js (test detectDrift, auto-correction trigger)

### Implementation for User Story 5

- [x] T046 [US5] Implement drift detection in background/playback-sync.js (FR-006: detect when drift > 200ms)
- [x] T047 [US5] Implement auto-correction in background/playback-sync.js (snap to correct position without jarring jump)
- [x] T048 [US5] Implement visibilitychange handler in content/content.js to send REQUEST_RESYNC on tab visible
- [x] T049 [US5] Implement REQUEST_RESYNC handler in background/background.js (FR-007: resync within 500ms)
- [x] T050 [US5] Add drift logging in background/playback-sync.js for debugging sync issues

**Checkpoint**: Tab visibility resync completes within 500ms (SC-005)

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T051 [P] Add performance timing logs in background/background.js (extraction time, sync latency)
- [x] T052 [P] Add performance timing logs in content/content.js (highlight application time)
- [ ] T053 Create sync accuracy integration tests in tests/integration/sync-accuracy.test.js
- [x] T054 [P] Update CLAUDE.md with new modules and testing notes
- [x] T055 Run web-ext lint to verify manifest compliance (1 warning - innerHTML in shadow DOM, acceptable)
- [ ] T056 Run quickstart.md validation scenarios manually
- [ ] T057 Verify all success criteria (SC-001 through SC-008) are met

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 2 (Phase 3)**: Depends on Foundational - Content extraction is independent
- **User Story 1 (Phase 4)**: Depends on Foundational - Word sync needs US2 for content but can develop in parallel
- **User Story 3 (Phase 5)**: Depends on Foundational - Paragraph sync builds on extraction
- **User Story 4 (Phase 6)**: Depends on US1 (word sync infrastructure) and US3 (paragraph fallback)
- **User Story 5 (Phase 7)**: Depends on US1 and US3 (sync infrastructure to recover)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

```
           ┌──────────────┐
           │   Setup      │
           │  (Phase 1)   │
           └──────┬───────┘
                  │
           ┌──────▼───────┐
           │ Foundational │
           │  (Phase 2)   │
           └──────┬───────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼─────┐           ┌─────▼─────┐
│   US2     │           │   US1     │
│ Extraction│           │ Word Sync │
│  (P1)     │           │   (P1)    │
└─────┬─────┘           └─────┬─────┘
      │                       │
      └───────────┬───────────┘
                  │
           ┌──────▼───────┐
           │    US3       │
           │  Paragraph   │
           │    (P2)      │
           └──────┬───────┘
                  │
      ┌───────────┴───────────┐
      │                       │
┌─────▼─────┐           ┌─────▼─────┐
│   US4     │           │   US5     │
│ Fallback  │           │ Recovery  │
│   (P2)    │           │   (P3)    │
└───────────┘           └───────────┘
```

### Within Each User Story

- Tests SHOULD be written first (TDD encouraged)
- Helper functions before main implementations
- Message handlers in both background and content scripts
- Validation at checkpoints

### Parallel Opportunities

- T002, T003 can run in parallel (different files)
- T005, T006, T008 can run in parallel (different concerns)
- T009, T010, T011, T012 can run in parallel (US2 tests and helpers)
- T019, T020 can run in parallel (US1 tests)
- T031, T037 can run in parallel (different stories)
- T045, T051, T052, T054 can run in parallel (tests and docs)

---

## Parallel Example: User Story 2 (Content Extraction)

```bash
# Launch all parallel tasks together:
Task: T009 - Create content extraction unit tests
Task: T010 - Implement wiki-specific selector detection
Task: T011 - Implement calculateContentScore()
Task: T012 - Implement calculateLinkDensity()

# Then sequential tasks after parallel complete:
Task: T013 - Implement filterNavigationElements()
Task: T014 - Implement extractCleanTextFromElement()
# etc.
```

---

## Implementation Strategy

### MVP First (User Story 2 + User Story 1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 2 (Content Extraction)
4. Complete Phase 4: User Story 1 (Word Sync)
5. **STOP and VALIDATE**: Test extraction + word sync independently
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US2 (Extraction) → Test independently → Validate SC-003, SC-007
3. Add US1 (Word Sync) → Test independently → Validate SC-001
4. Add US3 (Paragraph) → Test independently → Validate SC-002
5. Add US4 (Fallback) → Test independently → Validate SC-006
6. Add US5 (Recovery) → Test independently → Validate SC-004, SC-005
7. Polish phase → Validate all success criteria

### Suggested MVP Scope

**MVP = Phase 1 + Phase 2 + Phase 3 (US2) + Phase 4 (US1)**

This delivers the two P1 features:
- Smart content extraction (no more "Home Menu Login" being read)
- Accurate word-by-word highlighting (<100ms latency)

---

## Task Summary

| Phase | User Story | Task Count | Completed | Remaining |
|-------|------------|------------|-----------|-----------|
| 1     | Setup      | 3          | 3         | 0         |
| 2     | Foundational | 5        | 5         | 0         |
| 3     | US2 (P1)   | 10         | 9         | 1         |
| 4     | US1 (P1)   | 12         | 11        | 1         |
| 5     | US3 (P2)   | 6          | 6         | 0         |
| 6     | US4 (P2)   | 8          | 7         | 1         |
| 7     | US5 (P3)   | 6          | 5         | 1         |
| 8     | Polish     | 7          | 4         | 3         |
| **Total** |        | **57**     | **50**    | **7**     |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US2 and US1 are both P1 but can be developed in parallel since they touch different modules
