# Feature Specification: Fix Highlight Synchronization

**Feature Branch**: `005-fix-highlight-sync`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "The highlight is completely broken. Furthermore, some sections are being skipped and the current word is not double highlighted."

## Clarifications

### Session 2025-12-31

- Q: How should auto-scrolling behave when the user has manually scrolled away from the current paragraph? → A: Auto-scroll only when user is following (hasn't manually scrolled in last 3-5 seconds)

## Problem Statement

The current text-to-speech highlighting implementation has three critical issues:

1. **Broken Highlighting**: The highlight synchronization between audio playback and text visualization is not functioning correctly
2. **Skipped Sections**: Some paragraphs/sections are being skipped during playback, causing a mismatch between spoken content and highlighted text
3. **Missing Dual Highlighting**: When word-level highlighting is active, the current paragraph should also remain highlighted (dual/layered highlighting), but this is not occurring

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable Paragraph Highlighting (Priority: P1)

As a user listening to an article, I want the currently spoken paragraph to always be visually highlighted so I can follow along with the audio without losing my place.

**Why this priority**: This is the core functionality that enables users to track their reading position. Without reliable paragraph highlighting, the entire sync feature is unusable.

**Independent Test**: Start playback on any multi-paragraph article and verify that every paragraph is highlighted in sequence as it is spoken, with no sections skipped.

**Acceptance Scenarios**:

1. **Given** an article with 10 paragraphs and audio playback has started, **When** the audio progresses through each paragraph, **Then** every paragraph is highlighted in sequential order without any being skipped
2. **Given** playback is at paragraph 5 and user has not manually scrolled recently, **When** I observe the highlight, **Then** paragraph 5 is visually highlighted and auto-scrolled into view
3. **Given** playback is active and user manually scrolls away from the current paragraph, **When** less than 3-5 seconds have passed since scrolling, **Then** auto-scroll is temporarily disabled to respect user intent
4. **Given** a page with varying paragraph lengths, **When** playback progresses, **Then** short and long paragraphs are both highlighted proportionally to their spoken duration

---

### User Story 2 - Dual-Layer Word and Paragraph Highlighting (Priority: P1)

As a user with word-level highlighting enabled, I want to see both the current word AND the current paragraph highlighted simultaneously so I can track both my precise position and overall context.

**Why this priority**: Users with word-level timing expect a "karaoke-style" experience where the current word is emphasized within the already-highlighted paragraph. This provides the best reading-along experience.

**Independent Test**: Start playback with a TTS provider that supports word timing (e.g., ElevenLabs) and verify that both the paragraph background highlight AND the word highlight are visible simultaneously.

**Acceptance Scenarios**:

1. **Given** word timing is available and playback is active, **When** the audio is speaking a word, **Then** both the containing paragraph has a background highlight AND the specific word has an additional word-level highlight
2. **Given** dual highlighting is active, **When** the current word moves to the next paragraph, **Then** the paragraph highlight moves to the new paragraph and word highlighting continues within it
3. **Given** word timing is NOT available, **When** playback is active, **Then** paragraph-only highlighting works correctly as a fallback

---

### User Story 3 - Accurate Timing Synchronization (Priority: P2)

As a user, I want the highlight to stay precisely synchronized with the audio so there is no noticeable lag or mismatch between what I hear and what I see highlighted.

**Why this priority**: Slight desynchronization breaks the reading-along experience and causes user frustration.

**Independent Test**: Play content and observe that highlights change within a perceptible timeframe of when the corresponding text is spoken.

**Acceptance Scenarios**:

1. **Given** playback is active, **When** a new paragraph starts being spoken, **Then** the paragraph highlight updates within 200ms of the audio transition
2. **Given** word-level sync is active, **When** a new word starts being spoken, **Then** the word highlight updates within 100ms of the audio transition
3. **Given** the user seeks to a different position, **When** audio jumps to that position, **Then** the highlight immediately updates to match the new position

---

### Edge Cases

- What happens when a paragraph element is removed from the DOM during playback? (Highlight should gracefully skip to next available paragraph)
- How does the system handle very short paragraphs that may only last a fraction of a second? (Highlight should still appear, even briefly)
- What happens when CSS Custom Highlight API is not supported? (Fallback to paragraph-only without errors)
- How does the system behave when word timing data is incomplete or malformed? (Graceful degradation to paragraph highlighting)
- What happens when the user rapidly clicks through paragraphs while playback is active? (System should handle rapid position changes without breaking)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST highlight every paragraph in sequence during playback without skipping any sections
- **FR-002**: System MUST maintain paragraph-level highlighting even when word-level highlighting is active (dual-layer highlighting)
- **FR-003**: System MUST update paragraph highlights within 200ms of the corresponding audio position change
- **FR-004**: System MUST update word highlights within 100ms of the corresponding audio position change (when word timing is available)
- **FR-005**: System MUST correctly map audio timing data to the corresponding text segments on the page
- **FR-006**: System MUST preserve paragraph highlight visibility when applying word-level highlights (word highlight should be additive, not replacement)
- **FR-007**: System MUST gracefully handle missing or incomplete word timing data by falling back to paragraph-only highlighting
- **FR-008**: System MUST recalculate paragraph timing when the audio duration becomes known (after audio loads)
- **FR-009**: System MUST handle DOM mutations gracefully, re-validating paragraph references when content changes
- **FR-010**: System MUST provide visual distinction between paragraph highlight and word highlight so both are perceivable simultaneously
- **FR-011**: System MUST auto-scroll to the current paragraph only when the user has not manually scrolled within the last 3-5 seconds (smart scroll detection)

### Key Entities

- **Paragraph Timeline**: Mapping of audio time ranges to paragraph indices
- **Word Timeline**: Mapping of audio time ranges to specific word positions within paragraphs (when available from TTS provider)
- **Highlight State**: Current paragraph index, current word index (if available), and their corresponding visual states
- **Sync State**: Current audio position, playback status, and timing thresholds for sync validation

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of paragraphs are highlighted during playback with no sections skipped (verified through automated testing)
- **SC-002**: Paragraph highlight latency is under 200ms from audio position change in 95% of cases
- **SC-003**: Word highlight latency is under 100ms from audio position change in 95% of cases (when word timing available)
- **SC-004**: Dual highlighting (paragraph + word) is visually present simultaneously when word timing is available
- **SC-005**: Users can visually distinguish the current paragraph from surrounding text at all times during playback
- **SC-006**: Users can visually distinguish the current word from other words within the highlighted paragraph
- **SC-007**: System gracefully degrades to paragraph-only highlighting when word timing is unavailable, with no errors logged

## Research Findings

Based on web research, the following best practices apply to this fix:

### CSS Custom Highlight API Best Practices

- Use `CSS.highlights.set()` with named highlights for word-level styling
- The API performs 5x faster than DOM-based highlighting approaches
- Support background-color for maximum browser compatibility
- Feature-detect with `if (!CSS.highlights) { /* fallback */ }`
- Multiple ranges can be added to a single Highlight object

### Audio-Text Synchronization

- Use requestAnimationFrame or audio timeupdate events for sync loop
- Pre-compute timing data before playback starts
- Handle word timing from TTS providers like ElevenLabs speech marks
- Implement debounced updates to prevent performance issues

### Dual Highlighting Implementation

- Maintain separate highlight states for paragraph (CSS class) and word (CSS Highlight API)
- Paragraph highlight should NOT be cleared when applying word highlight
- Use distinct visual styles (e.g., paragraph: light background, word: bold/underline or darker background)

## Assumptions

- The existing PlaybackSyncState class structure is sound but may have bugs in timing calculation
- The extractedParagraphs array correctly identifies readable content on the page
- TTS providers that support word timing (e.g., ElevenLabs) return timing data in a consistent format
- Firefox 119+ is the minimum browser version for CSS Custom Highlight API support

## Sources

- [CSS Custom Highlight API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API)
- [Using the Custom Highlight API - Frontend Masters](https://frontendmasters.com/blog/using-the-custom-highlight-api/)
- [CSS Custom Highlight API: A First Look - CSS-Tricks](https://css-tricks.com/css-custom-highlight-api-early-look/)
- [React Speech Highlight](https://github.com/albirrkarim/react-speech-highlight-demo)
- [Highlight text as it's being spoken using Amazon Polly](https://aws.amazon.com/blogs/machine-learning/highlight-text-as-its-being-spoken-using-amazon-polly/)
- [How to Programmatically Highlight Text with the CSS Custom Highlight API - freeCodeCamp](https://www.freecodecamp.org/news/how-to-programmatically-highlight-text-with-the-css-custom-highlight-api/)
