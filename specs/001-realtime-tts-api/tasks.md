# Tasks: Real-Time TTS API Integration

**Input**: Design documents from `/specs/001-realtime-tts-api/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Contract tests required per Constitution Principle V. Unit tests optional.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This is a browser extension project:
- `background/` - Service worker and provider modules
- `content/` - Content scripts for page interaction
- `popup/` - Extension popup UI
- `options/` - Settings page
- `manifest.json` - Extension configuration

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create providers directory and base infrastructure

- [x] T001 Create providers directory at background/providers/
- [x] T002 [P] Update manifest.json to add Cartesia host permission (https://api.cartesia.ai/*)
- [x] T003 [P] Create PlaybackStatus enum constants in background/constants.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create TTSProvider base class with interface in background/providers/base-provider.js
- [x] T005 [P] Create PricingModel utility class in background/providers/pricing-model.js
- [x] T006 Refactor existing OpenAI TTS code into background/providers/openai-provider.js (extends base-provider)
- [x] T007 Refactor existing ElevenLabs TTS code into background/providers/elevenlabs-provider.js (extends base-provider)
- [x] T008 Create provider registry in background/provider-registry.js (Map of providerId → provider instance)
- [x] T009 Update background/background.js to use provider registry instead of inline provider logic

**Checkpoint**: Foundation ready - all existing functionality preserved with new modular architecture

---

## Phase 2.5: Contract Tests (Constitution V Compliance)

**Purpose**: Contract tests for TTS providers per constitution requirement

- [x] T050 [P] Create contract test for OpenAI provider in tests/contract/test-openai-provider.js
- [x] T051 [P] Create contract test for ElevenLabs provider in tests/contract/test-elevenlabs-provider.js
- [x] T052 [P] Create contract test for Cartesia provider in tests/contract/test-cartesia-provider.js
- [x] T053 [P] Create contract test for Browser provider in tests/contract/test-browser-provider.js

**Note**: Tests verify request format and response handling per contracts/*.md specifications. All tests can run in parallel.

**Checkpoint**: Contract tests pass - provider integrations verified

---

## Phase 3: User Story 1 - Synchronized Reading with Highlighting (Priority: P1) 🎯 MVP

**Goal**: Audio playback with paragraph highlighting that stays in sync within 200ms

**Independent Test**: Play any webpage with multiple paragraphs and verify highlight moves in sync with audio completion

### Implementation for User Story 1

- [x] T010 [US1] Enhance PlaybackSession state management in background/background.js to track currentIndex and status transitions
- [x] T011 [US1] Update highlightParagraph() in content/content.js to accept timestamp for sync verification
- [x] T012 [US1] Implement paragraph click handler in content/content.js to jump playback to clicked paragraph
- [x] T013 [US1] Update background/background.js playCurrentParagraph() to emit highlight event immediately before audio starts
- [x] T014 [US1] Add progress event emitter in background/background.js to update popup with current paragraph index
- [x] T015 [US1] Update popup/popup.js to display current paragraph number and total paragraphs
- [x] T016 [US1] Add smooth scroll-into-view for highlighted paragraph in content/content.js
- [x] T017 [US1] Handle edge case: skip empty paragraphs (whitespace/punctuation only) in background/background.js splitIntoParagraphs()

**Checkpoint**: User Story 1 complete - basic playback with synchronized highlighting works independently

---

## Phase 4: User Story 2 - Provider Selection Based on Quality/Cost Preference (Priority: P2)

**Goal**: Users can switch between OpenAI, ElevenLabs, Cartesia, and browser TTS with voice selection

**Independent Test**: Switch providers in settings, play same text, verify different provider is used

### Implementation for User Story 2

- [x] T018 [P] [US2] Create Cartesia provider in background/providers/cartesia-provider.js (implements base-provider)
- [x] T019 [P] [US2] Refactor browser TTS into background/providers/browser-provider.js (implements base-provider)
- [x] T020 [US2] Add Cartesia to provider registry in background/provider-registry.js
- [x] T021 [US2] Create cost estimator module in background/cost-estimator.js with estimateCost(text, provider) function
- [x] T022 [US2] Add API key validation method to each provider class (validateKey() → boolean)
- [x] T023 [US2] Update options/options.html to add Cartesia API key input field
- [x] T024 [US2] Update options/options.js to handle Cartesia API key storage and validation
- [x] T025 [US2] Add voice selection dropdown per provider in popup/popup.html
- [x] T026 [US2] Update popup/popup.js to populate voice dropdown based on selected provider
- [x] T027 [US2] Add provider switching handler in background/background.js that preserves playback position
- [x] T028 [US2] Display cost estimate before playback in popup/popup.js (FR-006)
- [x] T029 [US2] Show API key missing message when premium provider selected without key in popup/popup.js
- [x] T030 [US2] Implement graceful fallback to browser TTS when API keys unavailable in background/background.js

**Checkpoint**: User Story 2 complete - all four providers selectable with voice options and cost display

---

## Phase 5: User Story 3 - Streaming Audio for Long Content (Priority: P3)

**Goal**: Long articles begin playing within 1 second; cached segments enable instant rewind

**Independent Test**: Play 10+ paragraph article, verify audio starts within 1 second, rewind plays instantly without API call

### Implementation for User Story 3

- [x] T031 [US3] Create AudioSegment class in background/audio-segment.js per data-model.md
- [x] T032 [US3] Create LRU audio cache in background/audio-cache.js with max 50 entries
- [x] T033 [US3] Implement cache key generation (hash of provider+voice+text) in background/audio-cache.js
- [x] T034 [US3] Add pre-generation of next 2 paragraphs while current plays in background/background.js
- [x] T035 [US3] Integrate audio cache into playCurrentParagraph() - check cache before API call
- [x] T036 [US3] Add cache hit indicator in popup/popup.js (show "cached" badge for instant playback)
- [x] T037 [US3] Implement cache clearing on provider change in background/background.js
- [x] T038 [US3] Implement cache clearing on page navigation in background/background.js
- [x] T039 [US3] Handle network interruption: complete current paragraph, show retry option in popup/popup.js
- [x] T040 [US3] Add resume from pause: continue from cached position without re-generating in background/background.js
- [x] T041 [US3] Display generation progress indicator in popup/popup.js for paragraphs being pre-generated

**Checkpoint**: User Story 3 complete - streaming and caching work independently

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T042 [P] Add error handling for rate limit responses in all providers (show countdown in popup)
- [x] T043 [P] Add error handling for invalid API keys with clear user messaging
- [x] T044 [P] Style cost estimate display in popup/popup.css
- [x] T045 [P] Style cache indicator badge in popup/popup.css
- [x] T046 [P] Style generation progress indicator in popup/popup.css
- [x] T047 Run web-ext lint to validate manifest.json
- [x] T048 Test all flows from quickstart.md validation checklist
- [x] T049 Update README.md with Cartesia provider documentation
- [x] T054 Verify playback speed adjustment (0.5x-2.0x) works for all providers, clamp Cartesia to 0.6-1.5x range

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 can start immediately after Foundational
  - US2 can start after Foundational (independent of US1)
  - US3 can start after Foundational (independent of US1, US2)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent of US1
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent of US1, US2

### Within Each User Story

- Tasks without [P] marker depend on previous tasks in that phase
- Tasks with [P] can run in parallel with other [P] tasks in same phase
- Complete all tasks in a phase before moving to checkpoint

### Parallel Opportunities

**Phase 1 (Setup)**:
```
T001 (dir) → T002 [P] (manifest)
           → T003 [P] (constants)
```

**Phase 2 (Foundational)**:
```
T004 (base) → T005 [P] (pricing)
           → T006 (openai) → T007 (elevenlabs) → T008 (registry) → T009 (background)
```

**Phase 4 (US2)**:
```
T018 [P] (cartesia) + T019 [P] (browser) → T020 (registry) → T021-T030 (sequential)
```

**Phase 5 (US3)**:
```
T031 (segment) → T032 (cache) → T033 (key) → T034-T041 (sequential)
```

---

## Parallel Example: User Story 2

```bash
# Launch Cartesia and Browser providers in parallel:
Task T018: "Create Cartesia provider in background/providers/cartesia-provider.js"
Task T019: "Refactor browser TTS into background/providers/browser-provider.js"

# After both complete, continue sequentially:
Task T020: "Add Cartesia to provider registry"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - refactors existing code)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test highlight sync on multiple webpages
5. Deploy/demo if ready (existing functionality preserved + better sync)

### Incremental Delivery

1. Complete Setup + Foundational → Modular architecture ready
2. Add User Story 1 → Test independently → Deploy (MVP with better sync)
3. Add User Story 2 → Test independently → Deploy (4 providers, cost display)
4. Add User Story 3 → Test independently → Deploy (streaming, caching)
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (highlight sync)
   - Developer B: User Story 2 (providers, cost)
   - Developer C: User Story 3 (caching, streaming)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Existing functionality (OpenAI, ElevenLabs) must remain working throughout
- Browser TTS is already implemented but needs refactoring into provider pattern
