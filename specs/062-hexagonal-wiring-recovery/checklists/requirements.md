# Requirements Checklist: 062-hexagonal-wiring-recovery

## Phase 1: Dependency Injection Wiring (Critical)

- [ ] **FR-001** — Call `setHighlightSync(container.adapters.highlightSync)` in `init-hexagonal.ts`
  - File: `src/background/init-hexagonal.ts` (after line 87)
  - Verify: `footer.show`/`footer.hide` messages reach content script
- [ ] **FR-002** — Call `setLanguageDependencies(...)` in `init-hexagonal.ts`
  - File: `src/background/init-hexagonal.ts`
  - Deps: franc-min detector, language mappings
  - Verify: `language.detect` handler returns actual detected language (not hardcoded 'en')
- [ ] **FR-003** — Call `setHighlightRepository(...)` in `init-hexagonal.ts`
  - File: `src/background/init-hexagonal.ts`
  - Verify: `highlight.create`/`highlight.list` handlers don't throw
- [ ] **FR-004** — Call `setExportDependencies(...)` in `init-hexagonal.ts`
  - File: `src/background/init-hexagonal.ts`
  - Verify: `export.start` handler doesn't throw
- [ ] **FR-005** — Call `setLoggingDependencies(...)` in `init-hexagonal.ts`
  - File: `src/background/init-hexagonal.ts`
  - Verify: `logging.send` handler doesn't throw
- [ ] **FR-006** — Wire `setActiveTabId()` on tab activation events
  - File: `src/background/init-hexagonal.ts` or `src/entrypoints/background.ts`
  - Listen: `browser.tabs.onActivated` → `setActiveTabId(tabId)`
  - Verify: Footer handlers target the correct tab

## Phase 2: Message Format Alignment

- [ ] **FR-007** — Fix `highlightParagraph()` message fields
  - File: `src/adapters/messaging/highlight-sync.adapter.ts` lines 49-53
  - Change: `paragraphIndex` → `index`, add `text` and `timestamp` fields
  - Verify: Content script `case 'highlight'` receives `msg.index`, `msg.text`, `msg.timestamp`
- [ ] **FR-008** — Fix `updateFooterState()` message fields
  - File: `src/adapters/messaging/highlight-sync.adapter.ts` lines 115-127
  - Change: `currentText` → `currentTime`, add `totalTime` field
  - Verify: Content script `case 'FOOTER_STATE_UPDATE'` receives `msg.currentTime`, `msg.totalTime`
- [ ] **FR-009** — Register handler for content script `languageDetected` action
  - File: `src/entrypoints/content.ts` sends `{ action: 'languageDetected', ... }`
  - Either: Add handler in language.handlers.ts, or bridge in background.ts message listener
  - Verify: Language state is populated for the tab

## Phase 3: Stale Reference Fix

- [ ] **FR-010** — Fix `reconfigureAudioGenerator()` stale reference
  - File: `src/composition/container.ts` lines 199-221
  - Problem: Spread creates new container object, but PlaybackService holds old `deps` ref
  - Fix: Either (a) add `PlaybackService.setAudioGenerator()` method, or (b) make deps reactive
  - Verify: After provider switch, `PlaybackService` uses new audio generator
- [ ] **FR-011** — Call `PlaybackService.subscribeToSettings()` during init
  - File: `src/background/init-hexagonal.ts` or `src/composition/container.ts`
  - Verify: Settings changes from storage trigger PlaybackService updates
- [ ] **FR-012** — Fix `initialPlaybackState.provider` default
  - File: `src/core/playback/playback-service.ts` (search for `'elevenlabs'` default)
  - Change: Use container config provider or 'browser' as default
  - Verify: Initial state matches actual configured provider

## Phase 4: Browser TTS Timing Fix

- [ ] **FR-013** — Fix Browser TTS blocking `generateAudio()`
  - File: `src/adapters/audio/browser-tts-audio.adapter.ts`
  - Problem: `await`s speech completion, then `trackDirectPlayback()` starts for already-finished speech
  - Fix: Return immediately with `playedDirectly: true`, let caller track via `onend` callback or event
  - Verify: No silent gaps between paragraphs with Browser TTS
- [ ] **FR-014** — Prevent 0-byte blob caching for Browser TTS
  - File: `src/core/playback/playback-service.ts` (cache set logic)
  - Fix: Skip cache for `playedDirectly` results or check blob size > 0
  - Verify: No 0-byte entries in IndexedDB audio cache
- [ ] **FR-015** — Handle cache hits for `playedDirectly` providers
  - File: `src/core/playback/playback-service.ts` (cache hit logic)
  - Problem: On cache hit, `playedDirectly` flag is lost → falls into blob playback → 0-byte blob fails
  - Fix: Store provider type in cache metadata, re-invoke direct playback for Browser TTS
  - Verify: Replaying Browser TTS paragraph produces audio

## Phase 5: Popup Message Routing

- [ ] **FR-016** — Send `provider.select` instead of `settings.update` for provider change
  - File: `src/entrypoints/popup/main.ts` (provider dropdown handler)
  - Verify: Background receives `provider.select`, calls `reconfigureAudioGenerator()`
- [ ] **FR-017** — Send `playback.setSpeed` instead of `settings.update` for speed change
  - File: `src/entrypoints/popup/main.ts` (speed control handler)
  - Verify: Active playback speed changes immediately
- [ ] **FR-018** — Check `playback.start` response in popup
  - File: `src/entrypoints/popup/main.ts` (play button handler)
  - Fix: Inspect response, show error state if failed (not stuck "Loading")
  - Verify: Failed playback shows error message in popup

## Phase 6: Error Propagation

- [ ] **FR-019** — Return structured errors from `dispatchToHexagonal()`
  - File: `src/background/init-hexagonal.ts` lines 183-244
  - Problem: Handler `Err` results converted to `null` → indistinguishable from "not found"
  - Fix: Return `{ error: string, code: string }` for handler failures, `null` only for "not found"
  - Verify: Unit test distinguishes "not found" vs "handler error"
- [ ] **FR-020** — Forward `sender.tab.id` to handlers
  - File: `src/entrypoints/background.ts` message listener → `dispatchToHexagonal()`
  - Fix: Pass `tabId` as part of handler data or separate parameter
  - Verify: Language handlers receive tab ID for per-tab state

## Validation

- [ ] **SC-008** — All 2,393 existing unit tests still pass
- [ ] **SC-009** — Build size < 1MB
- [ ] **SC-010** — 0 circular dependencies, duplication < 2%
- [ ] **Manual** — Browser TTS plays 3+ paragraph article without silent gaps
- [ ] **Manual** — Provider switch in popup changes audio for next paragraph
- [ ] **Manual** — Footer shows currentTime/totalTime during playback
- [ ] **Manual** — Language badge in popup reflects page language
