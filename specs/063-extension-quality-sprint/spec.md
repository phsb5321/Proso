# Feature Specification: Extension Quality Sprint

**Feature Branch**: `063-extension-quality-sprint`
**Created**: 2026-02-09
**Status**: Draft
**Input**: User description: "Conduct extensive exploratory research on the codebase and the internet to find points where the extension can be improved."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable Message Handling and Error Recovery (Priority: P1)

A user activates VoxPage on a complex web page. The extension handles all message exchanges between the popup, background script, and content script without silent failures. If a TTS provider returns an error or the content script can't extract text, the user sees a clear, actionable error message rather than a frozen UI or silent failure.

**Why this priority**: Message validation and error handling gaps are the most impactful codebase issues found during research. Silent failures cause confusion and make debugging nearly impossible. Unvalidated message payloads can cause runtime crashes. This is foundational to every other improvement.

**Independent Test**: Can be tested by triggering each message type from the popup and content script, verifying that malformed payloads are rejected gracefully, and confirming error messages appear in the footer and popup.

**Acceptance Scenarios**:

1. **Given** a popup sends a message with missing required fields, **When** the background handler receives it, **Then** the handler returns a structured error response (not a crash) and the popup displays a user-friendly error.
2. **Given** the content script sends a paragraph extraction result, **When** the popup receives the response, **Then** the response is validated against a schema before use, preventing type-related runtime errors.
3. **Given** a TTS provider API call fails, **When** the playback handler catches the error, **Then** the footer displays the specific error reason and offers a retry action.
4. **Given** an export job is in progress, **When** 10 minutes pass without completion, **Then** the polling stops automatically and the user is notified that the export timed out.

---

### User Story 2 - Expanded TTS Provider Support (Priority: P2)

A user wants to use VoxPage with their preferred TTS provider. Currently, only Browser TTS and ElevenLabs are wired in the hexagonal architecture. The user selects OpenAI TTS (including the new gpt-4o-mini-tts model), Groq, or Cartesia from the popup and audio generates correctly through the adapter pattern.

**Why this priority**: The factory only creates adapters for `browser` and `elevenlabs`, yet the protocol and UI reference 5+ providers. Users who select OpenAI, Groq, or Cartesia encounter an "Unknown audio provider" error. This is a direct feature gap blocking users who pay for these services.

**Independent Test**: Can be tested by selecting each provider in the popup, entering a valid API key, and confirming audio plays for a test paragraph.

**Acceptance Scenarios**:

1. **Given** a user selects "OpenAI" as their TTS provider and enters a valid API key, **When** they click play on a page, **Then** audio is generated via the OpenAI TTS API and plays correctly.
2. **Given** a user selects "Groq" as their provider, **When** they attempt to read a non-English page, **Then** a clear message explains that Groq only supports English and suggests switching providers.
3. **Given** the user switches providers mid-session, **When** the next paragraph loads, **Then** the new provider generates the audio without requiring a page reload.

---

### User Story 3 - Improved Accessibility and Keyboard Navigation (Priority: P2)

A user who relies on keyboard navigation and screen readers uses VoxPage. All interactive elements in the popup, options page, and sticky footer are fully keyboard-accessible, with proper ARIA live regions for dynamic content changes (playback state, queue updates, export progress).

**Why this priority**: WCAG 2.1 AA compliance is essential for a reading-accessibility tool. Current gaps include missing `aria-live` regions on the export progress display and queue item additions, and no `prefers-reduced-motion` handling in popup CSS.

**Independent Test**: Can be tested by navigating the entire extension UI using only keyboard (Tab, Enter, Space, Escape) and verifying all state changes are announced by screen readers.

**Acceptance Scenarios**:

1. **Given** a screen reader user opens the popup, **When** the playback state changes (playing, paused, error), **Then** the state change is announced via an ARIA live region.
2. **Given** a user adds a page to the reading queue, **When** the item appears in the queue list, **Then** the addition is announced to screen readers.
3. **Given** a user has `prefers-reduced-motion` enabled, **When** any animation would play in the popup or footer, **Then** the animation is suppressed or replaced with an instant transition.
4. **Given** keyboard shortcuts use single character keys, **When** the user interacts with VoxPage, **Then** all shortcuts require a modifier key (Ctrl, Alt) per WCAG 2.1.4, or can be remapped/disabled.

---

### User Story 4 - Stronger Test Coverage and Quality Gates (Priority: P3)

A developer working on VoxPage makes a code change. The test suite catches regressions in critical paths (message routing, playback state transitions, cache operations, provider switching) with high confidence. Coverage thresholds match production standards, and stricter linting rules catch common mistakes before they reach production.

**Why this priority**: Current coverage thresholds are 25% (industry standard for production is 60-80%). Several linting rules that catch real bugs (unused variables, explicit any types, non-null assertions) are disabled. This creates risk of shipping regressions.

**Independent Test**: Can be tested by running the full test suite and verifying it meets the new coverage thresholds, and that stricter linting rules pass without errors.

**Acceptance Scenarios**:

1. **Given** the test suite runs, **When** coverage is calculated, **Then** statement coverage is at least 60% and branch coverage is at least 50%.
2. **Given** a developer introduces an unused variable, **When** they run the linter, **Then** the linter warns about the unused variable.
3. **Given** the message dispatch function in the background script, **When** integration tests run, **Then** both hexagonal dispatch and legacy fallback paths are covered.
4. **Given** a handler receives an invalid payload, **When** integration tests verify error paths, **Then** the handler returns a structured error response (not an unhandled exception).

---

### User Story 5 - Messaging Convention Cleanup and Legacy Removal (Priority: P3)

A developer reads the VoxPage codebase and can follow message flows without confusion. All message types use a consistent naming convention (dot-notation), the legacy format is removed or explicitly bridged, and straggling handler files are moved to match the hexagonal architecture layout.

**Why this priority**: The current codebase mixes two naming conventions for message types. This creates confusion when tracing message flows and increases the risk of handler name mismatches. Moving handler files into the hexagonal structure completes the architectural migration started in feature 062.

**Independent Test**: Can be tested by searching the codebase for legacy message constants and verifying they are either eliminated or have explicit bridge mappings at a single location.

**Acceptance Scenarios**:

1. **Given** the codebase is searched for message type usage, **When** all message sending and receiving points are audited, **Then** every message type has a single canonical dot-notation name.
2. **Given** the export handlers, **When** they are invoked through the hexagonal dispatch, **Then** they are located alongside all other handler files in the standard handlers directory.
3. **Given** legacy content script code that uses the old format, **When** a message is sent, **Then** it is explicitly bridged at a single mapping point to the canonical dot-notation handler name.

---

### Edge Cases

- What happens when the user's IndexedDB is full or corrupted and audio caching fails? The extension falls back to in-memory caching and notifies the user.
- How does the system handle a provider API key that becomes invalid mid-playback? The current paragraph fails gracefully and the user sees a re-authentication prompt.
- What happens when a content script is injected into a page that blocks extensions (e.g., about:pages, PDF viewers)? The popup displays "This page cannot be read" rather than showing a spinner indefinitely.
- How does the system handle extremely long pages (1000+ paragraphs)? Export and playback use batching/pagination to avoid memory exhaustion.
- What if the user switches tabs while audio is generating? Playback continues for the original tab's content without cross-contamination.

## Requirements *(mandatory)*

### Functional Requirements

#### Message Validation & Error Handling
- **FR-001**: System MUST validate all incoming message payloads in handlers using runtime schemas before processing.
- **FR-002**: System MUST validate all outgoing message responses in the popup using schema parsing (replacing unvalidated type assertions).
- **FR-003**: System MUST return structured error responses `{ success: false, error: string, code?: string }` from all handlers on validation failure.
- **FR-004**: System MUST implement a maximum timeout (10 minutes) on export progress polling to prevent indefinite resource consumption.
- **FR-005**: System MUST remove or guard sensitive metadata logging (API key length, key prefix) in provider code so it is never emitted in production builds.

#### TTS Provider Expansion
- **FR-006**: System MUST create audio generator adapters for OpenAI TTS, Groq, and Cartesia providers implementing the audio generator port interface.
- **FR-007**: System MUST register all 5 provider adapters (browser, elevenlabs, openai, groq, cartesia) in the audio generator factory.
- **FR-008**: System MUST support the latest OpenAI TTS model with streaming response handling and voice selection.
- **FR-009**: System MUST display clear language-support limitations when a provider that only supports English is selected for a non-English page.

#### Accessibility
- **FR-010**: System MUST add live regions to the popup for playback state changes, export progress, and queue updates so screen readers announce changes.
- **FR-011**: System MUST respect the user's reduced-motion preference in popup and options page styling, disabling animations when the preference is set.
- **FR-012**: All keyboard shortcuts MUST use modifier keys or be remappable/disablable per WCAG 2.1.4.
- **FR-013**: System MUST ensure all interactive elements meet the minimum touch target size of 44x44 pixels.

#### Test Coverage & Quality
- **FR-014**: Test coverage thresholds MUST be raised to at least 60% statements, 50% branches, 60% functions, 60% lines.
- **FR-015**: Linting MUST enable unused variable detection and explicit-any detection at warning level.
- **FR-016**: System MUST add integration tests for the message dispatch function covering hexagonal dispatch, legacy fallback, and unknown message paths.
- **FR-017**: System MUST add integration tests for popup-to-background round-trip messaging for at least the 5 most critical message types.

#### Architecture Cleanup
- **FR-018**: System MUST migrate export and queue handlers from their current utility location to the standard handlers directory.
- **FR-019**: System MUST standardize all message type names to dot-notation format with explicit bridge mappings for any legacy format.
- **FR-020**: System MUST complete the migration of language extraction logic (currently inline in the content script) to a dedicated module.
- **FR-021**: System MUST remove dead code: legacy floating controller code and other TODO-marked removal candidates in the content script.

### Key Entities

- **Message Payload**: A typed object sent between extension contexts (popup, background, content). Has a canonical type name (dot-notation), optional parameters validated by a schema, and a structured response type.
- **Audio Generator Adapter**: An implementation of the audio generator port interface for a specific TTS provider. Handles API authentication, audio generation, and error mapping to domain error types.
- **Validation Schema**: A runtime schema that defines the expected shape of a message payload or response. Used at message boundaries to catch type mismatches at runtime.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero unhandled runtime type errors in message passing (all payloads validated at boundaries).
- **SC-002**: All 5 TTS providers (Browser, ElevenLabs, OpenAI, Groq, Cartesia) are selectable and functional from the popup.
- **SC-003**: Extension passes a WCAG 2.1 AA accessibility audit for all interactive UI surfaces (popup, footer, options).
- **SC-004**: Test suite achieves 60% statement coverage and 50% branch coverage (up from current 25%).
- **SC-005**: Zero legacy-format message constants remain outside of explicit bridge mapping code.
- **SC-006**: All handler files reside in the standard handlers directory with no handler logic remaining in utility subdirectories.
- **SC-007**: No API keys or key metadata (length, prefix) are logged in production builds.
- **SC-008**: Export polling times out after 10 minutes maximum, preventing indefinite resource consumption.
- **SC-009**: Linting passes with unused variable detection and explicit-any detection enabled at warning level.
- **SC-010**: 2,400+ existing tests continue passing with zero new test failures introduced.
