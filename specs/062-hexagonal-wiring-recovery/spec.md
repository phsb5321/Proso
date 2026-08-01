# Feature Specification: Hexagonal Wiring Recovery

**Feature Branch**: `062-hexagonal-wiring-recovery`
**Created**: 2026-02-08
**Status**: Draft
**Input**: User description: "Every single thing is broken — language selection, highlight improvements, nothing is working properly. Conduct extensive exploratory research and set up a recovery plan."

## Root Cause Summary

The hexagonal architecture migration (features 034-061) wired up handler *registration* but **never wired dependency injection** for 5 of 6 required `set*()` calls. Additionally, critical message format mismatches exist between adapters and the content script, the Browser TTS adapter has a fundamental timing flaw, and the popup sends wrong message types for user actions. Together, these 18+ bugs render the extension non-functional at runtime despite passing builds and 2,393 unit tests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Basic Page Read-Aloud (Priority: P1)

User clicks "Read" in the popup. The extension extracts page content, generates TTS audio via the selected provider, plays it back, highlights the current paragraph, and shows a sticky footer with playback controls.

**Why this priority**: This is the core functionality. Without working playback + highlighting, the extension has zero value.

**Independent Test**: Navigate to any article page, click "Read" in popup, hear audio, see paragraph highlighting, see footer player. Provider defaults to Browser TTS.

**Acceptance Scenarios**:

1. **Given** a webpage with article content and Browser TTS provider selected, **When** user clicks "Read" in popup, **Then** audio plays without silent gaps, current paragraph is highlighted, footer shows with progress
2. **Given** playback is active, **When** user clicks pause/resume in footer, **Then** playback pauses and resumes correctly
3. **Given** playback is active, **When** paragraph transitions, **Then** previous highlight is removed and new paragraph is highlighted with scroll-into-view
4. **Given** playback is active with ElevenLabs provider, **When** words are spoken, **Then** word-level highlighting follows audio timing

---

### User Story 2 - Provider Switching (Priority: P1)

User changes TTS provider in popup (e.g., from Browser TTS to ElevenLabs). The audio generator reconfigures and subsequent playback uses the new provider.

**Why this priority**: Provider switching is essential — users must configure their preferred provider.

**Independent Test**: Open popup, change provider dropdown from "Browser" to "ElevenLabs", start playback, verify ElevenLabs API is called.

**Acceptance Scenarios**:

1. **Given** user selects a different provider in popup, **When** the selection message reaches background, **Then** the container's audio generator is replaced AND the PlaybackService uses the new generator
2. **Given** user changes speed in popup, **When** the message reaches background, **Then** the active playback speed changes immediately
3. **Given** user changes provider during active playback, **When** next paragraph starts, **Then** it uses the new provider

---

### User Story 3 - Language Detection (Priority: P2)

When a page loads, the content script detects the page language (HTML lang attribute, meta tags, franc-min text analysis). The detected language is used to select appropriate TTS voices and validate provider compatibility.

**Why this priority**: Multilingual support was a flagship feature (019) that is now completely disconnected.

**Independent Test**: Navigate to a Spanish-language page, verify "ES" badge in popup, verify Browser TTS uses Spanish voice.

**Acceptance Scenarios**:

1. **Given** a page with `<html lang="es">`, **When** page loads, **Then** language detection reports "es" to background, popup shows "ES" badge
2. **Given** detected language is "fr" and Groq provider is selected, **When** user starts playback, **Then** system warns that Groq only supports English
3. **Given** user sets language override to "de", **When** playback starts, **Then** German voices are used regardless of page detection

---

### User Story 4 - Footer Playback Controls (Priority: P2)

The sticky footer shows at page bottom during playback with play/pause, prev/next, progress, and speed controls. It receives real-time state updates from the background.

**Why this priority**: The footer is the primary in-page UI. Without it, users have no way to control playback without re-opening the popup.

**Independent Test**: Start playback, verify footer appears with correct progress info (currentTime, totalTime, paragraph count), use controls.

**Acceptance Scenarios**:

1. **Given** playback starts, **When** footer receives FOOTER_STATE_UPDATE, **Then** it displays currentTime, totalTime, progress percentage, paragraph X/Y
2. **Given** user clicks next/prev in footer, **When** footer sends action to background, **Then** playback jumps to correct paragraph
3. **Given** playback stops, **When** FOOTER_HIDE is sent, **Then** footer disappears and body padding is removed

---

### User Story 5 - Cached Audio Playback (Priority: P3)

Previously generated TTS audio is cached in IndexedDB. On replay, cached audio plays instantly without API calls, showing cache indicators on paragraphs.

**Why this priority**: Caching reduces API costs. Currently broken because Browser TTS caches 0-byte blobs and `playedDirectly` flag is lost on cache hits.

**Independent Test**: Play a page, stop, replay — second playback should be instant with no API calls (visible in network tab).

**Acceptance Scenarios**:

1. **Given** a paragraph was previously played with ElevenLabs, **When** replaying, **Then** cached audio blob is retrieved and played without API call
2. **Given** a paragraph was played with Browser TTS, **When** audio cache is checked, **Then** no 0-byte blobs exist in cache
3. **Given** Browser TTS generated audio, **When** replaying, **Then** `playedDirectly` flag is honored and Browser TTS speaks again (not blob playback)

---

### Edge Cases

- What happens when `init-hexagonal.ts` fails mid-initialization? (Legacy handlers should still work)
- What happens when content script receives a highlight message with missing fields? (Should log warning, not crash)
- What happens when `reconfigureAudioGenerator()` is called during active playback? (Should finish current paragraph, use new generator for next)
- What happens when `sender.tab.id` is undefined in message handlers? (Should not crash; gracefully default)
- What happens when Browser TTS speech completes synchronously (very short text)? (Timer should not run for already-finished speech)

## Requirements *(mandatory)*

### Functional Requirements

#### Phase 1: Dependency Injection Wiring (Critical)

- **FR-001**: `init-hexagonal.ts` MUST call `setHighlightSync(container.adapters.highlightSync)` so that footer handlers can send messages to content script
- **FR-002**: `init-hexagonal.ts` MUST call `setLanguageDependencies(...)` to wire franc-min language detector into language handlers
- **FR-003**: `init-hexagonal.ts` MUST call `setHighlightRepository(...)` to enable highlight CRUD operations
- **FR-004**: `init-hexagonal.ts` MUST call `setExportDependencies(...)` to enable audio export feature
- **FR-005**: `init-hexagonal.ts` MUST call `setLoggingDependencies(...)` to enable remote logging
- **FR-006**: `init-hexagonal.ts` MUST call `setActiveTabId(tabId)` when the active tab changes, so footer handlers know which tab to target

#### Phase 2: Message Format Alignment

- **FR-007**: `HighlightSyncAdapter.highlightParagraph()` MUST send `{ type: 'highlight', index, text, timestamp, scroll }` matching content.ts expectations (currently sends `paragraphIndex` instead of `index`, omits `text` and `timestamp`)
- **FR-008**: `HighlightSyncAdapter.updateFooterState()` MUST send `{ currentTime, totalTime }` matching content.ts expectations (currently sends `currentText` instead of `currentTime`, omits `totalTime`)
- **FR-009**: Content script language detection message (`action: 'languageDetected'`) MUST have a corresponding handler registered in the hexagonal architecture

#### Phase 3: Stale Reference Fix

- **FR-010**: `reconfigureAudioGenerator()` MUST update the PlaybackService's audio generator reference, not just the container's adapter object (currently PlaybackService holds stale `deps` reference captured at construction time)
- **FR-011**: `PlaybackService.subscribeToSettings()` MUST be called during initialization so settings changes propagate to the service
- **FR-012**: `initialPlaybackState.provider` MUST match the container's configured provider (currently hardcoded to `'elevenlabs'` while container defaults to `'browser'`)

#### Phase 4: Browser TTS Timing Fix

- **FR-013**: Browser TTS adapter MUST NOT block `generateAudio()` until speech completes. Instead, it should return immediately with a mechanism for PlaybackService to track progress
- **FR-014**: Browser TTS adapter MUST NOT cache 0-byte audio blobs. Either generate real audio data or mark as uncacheable
- **FR-015**: On cache hit, PlaybackService MUST check if original provider was Browser TTS and re-invoke `playedDirectly` path instead of blob playback

#### Phase 5: Popup Message Routing

- **FR-016**: Popup MUST send `provider.select` message (not `settings.update`) when user changes provider, so the container reconfigures the audio generator
- **FR-017**: Popup MUST send `playback.setSpeed` message (not `settings.update`) when user changes playback speed, so the active playback adjusts immediately
- **FR-018**: Popup MUST check the response from `playback.start` and display an error state if playback fails (currently ignores response, shows "Loading" forever)

#### Phase 6: Error Propagation

- **FR-019**: `dispatchToHexagonal()` MUST NOT convert handler `Err` results to `null` silently. It should return a structured error response so callers can distinguish "handler not found" from "handler failed"
- **FR-020**: Handler registry dispatch MUST forward `sender.tab.id` to handlers that need per-tab state (language handlers, footer handlers)

### Key Entities

- **Container**: Composition root holding adapters (audioGenerator, highlightSync, cacheStore, settingsStore, etc.) and services (PlaybackService, ContentExtractionService)
- **PlaybackService**: Core service orchestrating TTS generation, caching, highlight sync, and progress tracking. Holds `readonly deps` object captured at construction
- **HandlerRegistry**: Maps message types (e.g., `'playback.start'`, `'footer.show'`) to handler functions. 86 handlers across 15 files
- **HighlightSyncAdapter**: Sends highlight/footer messages from background to content script via `browser.tabs.sendMessage()`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 6 `set*()` dependency injection functions are called during `initHexagonalArchitecture()` (verified by unit test asserting no `null` dependencies)
- **SC-002**: Browser TTS playback produces audible speech with no silent gaps between paragraphs (manual test: play 3+ paragraph article)
- **SC-003**: Highlight adapter message fields match content script expectations (verified by contract test comparing sent vs expected fields)
- **SC-004**: Provider switching from popup changes the audio generator used for next paragraph (verified by integration test)
- **SC-005**: Language detection from content script reaches language handlers and populates `tabLanguageStates` map (verified by integration test)
- **SC-006**: Footer receives `currentTime`, `totalTime`, and `progress` during playback (verified by message intercept test)
- **SC-007**: `dispatchToHexagonal()` returns distinguishable "not found" vs "handler error" responses (verified by unit test)
- **SC-008**: 0 regression in existing 2,393 unit tests
- **SC-009**: Build size stays under 1MB (currently 899 KB)
- **SC-010**: 0 circular dependencies, duplication < 2%
