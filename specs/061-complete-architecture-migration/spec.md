# Feature Specification: Complete Architecture Migration

**Feature Branch**: `061-complete-architecture-migration`
**Created**: 2026-02-08
**Status**: Draft
**Input**: User description: "I need you to work on a massive migration in order to move everything from legacy into the new improved architecture. We need to fix literally everything and make the project clean with a smaller footprint and better to work on."

## Background & Problem Statement

VoxPage underwent an ambitious hexagonal architecture migration (features 034-057) that replaced a working JavaScript codebase with a TypeScript hexagonal architecture. The migration introduced proper ports, adapters, a composition container, and 16 handler registries. However, the migration was **incomplete**: the old code was deleted before the new integrations were fully wired. The result is a codebase that is architecturally sound in isolation but functionally broken end-to-end.

### Current State (Audit Findings)

**What works**: Text extraction, settings storage, IndexedDB cache infrastructure, handler dispatch mechanism, build system, 2,487 passing tests.

**What is broken**:
- **Core playback chain**: Popup sends messages the background recognizes, but audio generation produces "Invalid URI" errors because blob URLs from TTS providers are not correctly propagated to playback
- **Popup-to-handler disconnect**: The popup used legacy camelCase message names while handlers use dotted convention (partially fixed in 060 branch but not merged)
- **Footer/highlight sync**: Background generates audio independently, never communicates playback events back to the content script's sticky footer or highlight manager
- **Export feature**: Handler exists but dependencies are never injected at runtime
- **Reading queue**: Not migrated to hexagonal architecture, uses legacy handlers that were deleted
- **Summarization**: AI provider intentionally removed in 056 but UI still references it
- **Language detection**: Handlers exist but playback service hardcodes language to null
- **Provider selection**: Only Browser TTS and ElevenLabs remain after 056 consolidation

**Dead code**: 57 spec directories exist but most represent planning artifacts for work that was squash-merged. Stale specs, migration status documents, and unused legacy test fixtures add bloat.

### Migration Strategy

Based on the Strangler Fig Pattern and hexagonal architecture best practices, this migration follows these principles:

1. **Fix working paths first** - Restore the critical playback chain before expanding features
2. **Wire, don't rewrite** - The hexagonal infrastructure is sound; the problem is disconnected wiring, not bad abstractions
3. **Delete aggressively** - Remove dead code, stale specs, unused handlers, and unreachable features
4. **Verify with real usage** - Each fix must be manually testable in the browser, not just passing unit tests

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play a Web Page Aloud (Priority: P1)

A user navigates to any web page, clicks the VoxPage popup, and presses Play. The extension extracts the page content, generates speech audio using their configured TTS provider, and plays it audibly. The user hears the audio and can pause, resume, and skip through paragraphs using the popup controls.

**Why this priority**: This is the core value proposition of VoxPage. Without working playback, the extension has zero utility.

**Independent Test**: Open any article page in Firefox, click the VoxPage icon, press Play. Audio should be audible within 5 seconds. Pressing Pause should stop audio. Pressing Next should advance to the next paragraph.

**Acceptance Scenarios**:

1. **Given** a user is on a web page with text content, **When** they click Play in the popup, **Then** they hear the page content spoken aloud within 5 seconds
2. **Given** playback is active, **When** the user clicks Pause, **Then** audio stops immediately and the button shows a Play icon
3. **Given** playback is paused, **When** the user clicks Play, **Then** audio resumes from where it left off
4. **Given** playback is active, **When** the user clicks Next, **Then** the next paragraph begins playing
5. **Given** playback is active, **When** the user clicks Previous, **Then** the previous paragraph begins playing
6. **Given** playback is active, **When** the user clicks Stop, **Then** all playback ceases and state resets to idle

---

### User Story 2 - See Visual Feedback During Playback (Priority: P1)

While audio is playing, the user sees the current paragraph highlighted on the page. A sticky footer appears at the bottom of the page showing playback controls. The popup also reflects the current playback state.

**Why this priority**: Without visual feedback, the user has no way to know what's being read or control playback from the page itself.

**Independent Test**: Start playback on a multi-paragraph article. Verify the current paragraph is visually highlighted. Verify the sticky footer appears with working controls. Verify the popup shows correct status.

**Acceptance Scenarios**:

1. **Given** playback starts, **When** the first paragraph begins, **Then** it is visually highlighted on the page
2. **Given** playback advances to the next paragraph, **When** it starts, **Then** the highlight moves to that paragraph and the previous highlight is removed
3. **Given** playback is active, **When** the user looks at the page, **Then** a sticky footer is visible with play/pause, skip, and progress controls
4. **Given** playback is active, **When** the user opens the popup, **Then** it shows "Playing" status with the current paragraph number and total paragraphs

---

### User Story 3 - Configure TTS Provider and Speed (Priority: P2)

The user can select their TTS provider (Browser TTS for free, ElevenLabs for premium quality) and adjust playback speed from the popup. Changes take effect on the next paragraph.

**Why this priority**: Configuration is essential for a usable product but can be tested after core playback works.

**Independent Test**: Open settings, switch provider from Browser to ElevenLabs (with API key), verify the voice changes. Adjust speed slider, verify playback speed changes.

**Acceptance Scenarios**:

1. **Given** a user selects ElevenLabs as provider with a valid API key, **When** they start playback, **Then** audio is generated by ElevenLabs
2. **Given** a user adjusts speed to 1.5x, **When** the next paragraph plays, **Then** audio plays at 1.5x speed
3. **Given** no API key is configured for ElevenLabs, **When** the user selects it, **Then** they are prompted to enter an API key in settings

---

### User Story 4 - Cached Audio Playback (Priority: P2)

Previously played paragraphs are cached. When the user revisits a page and plays it again, cached audio loads instantly without re-calling the TTS API, saving time and cost.

**Why this priority**: The cache infrastructure exists and works; it just needs to be wired into the playback chain.

**Independent Test**: Play a page. Stop. Play the same page again. Verify the second playback starts faster.

**Acceptance Scenarios**:

1. **Given** a paragraph was previously played and cached, **When** the user replays it, **Then** cached audio loads in under 1 second without network requests
2. **Given** cache is full, **When** new audio is generated, **Then** the oldest entries are evicted per LRU policy
3. **Given** the user opens the options page, **When** they view cache stats, **Then** they see accurate entry count, size, and hit rate

---

### User Story 5 - Clean, Minimal Codebase (Priority: P3)

Developers working on VoxPage find a clean codebase with no dead code, no stale spec directories, no unreachable features, and clear documentation. Every handler that exists is actually wired and functional.

**Why this priority**: Developer experience determines long-term maintainability. This is addressed last but is essential for the project's health.

**Independent Test**: Run `pnpm run quality` with zero issues. Run `pnpm test` with all tests passing. No console warnings about unknown message types during normal operation.

**Acceptance Scenarios**:

1. **Given** a developer runs the test suite, **When** all tests complete, **Then** there are zero failures and zero skipped tests (excluding intentional platform skips)
2. **Given** a developer inspects the handlers directory, **When** they look at any handler, **Then** it is wired, callable, and has at least one integration path
3. **Given** a developer lists spec directories, **When** they check the contents, **Then** only specs relevant to current functionality exist
4. **Given** a developer starts the extension in dev mode, **When** they use all features, **Then** no "Unknown message type" warnings appear in the console

---

### Edge Cases

- What happens when the user clicks Play on a page with no extractable text content (e.g., an image gallery)? System should show a clear "No readable content found" message.
- How does the system handle TTS API failures mid-playback (e.g., network drops after paragraph 3 of 10)? Playback should pause with an error notification and allow retry.
- What happens when the user navigates away from the page while playback is active? Playback should stop and the footer should be removed.
- How does the system behave when the background event page is suspended and reloaded by Firefox? State should be recoverable from storage.
- What happens when the user clicks Play before a previous playback session has fully stopped? The previous session should be force-stopped before starting the new one.

## Requirements *(mandatory)*

### Functional Requirements

**Core Playback Chain (P1)**

- **FR-001**: System MUST extract readable text from the current web page when the user initiates playback
- **FR-002**: System MUST generate speech audio from extracted text using the configured TTS provider
- **FR-003**: System MUST play generated audio audibly to the user
- **FR-004**: System MUST support pause, resume, stop, next paragraph, and previous paragraph controls
- **FR-005**: System MUST update the popup UI to reflect current playback state (idle, loading, playing, paused)
- **FR-006**: All popup controls MUST send correctly-named messages that the background handlers recognize and process

**Visual Feedback (P1)**

- **FR-007**: System MUST highlight the currently-playing paragraph on the web page
- **FR-008**: System MUST show a sticky footer on the web page during active playback with playback controls
- **FR-009**: System MUST synchronize the footer's progress bar and state with actual audio playback progress
- **FR-010**: System MUST hide the sticky footer when playback is stopped

**Provider & Settings (P2)**

- **FR-011**: System MUST support Browser TTS (free, no key required) and ElevenLabs (API key required) as TTS providers
- **FR-012**: System MUST persist user settings (provider, speed, API keys) across browser sessions
- **FR-013**: System MUST validate API keys before accepting them
- **FR-014**: Speed changes MUST take effect on the next paragraph played

**Cache Integration (P2)**

- **FR-015**: System MUST cache generated audio keyed by page content, provider, and voice
- **FR-016**: System MUST serve cached audio when available instead of calling the TTS API
- **FR-017**: System MUST display cache statistics (size, entries, hit rate) on the options page

**Codebase Cleanup (P3)**

- **FR-018**: All dead or unreachable handlers MUST be removed
- **FR-019**: All popup message names MUST match their corresponding background handler names exactly
- **FR-020**: Stale spec directories for features that were never independently delivered MUST be archived or removed
- **FR-021**: Features that were intentionally removed (summarization AI, Groq, OpenAI, Cartesia providers) MUST have their UI elements fully removed, not just hidden
- **FR-022**: The telemetry tracker MUST NOT produce console warnings when called before initialization

### Key Entities

- **Playback Session**: Represents an active reading session including the page URL, extracted paragraphs, current paragraph index, playback status, and audio state
- **TTS Provider**: An audio generation service (Browser TTS or ElevenLabs) that converts text to speech audio
- **Audio Cache Entry**: A cached audio blob keyed by content hash, provider, and voice, stored persistently with LRU eviction
- **Message Handler**: A registered function in the background that processes a named message type from the popup or content script

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can play any text-heavy web page aloud within 5 seconds of clicking Play, end-to-end, with no console errors
- **SC-002**: All 6 playback controls (play, pause, resume, stop, next, previous) function correctly from both the popup and the sticky footer
- **SC-003**: The current paragraph is visually highlighted during playback and the highlight advances as paragraphs change
- **SC-004**: Zero "Unknown message type" warnings appear in the browser console during normal operation
- **SC-005**: Previously played pages replay from cache in under 1 second
- **SC-006**: All tests pass with zero failures and zero unintentional skips
- **SC-007**: Codebase has zero circular dependencies and less than 2% code duplication
- **SC-008**: Total source code size (excluding tests and specs) is reduced by at least 15% compared to pre-migration state
- **SC-009**: A new developer can run `pnpm run dev`, load the extension, and successfully play a page within 10 minutes of cloning the repo

## Assumptions

- Firefox MV2 background pages have full DOM access (including Audio element), unlike Chrome MV3 service workers. Audio playback from the background page is viable.
- Browser TTS via the Web Speech API is the default free provider and must work without any API keys.
- ElevenLabs is the only premium provider remaining after the 056 consolidation. Other providers are out of scope.
- The hexagonal architecture (ports, adapters, composition container, handler registry) is structurally sound and should be preserved. The problem is incomplete wiring, not bad design.
- Stale spec directories can be archived rather than permanently deleted, preserving history without polluting the active workspace.
