# Tasks: Complete Architecture Migration

**Input**: Design documents from `/specs/061-complete-architecture-migration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. Test tasks are omitted. Existing tests must continue to pass.

**Organization**: Tasks grouped by user story. US1+US2 are both P1 but US2 depends on US1 completing first (footer/highlight sync requires working playback). US3+US4 are P2 and independent. US5 is P3 cleanup.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Branch preparation and baseline verification

- [x] T001 Verify branch `061-complete-architecture-migration` is clean and synced with main
- [x] T002 Run `pnpm test` to establish baseline test results (expected: 2,487 passing)
- [x] T003 Run `pnpm run build:firefox` to verify build succeeds before changes

**Checkpoint**: Baseline established, all existing tests pass, build succeeds

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Port contract changes that all user stories depend on

**CRITICAL**: US1 audio fix and US2 message fix both depend on the port update in T004.

- [x] T004 Add `playbackMode: 'blob' | 'direct'` property to `IAudioGenerator` interface and `playedDirectly?: boolean` to `AudioResponse` type in `src/ports/audio-generator.port.ts`
- [x] T005 Add `playbackMode: 'blob'` readonly property to `ElevenLabsAudioAdapter` in `src/adapters/audio/elevenlabs-audio.adapter.ts` (no behavior change, just satisfies updated interface)

**Checkpoint**: Port contract updated. Both adapters can now declare their playback strategy. Build still passes.

---

## Phase 3: User Story 1 — Play a Web Page Aloud (Priority: P1) MVP

**Goal**: User clicks Play → audio is audible → popup controls work. No more "Invalid URI" or "Unknown message type" errors.

**Independent Test**: Open any article in Firefox, click VoxPage icon, press Play. Audio plays within 5 seconds. Pause/Resume/Next/Previous/Stop all work from the popup.

### Implementation for User Story 1

- [x] T006 [US1] Refactor `BrowserTtsAudioAdapter.generateAudio()` to set `playedDirectly: true` in the response and add `readonly playbackMode = 'direct' as const` in `src/adapters/audio/browser-tts-audio.adapter.ts`
- [x] T007 [US1] Update `PlaybackService.generateAndPlayParagraph()` to check `response.playedDirectly` — if true, track progress via estimated duration and utterance events instead of `HTMLAudioElement` in `src/core/playback/playback-service.ts`
- [x] T008 [US1] Add `trackDirectPlayback(durationMs)` method to `PlaybackService` that simulates progress tracking using `setInterval` and advances to next paragraph on completion in `src/core/playback/playback-service.ts`
- [x] T009 [US1] Add dual-path pause/resume/stop support in `PlaybackService` — for direct mode, call `speechSynthesis.pause()`/`resume()`/`cancel()` instead of `audioElement.pause()`/`play()`/`pause()` in `src/core/playback/playback-service.ts`
- [x] T010 [US1] Replace all 10 legacy camelCase message names with dot-notation in `src/entrypoints/popup/main.ts` per the message-protocol contract: `getPlaybackState`→`playback.getState`, `startPlayback`→`playback.start`, `pausePlayback`→`playback.pause`, `resumePlayback`→`playback.resume`, `stopPlayback`→`playback.stop`, `previousParagraph`→`playback.prev`, `nextParagraph`→`playback.next`, `seekToPosition`→`playback.seek`, `updateSettings`(speed)→`settings.update`, `updateSettings`(provider)→`settings.update`
- [x] T011 [US1] Verify `playback.start` handler in `src/handlers/playback.handlers.ts` correctly extracts text from active tab and calls `PlaybackService.start()` — fix any parameter mismatches between popup payload and handler expectations
- [x] T012 [US1] Run `pnpm run build:firefox` and `pnpm test` to verify no regressions from US1 changes

**Checkpoint**: Core playback works. Audio is audible via Browser TTS (direct) and ElevenLabs (blob). All 6 popup controls function. Zero "Unknown message type" or "Invalid URI" errors in console.

---

## Phase 4: User Story 2 — See Visual Feedback During Playback (Priority: P1)

**Goal**: Sticky footer appears during playback, paragraphs are highlighted, and the popup reflects current playback state.

**Independent Test**: Start playback on a multi-paragraph article. Current paragraph is highlighted. Sticky footer appears at bottom with working controls. Popup shows "Playing" status.

**Depends on**: US1 (playback must work before visual feedback can be verified)

### Implementation for User Story 2

- [x] T013 [US2] Fix footer message types in `HighlightSyncAdapter.showFooter()` — change `type: 'footer.show'` → `type: 'FOOTER_SHOW'` in `src/adapters/messaging/highlight-sync.adapter.ts`
- [x] T014 [US2] Fix footer message types in `HighlightSyncAdapter.hideFooter()` — change `type: 'footer.hide'` → `type: 'FOOTER_HIDE'` in `src/adapters/messaging/highlight-sync.adapter.ts`
- [x] T015 [US2] Fix footer message types in `HighlightSyncAdapter.updateFooterState()` — change `type: 'footer.updateState'` → `type: 'FOOTER_STATE_UPDATE'` in `src/adapters/messaging/highlight-sync.adapter.ts`
- [x] T016 [US2] Fix highlight message types in `HighlightSyncAdapter` — align `type: 'highlight.paragraph'` → `type: 'highlight'`, `type: 'highlight.word'` → `type: 'highlightWord'`, `type: 'highlight.clear'` → `type: 'clearHighlight'` in `src/adapters/messaging/highlight-sync.adapter.ts`
- [x] T017 [US2] Verify content script message routing in `src/entrypoints/content.ts` — confirm `messageKey = message.action || message.type` correctly matches the fixed SCREAMING_SNAKE_CASE types and that `FOOTER_SHOW`, `FOOTER_HIDE`, `FOOTER_STATE_UPDATE` switch cases execute
- [x] T018 [US2] Verify `FOOTER_ACTION` messages from the sticky footer (`src/utils/content/sticky-footer.ts`) reach the background handler — check that `footer.action` handler in `src/handlers/footer.handlers.ts` processes play/pause/next/prev/seek actions from the footer
- [x] T019 [US2] Verify `PlaybackService.updateFooterState()` in `src/core/playback/playback-service.ts` is called during play, pause, next, seek, and setSpeed transitions and that `FooterState` payload matches content script expectations
- [x] T020 [US2] Run `pnpm run build:firefox` and `pnpm test` to verify no regressions from US2 changes

**Checkpoint**: Footer appears when playback starts, shows correct state, controls work. Paragraph highlight advances. Popup shows "Playing" with paragraph count.

---

## Phase 5: User Story 3 — Configure TTS Provider and Speed (Priority: P2)

**Goal**: User can switch between Browser TTS and ElevenLabs providers, adjust playback speed, and changes take effect on the next paragraph.

**Independent Test**: Open settings, switch provider to ElevenLabs (with API key), verify voice changes. Adjust speed to 1.5x, verify next paragraph plays faster.

### Implementation for User Story 3

- [x] T021 [US3] Wire language detection into `PlaybackService` — replace hardcoded `language: null` at line ~347 with detected language from the language detection handler results in `src/core/playback/playback-service.ts`
- [x] T022 [US3] Verify `settings.update` handler in `src/handlers/settings.handlers.ts` correctly persists provider and speed changes to `browser.storage.local` and that `PlaybackService` picks up new settings for the next paragraph
- [x] T023 [US3] Verify ElevenLabs provider selection works — confirm `createAudioGeneratorAdapter('elevenlabs', apiKey)` in `src/composition/factories.ts` creates a functioning `ElevenLabsAudioAdapter` and that the container is re-created when provider changes
- [x] T024 [P] [US3] Fix export handler wiring — either call `setExportDependencies()` during `initHexagonalArchitecture()` in `src/background/init-hexagonal.ts` or remove the hexagonal wrapper in `src/handlers/export.handlers.ts` and route directly to legacy handler in `src/utils/messaging/handlers/export.ts`
- [x] T025 [US3] Run `pnpm run build:firefox` and `pnpm test` to verify no regressions from US3 changes

**Checkpoint**: Provider switch works. Speed changes apply on next paragraph. Language detection populates audio requests. Export feature either works end-to-end or is cleanly simplified.

---

## Phase 6: User Story 4 — Cached Audio Playback (Priority: P2)

**Goal**: Previously played paragraphs are served from cache. Replay is instant. Cache stats display correctly on options page.

**Independent Test**: Play a page, stop, play same page again. Second playback starts faster (cached). Options page shows accurate cache stats.

### Implementation for User Story 4

- [x] T026 [US4] Verify `PlaybackService.generateAndPlayParagraph()` checks `ICacheStore` before calling `IAudioGenerator.generateAudio()` in `src/core/playback/playback-service.ts` — fix cache lookup if not wired
- [x] T027 [US4] Verify cache key generation includes provider, voice, and content hash — check `src/utils/cache/cache-key.ts` format matches what `PlaybackService` uses for lookup and storage
- [x] T028 [US4] Verify cache stats handler (`cache.getStats`) in `src/handlers/cache.handlers.ts` returns accurate entry count, total size, and hit rate to the options page
- [x] T029 [US4] Verify options page cache display in `src/entrypoints/options/controller.ts` renders cache statistics correctly (entry count, size, hit rate, usage bar)
- [x] T030 [US4] Run `pnpm run build:firefox` and `pnpm test` to verify no regressions from US4 changes

**Checkpoint**: Cache lookup works. Replayed pages load from cache (<1s). Options page shows accurate stats.

---

## Phase 7: User Story 5 — Clean, Minimal Codebase (Priority: P3)

**Goal**: Remove all dead code, stale specs, and unreachable features. Every handler that exists is wired and functional. Zero console warnings.

**Independent Test**: Run `pnpm run quality` with zero issues. Run `pnpm test` with all passing. No "Unknown message type" warnings during usage.

### Implementation for User Story 5

- [x] T031 [P] [US5] Delete `src/handlers/summarize.handlers.ts` (314 LOC — dead code, AI providers removed in 056)
- [x] T032 [P] [US5] Delete `src/utils/messaging/handlers/summarize.ts` (87 LOC — legacy duplicate of removed summarize feature)
- [x] T033 [P] [US5] Delete `src/utils/ai/` directory entirely (~50 LOC — orphaned AI summarization utilities)
- [x] T034 [P] [US5] Delete `tests/unit/handlers/summarize.handlers.test.ts` and `tests/unit/summarizer.test.ts` (tests for removed features)
- [x] T035 [P] [US5] Delete `tests/contract/ai-api.test.ts` (contract tests for removed AI providers)
- [x] T036 [US5] Remove summarize handler registration (`regSummarize(registry)`) from `src/handlers/index.ts` and delete the import
- [x] T037 [US5] Remove summarize UI section from `src/entrypoints/popup/main.ts` — delete DOM elements, event listeners, `handleSummarizeClick()` function, and `summarizeSection` visibility logic
- [x] T038 [US5] Remove summarize message types from protocol definition in `src/utils/messaging/protocol.ts` — delete `summarize.article`, `summarize.readSummary`, `summarize.getProviderStatus`
- [x] T039 [US5] Remove any legacy camelCase message name fallback/mapping shims in `src/entrypoints/background.ts` that are no longer needed now that popup uses dot-notation
- [x] T040 [US5] Audit `src/handlers/` directory — verify every remaining handler file is registered, callable, and has at least one integration path from popup or content script
- [x] T041 [US5] Archive stale spec directories — move specs that don't correspond to current features into `specs/_archive/` or delete them to reduce from 57 to ~10 active specs
- [x] T042 [US5] Run `pnpm test` — fix any test failures caused by deletions (update imports, remove stale mocks)
- [x] T043 [US5] Run `pnpm run quality` — verify zero circular dependencies, <2% code duplication, manifest lint passes

**Checkpoint**: All dead code removed. Every handler is wired. Test suite passes. Quality checks pass.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and validation across all user stories

- [x] T044 Run `pnpm run build:firefox` to verify production build succeeds
- [ ] T045 Manual browser test: US1 — play a Wikipedia article via Browser TTS, test all 6 controls (play, pause, resume, stop, next, previous) *(requires Firefox — deferred to user)*
- [ ] T046 Manual browser test: US2 — verify paragraph highlighting advances, sticky footer appears, footer controls work, popup shows correct status *(requires Firefox — deferred to user)*
- [ ] T047 Manual browser test: US3 — switch to ElevenLabs (with API key), verify different voice; change speed to 1.5x, verify effect *(requires Firefox — deferred to user)*
- [ ] T048 Manual browser test: US4 — play a page, stop, replay same page, verify faster start from cache *(requires Firefox — deferred to user)*
- [ ] T049 Manual browser test: US5 — open browser console, use all features, verify zero "Unknown message type" or "Invalid URI" warnings *(requires Firefox — deferred to user)*
- [ ] T050 Run quickstart.md validation — follow the quickstart guide end-to-end to verify a new developer can set up and test within 10 minutes *(requires Firefox — deferred to user)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core playback fix
- **US2 (Phase 4)**: Depends on US1 (Phase 3) — visual feedback requires working playback
- **US3 (Phase 5)**: Depends on Phase 2 — can run in parallel with US1/US2 (except for manual verification)
- **US4 (Phase 6)**: Depends on Phase 2 — can run in parallel with US1/US2
- **US5 (Phase 7)**: Depends on US1 + US2 (to avoid deleting code that might be needed for fixes)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends only on Foundational (Phase 2)
- **US2 (P1)**: Depends on US1 — footer/highlight verification requires working audio
- **US3 (P2)**: Independent of US1/US2 after Foundational — can parallelize
- **US4 (P2)**: Independent of US1/US2 after Foundational — can parallelize
- **US5 (P3)**: Should run AFTER US1+US2+US3 to avoid removing code that needs fixing

### Within Each User Story

- Port/interface changes before adapter changes
- Adapter changes before service changes
- Service changes before UI changes
- Build verification at end of each story

### Parallel Opportunities

**After Phase 2 completes**:
- T006-T009 (Browser TTS fix) can run in parallel with T010 (popup message names) since they modify different files
- T013-T016 (highlight-sync adapter) are all in the same file and should be sequential
- T021 (language detection) can run in parallel with T024 (export fix) — different files
- T026-T029 (cache verification) can run in parallel with T021-T024 (provider/settings) — different files
- T031-T035 (dead code deletion) can ALL run in parallel — each deletes a different file

---

## Parallel Example: User Story 5 (Cleanup)

```bash
# Launch all file deletions in parallel (different files, no dependencies):
Task: T031 "Delete src/handlers/summarize.handlers.ts"
Task: T032 "Delete src/utils/messaging/handlers/summarize.ts"
Task: T033 "Delete src/utils/ai/ directory"
Task: T034 "Delete tests/unit/handlers/summarize.handlers.test.ts and tests/unit/summarizer.test.ts"
Task: T035 "Delete tests/contract/ai-api.test.ts"

# Then sequential tasks that depend on deletions:
Task: T036 "Remove registration from src/handlers/index.ts"
Task: T037 "Remove UI from src/entrypoints/popup/main.ts"
Task: T038 "Remove from protocol in src/utils/messaging/protocol.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T005)
3. Complete Phase 3: US1 — Core Playback (T006-T012)
4. **STOP and VALIDATE**: Test playback end-to-end in Firefox
5. Audio is audible, all controls work → MVP delivered

### Incremental Delivery

1. Setup + Foundational → Port contract ready
2. Add US1 → Playback works → Core MVP
3. Add US2 → Footer + highlights → Visual MVP
4. Add US3 → Provider switching + language → Full P2
5. Add US4 → Cache integration → Performance MVP
6. Add US5 → Cleanup → Production-ready codebase
7. Polish → Final verification → Release candidate

### Recommended Execution Order (Single Developer)

1. T001-T003 (Setup)
2. T004-T005 (Foundational)
3. T006-T012 (US1 — most critical, restores core functionality)
4. T013-T020 (US2 — depends on US1, completes visual experience)
5. T021-T025 (US3 — provider/settings wiring)
6. T026-T030 (US4 — cache verification)
7. T031-T043 (US5 — cleanup, safest to do last)
8. T044-T050 (Polish — final verification)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No new test tasks generated (not requested). Existing test suite must remain green after each phase.
- T007-T009 are sequential modifications to the same file (`playback-service.ts`) — do not parallelize
- T013-T016 are sequential modifications to the same file (`highlight-sync.adapter.ts`) — do not parallelize
- Commit after each completed user story phase (Phases 3-7)
- Manual browser testing in Phase 8 requires a running `pnpm run dev` session
