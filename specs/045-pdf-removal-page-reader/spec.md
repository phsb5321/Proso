# Feature Specification: PDF Removal + Web Page Reading Pivot

**Feature Branch**: `045-pdf-removal-page-reader`
**Created**: 2026-01-13
**Status**: Draft
**Input**: Remove PDF feature from VoxPage extension and pivot to web page reading with highlights and ElevenLabs TTS

## Context

The PDF reading functionality has been outsourced to a standalone Tauri desktop application (tauri-pdf-reader). This feature removes all PDF-related code from the VoxPage browser extension and refocuses it on its core mission: reading web pages with text-to-speech and durable highlights.

### Non-Goals (Explicit Exclusions)

- PDF reading in the extension (handled by Tauri app)
- Cloud sync for highlights (future enhancement)
- Native TTS providers (ElevenLabs only)
- Legacy provider support (OpenAI, Groq, Cartesia, Browser TTS removed)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read Article with TTS (Priority: P1)

A user navigates to a blog post or news article and wants to listen to it while doing other tasks. They click the VoxPage toolbar icon, which extracts the article content and begins reading it aloud using ElevenLabs TTS with streaming audio playback.

**Why this priority**: This is the core value proposition of VoxPage. Without article reading and TTS, the extension has no purpose. This must work flawlessly before any other feature.

**Independent Test**: Can be fully tested by navigating to any article page, clicking the extension icon, and verifying audio playback begins with readable text displayed. Delivers immediate value: hands-free article consumption.

**Acceptance Scenarios**:

1. **Given** a user is on an article page (e.g., Medium, news site), **When** they click the VoxPage icon and press "Read", **Then** the extension extracts article text using Readability and begins streaming TTS audio within 2 seconds.

2. **Given** playback is active, **When** the user clicks pause, **Then** audio pauses immediately and can be resumed from the same position.

3. **Given** an article has multiple paragraphs, **When** playback progresses, **Then** the current paragraph is visually highlighted in the reader view.

4. **Given** the user is on Chrome with MV3, **When** TTS playback is initiated, **Then** an offscreen document handles audio playback without visible UI.

---

### User Story 2 - Create and Persist Highlights (Priority: P2)

A user wants to highlight important passages while reading an article. They select text and create a highlight, which persists even after page reload or browser restart. When they return to the same URL, their highlights are automatically restored.

**Why this priority**: Highlights add significant value beyond TTS but depend on the reading functionality being in place. This is the second core feature that differentiates VoxPage from simple TTS extensions.

**Independent Test**: Can be tested by selecting text on any page, creating a highlight, reloading the page, and verifying the highlight reappears in the correct location.

**Acceptance Scenarios**:

1. **Given** a user is reading an article, **When** they select text and click "Highlight", **Then** a persistent highlight is created with a visual indicator and stored in IndexedDB.

2. **Given** a page has saved highlights, **When** the user returns to the same URL, **Then** highlights are re-anchored using text quote matching (prefix + exact + suffix) within 500ms.

3. **Given** the page DOM has changed slightly since the highlight was created, **When** re-anchoring is attempted, **Then** the system uses fuzzy matching with surrounding context to find the correct location.

4. **Given** a highlight cannot be re-anchored (text deleted), **When** the page loads, **Then** the highlight is marked as "orphaned" and the user is notified.

---

### User Story 3 - Cross-Browser Compatibility (Priority: P3)

A user switches between Chrome and Firefox and expects the same VoxPage experience in both browsers. The extension uses MV3-first architecture with shims for Firefox differences.

**Why this priority**: Multi-browser support expands the addressable user base but is not required for core functionality. Chrome MV3 is the primary target.

**Independent Test**: Can be tested by installing the extension in both browsers and verifying identical functionality for article reading, TTS, and highlights.

**Acceptance Scenarios**:

1. **Given** the extension is installed in Chrome (MV3), **When** audio playback is requested, **Then** an offscreen document with audioPlayback reason handles the Audio API.

2. **Given** the extension is installed in Firefox (MV2 or MV3), **When** audio playback is requested, **Then** the background script directly uses Audio API (no offscreen document needed).

3. **Given** the user has not granted host permissions, **When** they click "Read" on a new domain, **Then** the extension prompts for permission via `permissions.request()`.

---

### User Story 4 - Minimal Settings Configuration (Priority: P4)

A user needs to configure their ElevenLabs API key and select a preferred voice. The options page provides a clean interface for essential settings only.

**Why this priority**: Configuration is required for the extension to function but is a one-time setup task, not part of daily use.

**Independent Test**: Can be tested by opening the options page, entering an API key, selecting a voice, and verifying TTS works with the selected settings.

**Acceptance Scenarios**:

1. **Given** a new user installs the extension, **When** they open the options page, **Then** they see a clear prompt to enter their ElevenLabs API key.

2. **Given** a valid API key is saved, **When** the user opens voice selection, **Then** available ElevenLabs voices are fetched and displayed.

3. **Given** the user selects a voice and speed setting, **When** they trigger TTS playback, **Then** audio uses the configured voice and speed.

---

### Edge Cases

- What happens when Readability fails to extract content? → Fall back to visible text extraction from `<body>`, show warning to user.
- What happens when ElevenLabs API rate limits are hit? → Display user-friendly error with retry option, implement exponential backoff.
- What happens when highlight text spans multiple DOM elements? → Store ranges as W3C Web Annotation format with text quote selectors.
- What happens on pages with heavy JavaScript that modifies DOM? → Use MutationObserver to detect changes and re-anchor highlights.
- How does system handle pages with no readable content (e.g., image galleries)? → Show "No readable content found" message, offer selection-based TTS.
- What happens when the offscreen document is unloaded by Chrome? → Re-create on demand, preserve playback state in background script.

## Requirements *(mandatory)*

### Functional Requirements

#### PDF Removal (Phase A)

- **FR-001**: System MUST remove all PDF-related code from the extension, including `pdfjs-dist`, `tesseract-wasm`, and associated handlers.
- **FR-002**: System MUST remove PDF-related message handlers from background and content scripts.
- **FR-003**: System MUST update the manifest to remove PDF-specific permissions (`file://` access if present).
- **FR-004**: System MUST ensure extension bundle size decreases by at least 2MB after PDF removal.

#### Article Extraction (Phase B)

- **FR-005**: System MUST extract article content using Mozilla Readability as the primary extraction method.
- **FR-006**: System MUST provide a fallback extraction using visible text when Readability fails.
- **FR-007**: System MUST support extraction on any HTTP/HTTPS page where the user has granted permissions.
- **FR-008**: System MUST use `scripting.executeScript()` for MV3-compliant content script injection.

#### Highlight Persistence (Phase C)

- **FR-009**: System MUST store highlights in IndexedDB using W3C Web Annotation Data Model format.
- **FR-010**: Highlight anchors MUST use TextQuoteSelector (prefix + exact + suffix) for robust re-anchoring.
- **FR-011**: System MUST re-anchor highlights within 500ms of page load.
- **FR-012**: System MUST support fuzzy matching when exact text match fails (80% similarity threshold).
- **FR-013**: System MUST mark orphaned highlights (text deleted from page) and notify the user.
- **FR-014**: Users MUST be able to delete individual highlights or clear all highlights for a page.

#### ElevenLabs TTS (Phase D)

- **FR-015**: System MUST integrate ElevenLabs HTTP streaming API for text-to-speech.
- **FR-016**: System MUST chunk text into paragraphs for streaming playback with progress indication.
- **FR-017**: System MUST cache generated audio in IndexedDB for offline replay and cost reduction.
- **FR-018**: System MUST support playback controls: play, pause, skip paragraph, seek within paragraph.
- **FR-019**: For Chrome MV3, system MUST use an offscreen document with `audioPlayback` reason for Audio API access.
- **FR-020**: System MUST validate API key on settings save and show clear error for invalid keys.

#### Cross-Browser Support (Phase E)

- **FR-021**: System MUST target Manifest V3 as the primary build, with MV2 fallback for Firefox if needed.
- **FR-022**: System MUST use `permissions.request()` to obtain host permissions on-demand (not `<all_urls>`).
- **FR-023**: System MUST abstract browser-specific APIs behind adapters (OffscreenAudioAdapter for Chrome, DirectAudioAdapter for Firefox).
- **FR-024**: System MUST work in service worker context (no DOM access in background).

### Key Entities

- **Article**: Extracted content from a web page (url, title, text, paragraphs[], extractedAt, readabilityMetadata).
- **Highlight**: User-created annotation on a page (id, url, anchor: TextQuoteSelector, color, note?, createdAt, orphaned: boolean).
- **TextQuoteSelector**: W3C annotation selector (prefix: string, exact: string, suffix: string).
- **AudioChunk**: Cached TTS audio segment (url, paragraphIndex, audioBlob, provider, voice, createdAt).
- **PlaybackState**: Current reading state (url, currentParagraph, isPlaying, position, speed).
- **UserSettings**: Configuration (elevenLabsApiKey, voiceId, speed, highlightColor).

### Architecture Requirements

- **AR-001**: System MUST use ports/adapters (hexagonal) architecture with clear boundaries:
  - `ReaderPort`: Article extraction interface
  - `HighlightRepositoryPort`: Highlight storage interface
  - `TtsPort`: Text-to-speech generation interface
  - `AudioPlayerPort`: Audio playback interface
- **AR-002**: All business logic MUST be isolated in core domain services, independent of browser APIs.
- **AR-003**: System MUST use TypeScript strict mode throughout.
- **AR-004**: System MUST maintain zero circular dependencies (enforced by `pnpm run deps:check`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Extension bundle size MUST be at least 2MB smaller after PDF code removal.
- **SC-002**: Article extraction MUST complete within 500ms for 95% of news/blog pages.
- **SC-003**: TTS audio playback MUST begin within 2 seconds of clicking "Read" (streaming).
- **SC-004**: Highlight re-anchoring MUST succeed for 95% of highlights when page content is unchanged.
- **SC-005**: Extension MUST pass `web-ext lint` for both Chrome and Firefox builds.
- **SC-006**: All existing tests MUST pass (adapting for removed PDF functionality).
- **SC-007**: No new circular dependencies MUST be introduced (`pnpm run deps:check` passes).
- **SC-008**: Memory usage MUST not exceed 100MB during active TTS playback.
- **SC-009**: Offscreen document (Chrome) MUST be properly cleaned up when not needed (no resource leaks).

### Quality Gates

- All P1 user scenarios pass manual testing on both Chrome and Firefox.
- Code duplication remains below 2% threshold.
- No accessibility regressions (WCAG 2.1 AA compliance maintained).
- All removed code is documented in a migration guide for users of the old API.

## Implementation Phases

### Phase A: PDF Code Removal
- Remove `pdfjs-dist`, `tesseract.js` dependencies
- Delete PDF-related handlers, services, and utilities
- Update manifest and permissions
- Verify bundle size reduction
- Update CLAUDE.md to reflect removal

### Phase B: Article Reader Foundation
- Implement `ReaderPort` interface and Readability adapter
- Create minimal reader UI component
- Add `scripting.executeScript()` injection pattern
- Implement permissions request flow

### Phase C: Highlight System
- Implement `HighlightRepositoryPort` with IndexedDB adapter
- Create TextQuoteSelector anchoring logic
- Add highlight creation/deletion UI
- Implement re-anchoring on page load
- Add orphan detection and notification

### Phase D: ElevenLabs Integration
- Implement `TtsPort` interface with ElevenLabs adapter
- Create `AudioPlayerPort` with offscreen document support (Chrome)
- Add streaming playback with paragraph chunking
- Implement audio caching in IndexedDB
- Add playback controls to UI

### Phase E: Polish & Cross-Browser
- Verify Firefox MV3 compatibility (or MV2 fallback)
- Abstract browser-specific code behind adapters
- Performance optimization and testing
- Documentation updates
