# Tasks: Robust Audio-Text Highlight Synchronization

**Input**: Design documents from `/specs/006-robust-audio-highlight-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks included per plan.md (Jest unit tests, contract tests for Groq API).

**Organization**: Tasks grouped by user story. User Story 4 (Native Provider Timestamps) is marked [DEFERRED] per spec.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US5, US6)
- Exact file paths included in descriptions

## Path Conventions (Browser Extension)

- **Background scripts**: `background/`
- **Content scripts**: `content/`
- **Options page**: `options/`
- **Tests**: `tests/unit/`, `tests/contract/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add constants, message types, and storage schema for sync feature

- [x] T001 Add Groq timestamp constants (WHISPER_MODEL, API_ENDPOINT) in background/constants.js
- [x] T002 [P] Add message types (SET_WORD_TIMELINE, HIGHLIGHT_WORD, WORD_SYNC_STATUS) in background/constants.js
- [x] T003 [P] Add storage schema migration for groqApiKey rename in background/background.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core timestamp extraction that MUST be complete before any sync user story

**⚠️ CRITICAL**: User stories 1, 2, 3, 5, 6 all depend on this infrastructure

- [x] T004 Create GroqTimestampProvider class in background/providers/groq-timestamp-provider.js
- [x] T005 Implement extractWordTimings(audioBlob) method calling Groq Whisper API in background/providers/groq-timestamp-provider.js
- [x] T006 [P] Implement word alignment algorithm alignWordsToSource(groqWords, sourceText) in background/providers/groq-timestamp-provider.js
- [x] T007 [P] Create WordTiming and WordTimeline data structures in background/providers/groq-timestamp-provider.js
- [x] T008 Add Groq API key field to options UI in options/options.html
- [x] T009 Handle Groq API key storage and retrieval in options/options.js
- [x] T010 [P] Register GroqTimestampProvider in background/provider-registry.js
- [x] T011 Contract test for Groq Whisper API request/response format in tests/contract/test-groq-whisper.js

**Checkpoint**: Foundation ready - Groq timestamp extraction works, settings configured

---

## Phase 3: User Story 1 - Audio-Text Stays in Sync (Priority: P1) 🎯 MVP

**Goal**: Highlighted text precisely matches spoken audio (<200ms paragraph, <100ms word latency)

**Independent Test**: Play any paragraph, verify highlight matches audio within latency thresholds

### Tests for User Story 1

- [ ] T012 [P] [US1] Unit test for sync loop timing accuracy in tests/unit/playback-sync.test.js
- [ ] T013 [P] [US1] Unit test for paragraph boundary detection in tests/unit/playback-sync.test.js

### Implementation for User Story 1

- [x] T014 [US1] Refactor sync loop to always read audio.currentTime on each frame in background/playback-sync.js
- [x] T015 [US1] Implement syncToParagraph() using authoritative audio.currentTime in background/playback-sync.js
- [x] T016 [P] [US1] Add paragraph timeline calculation from actual audio duration in background/playback-sync.js
- [x] T017 [US1] Integrate word timeline from GroqTimestampProvider into PlaybackSyncState in background/playback-sync.js
- [x] T018 [US1] Implement syncToWord() finding current word from wordTimeline in background/playback-sync.js
- [x] T019 [US1] Send HIGHLIGHT_WORD messages from background to content script in background/background.js
- [x] T020 [P] [US1] Handle HIGHLIGHT_WORD message in content script in content/content.js
- [x] T021 [US1] Implement CSS Custom Highlight API word highlighting in content/content.js
- [x] T022 [US1] Add word range creation using charOffset/charLength in content/text-segment.js

**Checkpoint**: Audio and text highlight are synchronized. Core sync works.

---

## Phase 4: User Story 2 - Highlight Persists Until Section Complete (Priority: P1)

**Goal**: Paragraph/word stays highlighted until its audio section completely finishes

**Independent Test**: Play long paragraph, verify highlight remains throughout until next paragraph begins

### Tests for User Story 2

- [ ] T023 [P] [US2] Unit test for highlight persistence during paragraph in tests/unit/playback-sync.test.js
- [ ] T024 [P] [US2] Unit test for highlight transition at paragraph boundary in tests/unit/playback-sync.test.js

### Implementation for User Story 2

- [x] T025 [US2] Ensure highlight only clears when next section starts in background/playback-sync.js
- [x] T026 [US2] Handle pause state - maintain current highlight without updates in background/playback-sync.js
- [x] T027 [US2] Verify word highlight spans entire word duration (startMs to endMs) in background/playback-sync.js

**Checkpoint**: Highlights persist correctly. No premature clearing.

---

## Phase 5: User Story 3 - Word-Level Sync via Groq Whisper API (Priority: P2)

**Goal**: Word-by-word highlighting using Groq Whisper timestamps for any TTS provider

**Independent Test**: Use any TTS provider, verify each word highlights within 100ms of being spoken

### Tests for User Story 3

- [ ] T028 [P] [US3] Unit test for Groq response parsing in tests/unit/groq-timestamp.test.js
- [ ] T029 [P] [US3] Unit test for word alignment algorithm in tests/unit/groq-timestamp.test.js
- [ ] T030 [P] [US3] Unit test for fallback when Groq unavailable in tests/unit/groq-timestamp.test.js

### Implementation for User Story 3

- [x] T031 [US3] Call GroqTimestampProvider after TTS audio generated in background/background.js
- [x] T032 [US3] Cache word timings alongside audio data in background/audio-cache.js
- [x] T033 [US3] Handle Groq API errors (401, 429) with graceful fallback in background/providers/groq-timestamp-provider.js
- [x] T034 [US3] Implement fallback to paragraph-only sync when word timing unavailable in background/playback-sync.js
- [x] T035 [P] [US3] Send SET_WORD_TIMELINE message to content script in background/background.js
- [x] T036 [US3] Handle fuzzy word matching for contractions and numbers in background/providers/groq-timestamp-provider.js

**Checkpoint**: Word-level sync works with any TTS provider via Groq. Fallback works.

---

## Phase 6: User Story 5 - Seek/Navigation Maintains Sync (Priority: P3)

**Goal**: When user seeks or navigates, highlight immediately updates to match new audio position

**Independent Test**: Click progress bar to seek to 50%, verify correct paragraph/word highlighted within 100ms

### Tests for User Story 5

- [ ] T037 [P] [US5] Unit test for seek position to paragraph mapping in tests/unit/playback-sync.test.js
- [ ] T038 [P] [US5] Unit test for seek position to word mapping in tests/unit/playback-sync.test.js

### Implementation for User Story 5

- [x] T039 [US5] Implement seekToTime(timeMs) updating highlight immediately in background/playback-sync.js
- [x] T040 [US5] Handle seeking to mid-paragraph - find correct word in background/playback-sync.js
- [x] T041 [US5] Ensure Previous/Next buttons restart paragraph audio with correct highlight in background/background.js

**Checkpoint**: Seek and navigation maintain sync correctly.

---

## Phase 7: User Story 6 - Recovery from Sync Drift (Priority: P3)

**Goal**: System auto-corrects sync drift without user intervention

**Independent Test**: Simulate drift condition, verify auto-correction within 500ms

### Tests for User Story 6

- [ ] T042 [P] [US6] Unit test for drift detection threshold in tests/unit/playback-sync.test.js
- [ ] T043 [P] [US6] Unit test for drift auto-correction in tests/unit/playback-sync.test.js

### Implementation for User Story 6

- [x] T044 [US6] Add drift detection (compare expected vs actual time) in background/playback-sync.js
- [x] T045 [US6] Log warning when drift exceeds 200ms in background/playback-sync.js
- [x] T046 [US6] Handle tab visibility change - resync on return to foreground in background/background.js
- [x] T047 [US6] Ensure continuous correction per frame (no jarring jumps) in background/playback-sync.js

**Checkpoint**: Drift is detected and auto-corrected smoothly.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, performance, and final validation

- [x] T048 [P] Handle 2x playback speed - scale word timings proportionally in background/playback-sync.js
- [x] T049 [P] Clear all highlights on playback stop in content/content.js
- [x] T050 [P] Add WORD_SYNC_STATUS message for popup indicator in background/background.js
- [x] T051 Handle loadedmetadata event to rebuild timings when duration known in background/playback-sync.js
- [x] T052 Performance validation - ensure highlight update <5ms per frame in background/playback-sync.js
- [x] T053 Run manual test per quickstart.md validation scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational
- **User Story 2 (Phase 4)**: Depends on Foundational (can parallel with US1)
- **User Story 3 (Phase 5)**: Depends on Foundational + partially on US1 for sync loop
- **User Story 5 (Phase 6)**: Depends on Foundational + US1 (sync infrastructure)
- **User Story 6 (Phase 7)**: Depends on Foundational + US1 (sync infrastructure)
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

| Story | Depends On | Can Parallel With |
|-------|------------|-------------------|
| US1 (P1) | Foundational | US2 |
| US2 (P1) | Foundational | US1 |
| US3 (P2) | Foundational, US1 sync loop | - |
| US5 (P3) | Foundational, US1 sync loop | US6 |
| US6 (P3) | Foundational, US1 sync loop | US5 |

### Within Each User Story

1. Tests written first and verify they FAIL
2. Core implementation
3. Integration with existing code
4. Checkpoint validation

### Parallel Opportunities

**Phase 2 (Foundational)**:
```
T006 (word alignment) || T007 (data structures) || T010 (registry)
```

**Phase 3 (US1)**:
```
T012 (test) || T013 (test)
T016 (timeline) || T020 (content handler)
```

**Phase 5 (US3)**:
```
T028 (test) || T029 (test) || T030 (test)
```

---

## Parallel Example: User Story 1

```bash
# Launch tests in parallel:
Task: "Unit test for sync loop timing accuracy in tests/unit/playback-sync.test.js"
Task: "Unit test for paragraph boundary detection in tests/unit/playback-sync.test.js"

# Launch independent implementation tasks in parallel:
Task: "Add paragraph timeline calculation from actual audio duration in background/playback-sync.js"
Task: "Handle HIGHLIGHT_WORD message in content script in content/content.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (~3 tasks)
2. Complete Phase 2: Foundational (~8 tasks) - CRITICAL
3. Complete Phase 3: User Story 1 (~11 tasks)
4. Complete Phase 4: User Story 2 (~5 tasks)
5. **STOP and VALIDATE**: Test paragraph sync independently
6. Deploy/demo - basic sync working

### Incremental Delivery

1. **Foundation** → Groq timestamp extraction ready
2. **+US1+US2** → Paragraph sync working (MVP!)
3. **+US3** → Word-level sync with Groq
4. **+US5+US6** → Seek/drift handling (polish)
5. Each increment adds value independently

### Deferred Work

- **User Story 4**: Native Provider Timestamps (ElevenLabs) - marked [TODO] in spec
- Add as Phase 9 in future iteration

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently testable
- Tests should FAIL before implementation
- Commit after each logical task group
- Stop at any checkpoint to validate independently
