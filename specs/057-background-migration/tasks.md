# Tasks: Background.ts Migration to Hexagonal Architecture

**Input**: Design documents from `/specs/057-background-migration/`
**Prerequisites**: plan.md (required)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup — Verify Current State

**Purpose**: Confirm PlaybackService works and identify any gaps before flipping the flag

- [X] T001 [US1] Run full test suite to establish baseline (`npm run test:unit`, `npm run test:contract`, `npm run test:security`)
- [X] T002 [US1] Run TypeScript compiler check (`npx tsc --noEmit`) and document any pre-existing errors
- [X] T003 [US1] Run production build (`npm run build:firefox`) to confirm it builds clean

**Checkpoint**: Baseline established — we know what passes before any changes

---

## Phase 2: Evaluate Legacy Stubs — Identify What Can Be Deleted

**Purpose**: Audit `src/utils/messaging/handlers/` files to classify as pure stub vs real implementation

- [X] T004 [P] [US2] Audit `src/utils/messaging/handlers/cache-handlers.ts` — check if used by any hex handler or background.ts
- [X] T005 [P] [US2] Audit `src/utils/messaging/handlers/highlight.ts` — check if used by any hex handler or background.ts
- [X] T006 [P] [US2] Audit `src/utils/messaging/handlers/language.ts` — check if used by any hex handler or background.ts
- [X] T007 [P] [US2] Audit `src/utils/messaging/handlers/logging.ts` — check if used by any hex handler or background.ts

**Checkpoint**: Complete classification of all stub files (delete vs keep)

---

## Phase 3: Delete Pure Stubs — US2 Clean Dead Code

**Purpose**: Remove pure stub files that return hardcoded values and are never called at runtime

- [X] T008 [P] [US2] Delete `src/utils/messaging/handlers/playback.ts` (pure stub, all TODO Phase 4)
- [X] T009 [P] [US2] Delete `src/utils/messaging/handlers/audio.ts` (pure stub)
- [X] T010 [P] [US2] Delete `src/utils/messaging/handlers/content.ts` (pure stub)
- [X] T011 [P] [US2] Delete `src/utils/messaging/handlers/provider.ts` (pure stub)
- [X] T012 [P] [US2] Delete `src/utils/messaging/handlers/footer.ts` (pure stub)
- [X] T013 [US2] Delete any additional pure stubs identified in T004-T007
- [X] T014 [US2] Update `src/utils/messaging/handlers/index.ts` — remove re-exports for deleted files
- [X] T015 [US2] Fix any import errors caused by deleted files (grep for imports from deleted modules)
- [X] T016 [US2] Run `npx tsc --noEmit` to verify no compilation errors from deletions

**Checkpoint**: All pure stubs deleted, project still compiles

---

## Phase 4: Flip the Migration Flag — US1 Core Migration

**Purpose**: Route all playback messages through hexagonal handlers instead of legacy background.ts code

- [X] T017 [US1] Set `USE_LEGACY_PLAYBACK: false` in `src/entrypoints/background.ts` MIGRATION_FLAGS
- [X] T018 [US1] Manual smoke test: verify playback start → play → pause → resume → next → previous → stop flow
- [X] T019 [US1] Run `npm run test:unit` to verify all tests still pass with flag flipped
- [X] T020 [US1] Run `npm run test:contract` to verify contract tests pass

**Checkpoint**: Playback routed through hexagonal architecture, manually verified working

---

## Phase 5: Refactor background.ts — US3 Reduce to Composition Root

**Purpose**: Remove dead legacy playback code from background.ts, reduce to <500 LOC

- [X] T021 [US3] Remove legacy playback state variables and types (PlaybackState interface, currentParagraph, paragraphs[], isPlaying, etc.)
- [X] T022 [US3] Remove native audio playback functions (playAudioNative, stopAudioNative, pauseAudioNative, resumeAudioNative, setAudioSpeedNative)
- [X] T023 [US3] Remove ElevenLabs integration functions (initElevenLabsProvider, generateElevenLabsAudio)
- [X] T024 [US3] Remove word highlighting functions (startWordHighlighting, stopWordHighlighting)
- [X] T025 [US3] Remove blob URL lifecycle management (trackBlobUrl, revokeAllBlobUrls, cleanupOldBlobUrls)
- [X] T026 [US3] Remove prefetch orchestration functions (configurePrefetchService, startPrefetching, prefetchUpcomingAudio, clearPrefetchCache)
- [X] T027 [US3] Remove persistent cache bridge functions (checkPersistentCache, storeToPersistentCache)
- [X] T028 [US3] Remove speakCurrentParagraph orchestration function (~310 lines)
- [X] T029 [US3] Remove legacy playback message handlers (startPlayback, pausePlayback, resumePlayback, stopPlayback, nextParagraph, previousParagraph, getPlaybackState, seekToPosition, jumpToParagraph, FOOTER_ACTION handlers)
- [X] T030 [US3] Remove PARAGRAPH_CLICKED legacy handler (now handled by playback.start hex handler)
- [X] T031 [US3] Remove legacy telemetry handlers (getLogs, flushLogs) if migrated to hex logging handlers
- [X] T032 [US3] Remove the LEGACY_TO_HEXAGONAL_MAP and shouldUseLegacy() routing — all messages now go through hex
- [X] T033 [US3] Remove MIGRATION_FLAGS interface and constants — all flags are false, no longer needed
- [X] T034 [US3] Remove loadMigrationFlags() function
- [X] T035 [US3] Clean up imports — remove unused imports from background.ts
- [X] T036 [US3] Run `npx tsc --noEmit` after each major removal to catch errors early
- [X] T037 [US3] Verify background.ts is <500 LOC after cleanup

**Checkpoint**: background.ts is a clean composition root

---

## Phase 6: Polish & Validation

**Purpose**: Final verification and cleanup

- [X] T038 [P] Run `npx tsc --noEmit` — zero errors
- [X] T039 [P] Run `npm run lint` — zero issues
- [X] T040 Run `npm run test:unit` — all tests pass
- [X] T041 Run `npm run test:contract` — all tests pass
- [X] T042 Run `npm run test:security` — all tests pass
- [X] T043 Run `npm run build:firefox` — production build succeeds
- [X] T044 Count final LOC of background.ts and report

**Checkpoint**: All validation passes, migration complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — baseline verification
- **Phase 2 (Audit)**: No dependencies — can run in parallel with Phase 1
- **Phase 3 (Delete Stubs)**: Depends on Phase 2 (audit results)
- **Phase 4 (Flip Flag)**: Depends on Phase 3 (stubs deleted, project compiles)
- **Phase 5 (Refactor)**: Depends on Phase 4 (flag flipped, playback verified)
- **Phase 6 (Polish)**: Depends on Phase 5 (refactor complete)

### Risk Notes

- Phase 4 (flag flip) is the highest-risk step — if PlaybackService doesn't work, flip back to true
- Phase 5 (refactor) should be done incrementally with tsc checks after each removal
- Keep `src/utils/messaging/handlers/queue.ts`, `export.ts`, `summarize.ts`, `settings.ts` — they have real implementations still used
