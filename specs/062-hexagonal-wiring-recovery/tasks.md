# Tasks: Hexagonal Wiring Recovery

**Input**: Design documents from `/specs/062-hexagonal-wiring-recovery/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/message-contracts.md

**Tests**: Included — spec requires verification tests (SC-001 through SC-010).

**Organization**: Tasks grouped by user story. Foundational phase covers DI wiring that unblocks all stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational — Dependency Injection Wiring

**Purpose**: Wire the 5 missing `set*()` dependency injection calls in `init-hexagonal.ts`. Without this phase, footer handlers crash, language handlers return hardcoded English, highlight/export/logging handlers throw on any call.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T001 Wire `setHighlightSync(container.adapters.highlightSync)` call in `src/background/init-hexagonal.ts` after line 87 (after existing `setSettingsStore` call). Import `setHighlightSync` from `../handlers`. This unblocks footer show/hide/state messaging to content script.

- [ ] T002 Wire `setLanguageDependencies(...)` call in `src/background/init-hexagonal.ts`. Import `detectLanguageFromText` from `../utils/language/detector` and `setLanguageDependencies` from `../handlers`. Pass `{ detectLanguage: (text) => detectLanguageFromText(text)?.code ?? 'en' }`. This unblocks language detection handlers.

- [ ] T003 [P] Wire `setHighlightRepository(...)` call in `src/background/init-hexagonal.ts`. Import `createHighlightRepository` from `../adapters/storage/highlight-indexeddb.adapter` (or equivalent factory) and `setHighlightRepository` from `../handlers`. Call `setHighlightRepository(createHighlightRepository())`. This unblocks highlight CRUD handlers.

- [ ] T004 [P] Wire `setExportDependencies(...)` call in `src/background/init-hexagonal.ts`. Import `setExportDependencies` from `../handlers`. Wire composite dependencies per research.md RQ-1: `generateAudio` from container playback service, `encodeToMp3` from `../utils/audio/encoder`, `createAudioUrl`/`revokeAudioUrl` from browser APIs, `downloadFile` via browser downloads API, `saveExportHistory` via browser.storage.local.

- [ ] T005 [P] Wire `setLoggingDependencies(...)` call in `src/background/init-hexagonal.ts`. Import `setLoggingDependencies` from `../handlers`. Create or import `LogBuffer` and `RemoteLogger` instances from `../utils/logging/`. Wire all 7 methods per research.md RQ-1: `addToBuffer`, `flushBuffer`, `getBufferSize`, `isEnabled`, `getLastFlushAttempt`, `getConsecutiveFailures`, `isCircuitBreakerOpen`.

- [ ] T006 Add `browser.tabs.onActivated` listener in `src/background/init-hexagonal.ts` (or `src/entrypoints/background.ts`) that calls `setActiveTabId(activeInfo.tabId)` on tab switch. Import `setActiveTabId` from `../handlers`. This ensures footer handlers target the correct tab.

- [ ] T007 Forward `sender.tab.id` to hexagonal dispatch in `src/entrypoints/background.ts`. In the message listener, inject `__tabId: sender.tab?.id` into the data object before calling `dispatchToHexagonal(type, { ...data, __tabId: sender.tab?.id })`. Per Contract 7 in contracts/message-contracts.md.

- [ ] T008 Write unit test verifying all `set*()` calls happen during `initHexagonalArchitecture()` in `tests/unit/background/init-hexagonal.test.ts`. Mock all dependencies. Assert that after init, calling footer/language/highlight/export/logging handlers does NOT throw "dependencies not initialized" errors. Verify SC-001.

**Checkpoint**: All handler subsystems are wired. Messages can flow end-to-end. Existing 2,393 tests must still pass.

---

## Phase 2: User Story 1 — Basic Page Read-Aloud (Priority: P1) 🎯 MVP

**Goal**: User clicks "Read" in popup → audio plays → paragraphs highlight → footer shows with controls.

**Independent Test**: Navigate to any article page, click "Read", hear audio, see paragraph highlighting, see footer player.

**Depends on**: Phase 1 (DI wiring complete)

### Highlight Message Fix (FR-007)

- [ ] T009 [US1] Update `FooterState` type in `src/ports/highlight-sync.port.ts` to include `currentTime: string` and `totalTime: string` fields. Rename `currentText` to `currentTime` if it exists, or add both new fields.

- [ ] T010 [US1] Fix `highlightParagraph()` in `src/adapters/messaging/highlight-sync.adapter.ts` (lines 49-53): change `paragraphIndex` to `index`. Add `text` and `timestamp` parameters to the method signature and include them in the message sent to content script. Per Contract 1 in contracts/message-contracts.md. Update the `IHighlightSynchronizer` port interface in `src/ports/highlight-sync.port.ts` to accept `text: string` and `timestamp: number` parameters.

- [ ] T011 [US1] Fix `updateFooterState()` in `src/adapters/messaging/highlight-sync.adapter.ts` (lines 115-127): change `currentText` to `currentTime`, add `totalTime` field from `FooterState`. Per Contract 2 in contracts/message-contracts.md.

### Popup Error Handling (FR-018)

- [ ] T012 [US1] Update `playback.start` call in `src/entrypoints/popup/main.ts` to inspect the response. If response indicates failure (null, error object, or `{ success: false }`), show an error state in the popup UI instead of remaining stuck on "Loading" forever.

### Contract Tests

- [ ] T013 [P] [US1] Write contract test in `tests/contract/highlight-message.contract.test.ts` that instantiates `HighlightSyncAdapter`, calls `highlightParagraph()`, and verifies the message sent via `browser.tabs.sendMessage` contains `{ type: 'highlight', index, text, timestamp, scroll }` — NOT `paragraphIndex`. Also test `updateFooterState()` sends `currentTime` and `totalTime`. Verify SC-003 and SC-006.

**Checkpoint**: Playback with Browser TTS plays audio, highlights paragraphs correctly, footer shows with proper state fields. This is the MVP.

---

## Phase 3: User Story 2 — Provider Switching (Priority: P1)

**Goal**: User changes provider in popup → audio generator reconfigures → next paragraph uses new provider. Speed changes apply immediately.

**Independent Test**: Open popup, change provider from "Browser" to "ElevenLabs", start playback, verify new provider is used.

**Depends on**: Phase 1 (DI wiring), partially Phase 2 (playback.start error handling)

### Stale Reference Fix (FR-010, FR-011, FR-012)

- [ ] T014 [US2] Fix `initialPlaybackState.provider` default in `src/core/playback/playback-state.ts` from `'elevenlabs'` to `'browser'` to match container default. Update the comment to reflect the change.

- [ ] T015 [US2] Add `setAudioGenerator(generator: IAudioGenerator)` method to `PlaybackService` in `src/core/playback/playback-service.ts`. This method replaces the internal audio generator reference. Since `deps` is `private readonly`, either: (a) store audio generator as a separate mutable field, or (b) cast to bypass readonly for this specific field. The method must be usable from `reconfigureAudioGenerator()`.

- [ ] T016 [US2] Update `reconfigureAudioGenerator()` in `src/composition/container.ts` (lines 199-221) to also call `containerInstance.services.playback.setAudioGenerator(newAudioGenerator)` after creating the new adapter. This ensures PlaybackService uses the new generator, not the stale reference.

- [ ] T017 [US2] Call `container.services.playback.subscribeToSettings()` in `src/background/init-hexagonal.ts` after container creation (after the `setSettingsStore` call). This enables reactive settings propagation to PlaybackService when storage changes.

### Popup Message Routing (FR-016, FR-017)

- [ ] T018 [US2] Update provider change handler in `src/entrypoints/popup/main.ts` to send BOTH `settings.update` (persist) AND `provider.select` (reconfigure) messages when user changes provider. Per Contract 4 in contracts/message-contracts.md.

- [ ] T019 [US2] Update speed change handler in `src/entrypoints/popup/main.ts` to send BOTH `settings.update` (persist) AND `playback.setSpeed` (runtime) messages when user changes speed. Per Contract 5 in contracts/message-contracts.md.

### Tests

- [ ] T020 [P] [US2] Write unit test in `tests/unit/core/playback-service.test.ts` (or new file) verifying that calling `setAudioGenerator()` on PlaybackService causes subsequent `generateAudio()` calls to use the new generator. Verify SC-004.

**Checkpoint**: Provider switching works. Speed changes apply immediately. PlaybackService always uses the current generator.

---

## Phase 4: User Story 3 — Language Detection (Priority: P2)

**Goal**: Page language is detected and forwarded to background. Language handlers use franc-min. Popup shows language badge. Provider compatibility is validated.

**Independent Test**: Navigate to a Spanish-language page, verify "ES" badge in popup, verify Spanish voice is used.

**Depends on**: Phase 1 (T002 wires `setLanguageDependencies`), Phase 1 (T007 forwards `sender.tab.id`)

### Language Bridge (FR-009)

- [ ] T021 [US3] Bridge `languageDetected` content script message to hexagonal `language.detect` handler in `src/entrypoints/background.ts`. In the `action`-based message handler section, add a case for `action === 'languageDetected'` that transforms the message data to match what `language.detect` handler expects and dispatches it via `dispatchToHexagonal('language.detect', { ...data, __tabId: sender.tab?.id })`. Per Contract 3 in contracts/message-contracts.md.

- [ ] T022 [US3] Verify `language.detect` handler in `src/handlers/language.handlers.ts` populates `tabLanguageStates` map using the `__tabId` from the enriched data. If the handler doesn't use `__tabId`, update it to call `tabLanguageStates.set(tabId, detectedLanguage)` so per-tab language state is tracked.

- [ ] T023 [P] [US3] Write integration test verifying the full language detection chain: content script sends `{ action: 'languageDetected', metadata: { htmlLang: 'es' }, textSample: '...', url: '...' }` → background bridges to `language.detect` → handler calls `detectLanguage()` → `tabLanguageStates` map is populated with `'es'` for the tab. Verify SC-005.

**Checkpoint**: Language detection flows end-to-end. franc-min is wired. Per-tab language state is tracked.

---

## Phase 5: User Story 4 — Footer Playback Controls (Priority: P2)

**Goal**: Footer shows during playback with correct currentTime, totalTime, progress, paragraph count. Controls (play/pause/next/prev) work.

**Independent Test**: Start playback, verify footer shows with proper time display and progress.

**Depends on**: Phase 1 (T001 wires `setHighlightSync`), Phase 2 (T009-T011 fix footer message fields)

- [ ] T024 [US4] Verify that `PlaybackService` (in `src/core/playback/playback-service.ts`) passes `currentTime` and `totalTime` formatted strings when calling `highlightSync.updateFooterState()`. If not, add time formatting logic (convert progress + duration to "M:SS" format) to the `updateFooterState()` call within the service. Ensure the `FooterState` object includes all fields content script expects.

- [ ] T025 [US4] Verify footer action handling: when content script sends `footer.action` messages (play, pause, next, prev, seek, speed), verify the background handler in `src/handlers/footer.handlers.ts` correctly dispatches to PlaybackService. The `setHighlightSync` (T001) and `setActiveTabId` (T006) wiring must be in place for this to work.

- [ ] T026 [P] [US4] Write test verifying footer state update messages contain all required fields: `status`, `progress`, `currentTime`, `totalTime`, `currentParagraph`, `totalParagraphs`, `speed`. Test that `currentTime` is a formatted string (not `currentText`). Verify SC-006.

**Checkpoint**: Footer shows with correct state during playback. All controls responsive.

---

## Phase 6: User Story 5 — Cached Audio Playback (Priority: P3)

**Goal**: Browser TTS doesn't cache 0-byte blobs. Non-Browser-TTS providers cache correctly. Replay from cache works instantly.

**Independent Test**: Play a page with ElevenLabs, stop, replay — second playback is instant. Browser TTS never stores empty blobs.

**Depends on**: Phase 2 (US1 playback works), Phase 3 (US2 provider switching works)

### Browser TTS Timing Fix (FR-013)

- [ ] T027 [US5] Refactor `generateAudio()` in `src/adapters/audio/browser-tts-audio.adapter.ts` so it does NOT `await` `utterance.onend`. Instead, call `synth.speak(utterance)` and return immediately with `{ playedDirectly: true, audioBlob: new Blob([]), durationMs: estimatedDuration }`. Add an `onEnd` callback or promise property to `AudioResponse` so PlaybackService can detect actual speech completion for paragraph advancement.

- [ ] T028 [US5] Update `trackDirectPlayback()` in `src/core/playback/playback-service.ts` to use the Browser TTS adapter's completion signal (from T027) for paragraph advancement instead of the estimated timer. The timer should only drive progress bar updates; actual `next()` call should wait for real speech completion.

### Cache Bypass for Browser TTS (FR-014, FR-015)

- [ ] T029 [US5] Add guard in `src/core/playback/playback-service.ts` cache-set logic to skip caching when `audioResponse.playedDirectly === true` (Browser TTS). This prevents 0-byte blobs from being stored in IndexedDB. Browser TTS is free, so caching provides no cost benefit.

- [ ] T030 [US5] Add guard in `src/core/playback/playback-service.ts` cache-hit logic: if cached entry has `sizeBytes === 0` or `audioBlob.size === 0`, treat it as a cache miss instead of attempting blob playback. This handles any existing 0-byte entries already in the database.

### Tests

- [ ] T031 [P] [US5] Write unit test for Browser TTS adapter verifying `generateAudio()` returns BEFORE speech synthesis `onend` fires. Mock `speechSynthesis.speak()` and verify the promise resolves without waiting for `onend`. Verify SC-002 (no blocking).

- [ ] T032 [P] [US5] Write unit test verifying PlaybackService does NOT call `cacheStore.set()` when `audioResponse.playedDirectly === true`. Also verify that 0-byte cache entries are treated as cache misses.

**Checkpoint**: Browser TTS plays without gaps. No 0-byte blobs in cache. ElevenLabs caching still works correctly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error propagation improvements, cleanup, and validation.

### Error Propagation (FR-019)

- [ ] T033 Update `dispatchToHexagonal()` in `src/background/init-hexagonal.ts` to return a discriminated error for handler failures. When a handler returns `Err`, return `{ _hexError: true, error: String(innerResult.error) }` instead of `null`. Continue returning `null` ONLY when the handler is not found in the registry. Per Contract 6 in contracts/message-contracts.md.

- [ ] T034 Update background message dispatcher in `src/entrypoints/background.ts` to check for `_hexError` flag in dispatch result. If `result?._hexError`, log the error and return the error to the caller instead of falling through to legacy handler lookup.

- [ ] T035 [P] Write unit test verifying `dispatchToHexagonal()` returns `null` for unregistered message types, returns value for successful handlers, and returns `{ _hexError: true, error: '...' }` for handler errors. Verify SC-007.

### Validation

- [ ] T036 Run full unit test suite (`pnpm run test:unit`) and verify all 2,393 tests still pass. Fix any regressions introduced by earlier phases. Verify SC-008.

- [ ] T037 Run build (`pnpm run build:firefox`) and verify output size < 1MB. Verify SC-009.

- [ ] T038 Run quality checks: `pnpm run deps:check` (0 circular deps), `pnpm run duplication` (< 2%), `pnpm run lint` (0 errors). Verify SC-010.

- [ ] T039 Manual browser test: start `pnpm run dev`, navigate to an article page, click "Read" in popup. Verify: (a) audio plays with no silent gaps, (b) paragraphs highlight in sequence, (c) footer shows with progress/time, (d) provider switch changes audio source.

**Checkpoint**: All success criteria met. Extension is functional end-to-end.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — start immediately. BLOCKS all user stories.
- **Phase 2 (US1 - Basic Playback)**: Depends on Phase 1 completion
- **Phase 3 (US2 - Provider Switching)**: Depends on Phase 1 completion. Can parallel with Phase 2.
- **Phase 4 (US3 - Language Detection)**: Depends on Phase 1 (T002, T007). Can parallel with Phase 2/3.
- **Phase 5 (US4 - Footer Controls)**: Depends on Phase 1 (T001) and Phase 2 (T009-T011).
- **Phase 6 (US5 - Cached Audio)**: Depends on Phase 2 (US1 works) and Phase 3 (provider switch works).
- **Phase 7 (Polish)**: Depends on all story phases complete.

### User Story Dependencies

- **US1 (P1 - Read-Aloud)**: Phase 1 only → independent
- **US2 (P1 - Provider Switch)**: Phase 1 only → independent of US1
- **US3 (P2 - Language)**: Phase 1 only → independent
- **US4 (P2 - Footer)**: Phase 1 + Phase 2 (highlight fix) → depends on US1 fixes
- **US5 (P3 - Caching)**: Phase 2 + Phase 3 → depends on US1 + US2 working

### Parallel Opportunities

**After Phase 1 completes:**
- US1 (Phase 2), US2 (Phase 3), and US3 (Phase 4) can ALL proceed in parallel
- US4 (Phase 5) can start in parallel but needs T009-T011 from Phase 2

**Within phases:**
- T003 + T004 + T005 can run in parallel (different handler files)
- T013 can run in parallel with T009-T011 (test vs implementation)
- T020 can run in parallel with T018-T019 (test vs implementation)
- T031 + T032 can run in parallel (different test files)

---

## Parallel Example: Phase 1 (Foundational)

```bash
# Sequential (order matters for T001-T002):
Task T001: "Wire setHighlightSync in init-hexagonal.ts"
Task T002: "Wire setLanguageDependencies in init-hexagonal.ts"

# Parallel (different handler files, independent):
Task T003: "Wire setHighlightRepository in init-hexagonal.ts"
Task T004: "Wire setExportDependencies in init-hexagonal.ts"
Task T005: "Wire setLoggingDependencies in init-hexagonal.ts"

# Then:
Task T006: "Add browser.tabs.onActivated listener"
Task T007: "Forward sender.tab.id to dispatch"
Task T008: "Unit test for DI wiring"
```

## Parallel Example: After Phase 1 Complete

```bash
# All three can run simultaneously:
Phase 2 (US1): T009 → T010 → T011 → T012 → T013
Phase 3 (US2): T014 → T015 → T016 → T017 → T018 → T019 → T020
Phase 4 (US3): T021 → T022 → T023
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational DI Wiring (T001-T008)
2. Complete Phase 2: US1 Basic Playback (T009-T013)
3. **STOP and VALIDATE**: `pnpm run dev` → navigate to article → click "Read" → hear audio + see highlights + see footer
4. If working: proceed to remaining stories

### Incremental Delivery

1. Phase 1 → Foundation ready (all handlers wired)
2. Phase 2 (US1) → Core playback works (MVP!)
3. Phase 3 (US2) → Provider switching works
4. Phase 4 (US3) → Language detection works
5. Phase 5 (US4) → Footer fully functional
6. Phase 6 (US5) → Caching correct
7. Phase 7 → Error handling + validation

### Task Counts

| Phase | Tasks | Parallel Tasks |
|-------|-------|---------------|
| 1: Foundational | 8 | 3 |
| 2: US1 Playback | 5 | 1 |
| 3: US2 Provider | 7 | 1 |
| 4: US3 Language | 3 | 1 |
| 5: US4 Footer | 3 | 1 |
| 6: US5 Caching | 6 | 2 |
| 7: Polish | 7 | 1 |
| **Total** | **39** | **10** |

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after its phase completes
- Commit after each phase (atomic commits per phase)
- Build + test after every phase to catch regressions early
- All fixes are surgical — no new abstractions, no new dependencies
