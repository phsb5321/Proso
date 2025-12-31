# Feature Specification: Robust Audio-Text Highlight Synchronization

**Feature Branch**: `006-robust-audio-highlight-sync`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "The highlight of text are completely disconnected from the audio. I need you to force the audio and highlights to be in sync all the time. Use robust synchronization mechanisms and AI-powered timestamps (Groq API). Maintain the highlight on the audio text until the audio section is finished."

## Problem Statement

The current implementation suffers from text highlights becoming disconnected from audio playback. Users report that highlighted text does not accurately track what is being spoken, leading to a disorienting experience. The synchronization relies on estimated timelines based on word counts, which drift significantly from actual audio timing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Audio-Text Stays in Sync (Priority: P1)

As a user listening to web page content, I want the highlighted text to precisely match what I'm hearing so I can follow along without confusion or losing my place.

**Why this priority**: This is the core problem - without accurate sync, the entire TTS reading experience is unusable. Users lose context and cannot effectively follow along with the audio.

**Independent Test**: Play any paragraph and verify the highlighted word/sentence matches the spoken audio within 100ms for word-level and 200ms for paragraph-level highlighting.

**Acceptance Scenarios**:

1. **Given** audio playback begins, **When** the first word is spoken, **Then** that word is highlighted within 100ms of when it is audible
2. **Given** playback is at paragraph N, **When** the audio for paragraph N finishes, **Then** highlight immediately transitions to paragraph N+1 without gaps
3. **Given** playback is in progress, **When** I observe for 60 seconds, **Then** the highlight never drifts more than 200ms from the spoken content

---

### User Story 2 - Highlight Persists Until Section Complete (Priority: P1)

As a user, I want the current paragraph/sentence to remain highlighted until the audio for that section completely finishes so I don't lose track of where I am.

**Why this priority**: Equally critical as Story 1 - premature highlight removal causes users to lose their place, making reading along impossible.

**Independent Test**: Play a long paragraph and verify the highlight remains visible throughout the entire duration until the next paragraph begins.

**Acceptance Scenarios**:

1. **Given** a paragraph is being read, **When** the audio is at 50% through the paragraph, **Then** the entire paragraph remains highlighted
2. **Given** a paragraph is being read, **When** the audio reaches the last word, **Then** the paragraph stays highlighted until the first word of the next paragraph begins
3. **Given** playback is paused mid-paragraph, **When** I observe for 30 seconds, **Then** the current paragraph remains highlighted without change

---

### User Story 3 - Word-Level Sync via Groq Whisper API (Priority: P2)

As a user, I want word-by-word highlighting that precisely matches spoken words so I can follow along at the word level, regardless of which TTS provider I use.

**Why this priority**: Enhances the reading experience significantly. Paragraph-level sync (P1) must work first.

**Independent Test**: Play any TTS audio and verify each word highlights at the exact moment it is spoken.

**Acceptance Scenarios**:

1. **Given** any TTS provider is selected, **When** audio is generated, **Then** the system uses Groq Whisper API to extract word timestamps
2. **Given** Groq API returns word timestamps, **When** audio plays, **Then** individual words highlight within 100ms of being spoken
3. **Given** word timing data is available, **When** a multi-syllable word is spoken, **Then** the entire word stays highlighted from start to end of pronunciation
4. **Given** Groq API is unavailable or fails, **When** audio is generated, **Then** system falls back to paragraph-level highlighting without error

---

### User Story 4 - [TODO] Native Provider Timestamps (Priority: Deferred)

As a user with a TTS provider that natively supports timestamps (like ElevenLabs), I want the system to optionally use those native timestamps to reduce latency and API costs.

**Why this priority**: Optimization for future iteration. Groq-based sync must work first.

**Independent Test**: Deferred to future iteration.

**Acceptance Scenarios**:

1. [TODO] **Given** ElevenLabs is selected and native timestamps enabled, **When** audio plays, **Then** system uses ElevenLabs timestamps instead of Groq

---

### User Story 5 - Seek/Navigation Maintains Sync (Priority: P3)

As a user, when I seek to a different position or navigate to another paragraph, I want the highlight to immediately update to match the new audio position.

**Why this priority**: Navigation is secondary to continuous playback sync but essential for usability.

**Independent Test**: Click on the progress bar to seek to 50% and verify the correct paragraph/word is highlighted immediately.

**Acceptance Scenarios**:

1. **Given** playback is at paragraph 2, **When** I click to seek to paragraph 5, **Then** paragraph 5 is highlighted within 100ms
2. **Given** word-level sync is active, **When** I seek to mid-paragraph, **Then** the correct word at that timestamp is highlighted
3. **Given** I click "Previous" button, **When** playback resumes, **Then** the previous paragraph is highlighted and audio restarts from its beginning

---

### User Story 6 - Recovery from Sync Drift (Priority: P3)

As a user, if the system detects sync has drifted, I want it to automatically resync without interrupting playback so I don't have to manually restart.

**Why this priority**: Robustness feature that improves reliability but is not critical if primary sync is accurate.

**Independent Test**: Simulate a timing drift condition and verify the system auto-corrects within 500ms.

**Acceptance Scenarios**:

1. **Given** the audio clock and highlight state have drifted apart, **When** drift exceeds 200ms, **Then** system automatically resynchronizes within 500ms
2. **Given** browser tab was backgrounded and returned to foreground, **When** playback resumes, **Then** highlight matches current audio position
3. **Given** system clock or audio buffer jitters, **When** playback continues, **Then** sync is maintained through continuous correction

---

### Edge Cases

- What happens when audio playback stutters or buffers? System must re-sync to actual audio position when playback resumes.
- How does system handle very fast speech rates (2x speed)? Word timing must scale proportionally.
- What happens when the user switches tabs during playback? Highlight must sync correctly when tab becomes visible again.
- How does system handle paragraphs with unusual punctuation or symbols? Word boundary detection must be robust.
- What happens if Groq API rate limits are exceeded? System must gracefully degrade to paragraph-only sync.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST use the audio element's `currentTime` property as the authoritative time source for all synchronization
- **FR-002**: System MUST update highlight state on every animation frame (via `requestAnimationFrame`) when playback is active
- **FR-003**: System MUST maintain paragraph-level highlight latency below 200ms from actual audio position
- **FR-004**: System MUST maintain word-level highlight latency below 100ms when word timing data is available
- **FR-005**: System MUST keep the current paragraph/word highlighted until the audio for that section ends
- **FR-006**: System MUST use Groq Whisper API as the primary method for extracting word timestamps from all TTS audio
- **FR-007**: [TODO] System MAY use native word timestamps from TTS providers that support them (e.g., ElevenLabs) as an optimization in future iterations
- **FR-008**: System MUST gracefully fall back to paragraph-level sync when word timing is unavailable
- **FR-009**: System MUST rebuild timing calculations when actual audio duration becomes known (via `loadedmetadata` event)
- **FR-010**: System MUST immediately update highlights when user seeks or navigates
- **FR-011**: System MUST detect and auto-correct sync drift exceeding 200ms
- **FR-012**: System MUST continue highlighting during pause state without updates
- **FR-013**: System MUST clear all highlights when playback stops
- **FR-014**: System MUST provide a separate settings field for Groq API key configuration
- **FR-015**: System MUST gracefully fall back to paragraph-only sync when Groq API key is not configured (no error shown to user)

### Key Entities

- **SyncState**: Current synchronization state including audio time, paragraph index, word index, and drift detection flags
- **WordTimeline**: Array of word boundaries with start/end timestamps relative to audio duration
- **ParagraphTimeline**: Array of paragraph boundaries with start/end timestamps
- **TimestampProvider**: Interface for services that provide word-level timing (native TTS timestamps, Groq API)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of users report highlight accurately tracks spoken content (via user feedback)
- **SC-002**: Paragraph-level highlight latency is below 200ms in 99% of samples during continuous playback
- **SC-003**: Word-level highlight latency is below 100ms in 95% of samples when word timing is available
- **SC-004**: Zero instances of highlight "jumping ahead" of audio (highlight must always lag or be in sync, never lead)
- **SC-005**: Sync recovery after seek/navigation occurs within 150ms
- **SC-006**: Continuous playback of 10+ minutes maintains sync accuracy without cumulative drift

## Clarifications

### Session 2025-12-31

- Q: When should Groq API be used for word timestamps? → A: Groq API is the primary/main timestamp provider for all TTS providers; other native timestamp integrations (e.g., ElevenLabs) deferred to TODO.
- Q: How should Groq API key be managed? → A: Separate settings field for Groq API key; if not configured, system falls back to paragraph-only sync without error.

## Assumptions

- Groq Whisper API is available and provides word-level timestamps with `timestamp_granularities=["word"]`
- ElevenLabs native timestamps deferred to future iteration (TODO)
- The browser supports `requestAnimationFrame` and accurate `audio.currentTime` reporting
- Firefox 119+ is the minimum browser version (required for CSS Custom Highlight API for word-level highlighting)
- Users have stable network connectivity for API calls (degraded experience acceptable with poor connectivity)
