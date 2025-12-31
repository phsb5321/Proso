# Feature Specification: Playback Sync & Highlight

**Feature Branch**: `004-playback-sync-highlight`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "Maintain a playback floating window when the sound is playing to help the user with controlling the audio. Furthermore, the audio is skipping sections and paragraphs and is talking stuff that is not highlighted. I would like the entire audio section to be highlighted as well as the current word being read as well."

## Problem Statement

The current VoxPage implementation has two significant usability issues:

1. **Audio-text synchronization mismatch**: The TTS audio plays content that doesn't match what's being highlighted on the page. Users hear words that aren't visually indicated, creating confusion about reading position.

2. **No persistent playback controls**: When users close the popup or navigate within the page, they lose access to playback controls. Users must reopen the popup to pause, skip, or adjust playback.

## User Scenarios & Testing

### User Story 1 - Floating Playback Controller (Priority: P1)

As a user listening to a webpage, I want a persistent floating controller visible on the page so that I can control playback without reopening the extension popup.

**Why this priority**: Without persistent controls, users cannot pause/resume playback when scrolling or reading along, which is the primary use case. This is essential for basic usability.

**Independent Test**: Load a page, start playback, close popup, and verify floating controller appears with working play/pause, skip, and close controls.

**Acceptance Scenarios**:

1. **Given** audio is playing on a webpage, **When** the user closes the extension popup, **Then** a floating controller remains visible on the page with play/pause controls
2. **Given** a floating controller is visible, **When** the user clicks the pause button, **Then** audio pauses immediately and the button shows a play icon
3. **Given** a floating controller is visible, **When** the user clicks the skip forward button, **Then** playback jumps to the next paragraph
4. **Given** a floating controller is visible, **When** the user clicks the close button, **Then** playback stops and the controller disappears
5. **Given** a floating controller is visible, **When** the user drags the controller, **Then** it moves to the new position and remembers this position for future sessions
6. **Given** audio playback is stopped, **When** viewing any page, **Then** no floating controller is displayed

---

### User Story 2 - Section/Paragraph Highlighting (Priority: P1)

As a user following along with TTS, I want the current paragraph or section being read to be visually highlighted so that I can see exactly which content is being spoken.

**Why this priority**: This is a bug fix - the current paragraph highlighting is out of sync with audio. Users report audio "talking stuff that is not highlighted."

**Independent Test**: Start playback on a multi-paragraph article and verify the highlighted paragraph always matches the audio content being spoken.

**Acceptance Scenarios**:

1. **Given** TTS is reading a paragraph, **When** listening to the audio, **Then** the entire paragraph being spoken is visually highlighted with a distinct background color
2. **Given** TTS transitions from paragraph A to paragraph B, **When** the first word of paragraph B is spoken, **Then** highlight moves from A to B within 200ms
3. **Given** a highlighted paragraph is not visible on screen, **When** that paragraph starts playing, **Then** the page scrolls smoothly to show the highlighted paragraph
4. **Given** playback is paused, **When** viewing the page, **Then** the last active paragraph remains highlighted
5. **Given** playback is stopped or completed, **When** viewing the page, **Then** all highlights are cleared

---

### User Story 3 - Word-Level Highlighting (Priority: P2)

As a user reading along with TTS, I want to see the current word being spoken highlighted within the paragraph so that I can follow along word-by-word like a karaoke display.

**Why this priority**: Enhances the reading experience significantly but requires TTS provider support for word timing. Depends on paragraph sync being fixed first.

**Independent Test**: Start playback and verify individual words are highlighted as they are spoken, moving smoothly through the text.

**Acceptance Scenarios**:

1. **Given** TTS is speaking a paragraph, **When** each word is spoken, **Then** that word is highlighted with a distinct accent color within the already-highlighted paragraph
2. **Given** a word is being spoken, **When** the next word begins, **Then** the highlight moves to the new word within 100ms of the audio
3. **Given** word-level timing is unavailable from the TTS provider, **When** playback occurs, **Then** only paragraph-level highlighting is shown (graceful fallback)
4. **Given** the user clicks on any word in the highlighted paragraph, **When** the click is registered, **Then** playback jumps to that word position
5. **Given** playback is paused mid-word, **When** viewing the page, **Then** the current word remains highlighted

---

### User Story 4 - Playback Progress Indicator (Priority: P2)

As a user, I want to see a visual progress indicator showing how far I am in the current reading so that I can estimate remaining time.

**Why this priority**: Nice-to-have feature that improves user awareness but isn't critical for core functionality.

**Independent Test**: Start playback and verify progress bar fills proportionally as content is read, with accurate time remaining display.

**Acceptance Scenarios**:

1. **Given** the floating controller is visible, **When** playback is active, **Then** a progress bar shows current position as a percentage of total content
2. **Given** the floating controller shows progress, **When** the user clicks on the progress bar, **Then** playback jumps to that position
3. **Given** the floating controller is visible, **When** playback is active, **Then** estimated time remaining is displayed
4. **Given** playback is paused, **When** viewing the controller, **Then** progress position is preserved and time remaining is still shown

---

### Edge Cases

- What happens when navigating to a different page while audio is playing?
  - Playback stops, floating controller is removed, highlights are cleared
- What happens when the page content changes dynamically (SPA navigation, infinite scroll)?
  - System should re-sync by detecting DOM changes and updating paragraph references
- How does the system handle very long paragraphs (1000+ words)?
  - Still highlight the entire paragraph; word highlighting tracks position within
- What happens if the TTS provider doesn't support word-level timestamps?
  - Gracefully degrade to paragraph-only highlighting
- What happens if the user has multiple browser windows/tabs playing simultaneously?
  - Each tab maintains its own playback state and floating controller

## Requirements

### Functional Requirements

**Floating Controller**
- **FR-001**: System MUST inject a floating playback controller into the webpage when audio playback starts
- **FR-002**: Floating controller MUST provide play/pause, previous paragraph, next paragraph, and stop controls
- **FR-003**: Floating controller MUST be draggable and remember user-set position across sessions
- **FR-004**: Floating controller MUST be removable by clicking a close button
- **FR-005**: System MUST display a progress bar showing current playback position
- **FR-006**: Floating controller MUST not interfere with page content (use high z-index, avoid covering essential UI)
- **FR-007**: System MUST remove floating controller when playback stops or completes

**Text Highlighting**
- **FR-008**: System MUST highlight the entire paragraph/section currently being read
- **FR-009**: System MUST synchronize paragraph highlighting within 200ms of audio position
- **FR-010**: System MUST clear previous paragraph highlight when moving to next paragraph
- **FR-011**: System MUST auto-scroll to keep highlighted content visible
- **FR-012**: System SHOULD highlight the current word being spoken when word-timing data is available
- **FR-013**: System MUST synchronize word highlighting within 100ms of audio position
- **FR-014**: System MUST provide graceful fallback to paragraph-only highlighting when word timing is unavailable

**Audio-Text Synchronization**
- **FR-015**: System MUST maintain accurate mapping between TTS audio segments and source text paragraphs
- **FR-016**: System MUST handle TTS provider word-timing/speech-marks data when available
- **FR-017**: System MUST support click-to-seek on both paragraphs and individual words

**State Persistence**
- **FR-018**: System MUST persist floating controller position preference in browser storage
- **FR-019**: System MUST maintain playback state when popup is closed

### Key Entities

- **PlaybackPosition**: Represents current position in the reading - includes paragraph index, word index (if available), and elapsed time
- **TextSegment**: Maps source text to DOM elements - includes text content, DOM element reference, character offset range, and word boundaries
- **WordTiming**: Timing data for word-level sync - includes word text, start time (ms), end time (ms), and character offset
- **FloatingController**: State of the on-page controller - includes position (x, y), visibility, and playback controls state

## Success Criteria

### Measurable Outcomes

- **SC-001**: Highlighted text matches spoken audio at least 95% of the time (verified by user observation)
- **SC-002**: Word-level highlighting appears within 100ms of the corresponding audio (when timing data available)
- **SC-003**: Paragraph highlighting transitions within 200ms of audio paragraph change
- **SC-004**: Users can control playback without reopening the popup 100% of the time during active playback
- **SC-005**: Auto-scroll keeps highlighted content visible in viewport for 90%+ of reading time
- **SC-006**: Floating controller remains functional across page scrolling and dynamic content changes

## Assumptions

- TTS providers that support word-level timing (ElevenLabs with timestamps API) will be used for word-level highlighting; others will fall back to paragraph-only
- The content script has sufficient permissions to inject UI elements into web pages
- The existing paragraph extraction logic correctly identifies text boundaries
- Users prefer a minimalist floating controller that doesn't obstruct page content
- The extension popup and content script can communicate reliably via browser messaging

## Research References

- [ElevenLabs Text-to-Speech with Timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) - Word-level timing API
- [React Speech Highlight](https://github.com/albirrkarim/react-speech-highlight-demo) - Reference implementation for word highlighting
- [Amazon Polly Speech Marks](https://aws.amazon.com/blogs/machine-learning/highlight-text-as-its-being-spoken-using-amazon-polly/) - Speech mark synchronization approach
- [CSS Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) - Modern browser API for text highlighting
