# Feature Specification: Real-Time TTS API Integration

**Feature Branch**: `001-realtime-tts-api`
**Created**: 2025-12-30
**Status**: Draft
**Input**: User description: "Research and specify real-time TTS API providers for paragraph audio generation with text highlighting synchronization"

## Research Summary

Based on web research conducted on 2025-12-30, the following TTS API providers were evaluated for real-time audio generation suitable for browser extension use:

### Provider Comparison

| Provider       | Latency (TTFA)   | Price/1K chars | Quality Rating | Streaming | Key Strength                        |
| -------------- | ---------------- | -------------- | -------------- | --------- | ----------------------------------- |
| Cartesia       | 40-90ms          | ~$0.05         | 4.7/5          | Yes       | Fastest, purpose-built for real-time |
| Speechmatics   | ~150ms           | $0.011         | High           | Yes       | Best price-quality ratio            |
| ElevenLabs     | 150ms (Flash)    | ~$0.30         | Excellent      | Yes       | Most natural voices, voice cloning  |
| Deepgram       | Sub-200ms        | $0.027-0.030   | Enterprise     | Yes       | Unified STT/TTS platform            |
| OpenAI TTS     | ~200ms           | $0.015         | Good           | Yes       | Simple integration, familiar API    |
| PlayHT         | ~300ms           | Varies         | High           | Yes       | 100+ languages, voice cloning       |
| Browser native | Instant (local)  | Free           | Variable       | Yes       | No API key needed, works offline    |

### Recommended Providers for VoxPage

**Tier 1 (Already Supported)**: OpenAI, ElevenLabs - Retain for quality and user familiarity
**Tier 2 (Recommended Addition)**: Cartesia - Best latency for real-time sync with highlighting
**Fallback**: Browser native TTS - Free, offline-capable

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Synchronized Reading with Highlighting (Priority: P1)

A user visits an article page and wants to listen to it while seeing exactly which paragraph is being read. They click play and hear natural-sounding speech while the currently-spoken paragraph is visually highlighted, allowing them to follow along or look away and easily find their place.

**Why this priority**: This is the core value proposition of VoxPage - transforming reading into an audio experience while maintaining visual context. Without synchronized highlighting, users lose their place and the experience becomes frustrating.

**Independent Test**: Can be fully tested by playing any webpage with multiple paragraphs and verifying that the visual highlight moves in sync with audio playback.

**Acceptance Scenarios**:

1. **Given** a webpage with article content, **When** user clicks play, **Then** the first paragraph is highlighted AND audio begins within 500ms
2. **Given** audio is playing on paragraph 3, **When** paragraph 3 audio completes, **Then** paragraph 4 highlights AND its audio begins within 200ms
3. **Given** audio is playing, **When** user clicks on a different paragraph, **Then** playback jumps to that paragraph AND highlighting follows within 300ms

---

### User Story 2 - Provider Selection Based on Quality/Cost Preference (Priority: P2)

A user wants to choose between multiple TTS providers based on their priorities: highest quality voices regardless of cost, best value for money, or free options. They can switch providers in settings and immediately hear the difference when testing voices.

**Why this priority**: Different users have different needs - some need premium voices for accessibility reasons, others want free options. Provider choice enables VoxPage to serve both casual users and power users.

**Independent Test**: Can be tested by switching between providers in settings and generating speech for the same text sample to compare quality and response time.

**Acceptance Scenarios**:

1. **Given** user is in settings, **When** they select a different TTS provider, **Then** the provider is saved AND subsequent playback uses the new provider
2. **Given** user has no API key for a premium provider, **When** they try to use that provider, **Then** a clear message explains how to add an API key
3. **Given** user selects browser native TTS, **When** they play content, **Then** audio generates without any API calls or internet dependency

---

### User Story 3 - Streaming Audio for Long Content (Priority: P3)

A user wants to listen to a long article (5000+ words) without waiting for the entire audio to generate upfront. Audio should begin playing while subsequent paragraphs are being generated in the background, creating a seamless listening experience.

**Why this priority**: Long-form content is a common use case (articles, documentation, stories). Without streaming, users would wait unacceptably long before hearing anything.

**Independent Test**: Can be tested by playing a 10-paragraph article and verifying audio starts within 1 second of clicking play, even while later paragraphs are still generating.

**Acceptance Scenarios**:

1. **Given** a long article with 10+ paragraphs, **When** user clicks play, **Then** audio for paragraph 1 begins within 1 second regardless of total article length
2. **Given** audio is streaming, **When** network interruption occurs mid-paragraph, **Then** current paragraph completes AND user sees a retry option for remaining content
3. **Given** user pauses during paragraph 5, **When** they resume after 30 seconds, **Then** playback continues from paragraph 5 without re-generating previous audio

---

### Edge Cases

- What happens when a paragraph contains only punctuation or whitespace?
  - System MUST skip empty paragraphs and proceed to the next content paragraph
- What happens when the TTS API rate limits the request?
  - System MUST display a user-friendly message with estimated wait time or suggest switching providers
- What happens when a paragraph contains code blocks or special formatting?
  - System MUST extract readable text only, skipping code syntax that would sound awkward when spoken
- What happens when the page content changes while audio is playing?
  - System MUST continue playing the originally-extracted content; user can refresh to re-extract
- What happens when audio generation fails mid-article?
  - System MUST highlight the failed paragraph, offer retry, and allow skipping to the next paragraph

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support at least three TTS providers: one premium (ElevenLabs or Cartesia), one standard (OpenAI), and browser native
- **FR-002**: System MUST synchronize text highlighting with audio playback, updating the highlight within 200ms of audio position change
- **FR-003**: System MUST support streaming audio generation, beginning playback before entire content is generated
- **FR-004**: Users MUST be able to switch TTS providers without losing their playback position or settings
- **FR-005**: System MUST gracefully degrade to browser native TTS when premium providers are unavailable or API keys are not configured
- **FR-006**: System MUST display estimated cost per page before playback begins (for paid providers)
- **FR-007**: System MUST cache generated audio segments during a session to avoid regenerating already-played content when rewinding
- **FR-008**: System MUST provide voice selection within each provider (where multiple voices are available)
- **FR-009**: System MUST support playback speed adjustment (0.5x to 2.0x) without re-generating audio
- **FR-010**: System MUST validate API keys on entry and provide immediate feedback on validity

### Key Entities

- **TTS Provider**: A service that converts text to speech audio; has name, endpoint configuration, supported voices, pricing model, and authentication method
- **Audio Segment**: A generated audio clip for a single paragraph; has source text, provider used, audio data, duration, and generation timestamp
- **Playback Session**: Active listening state; tracks current paragraph index, audio position, provider in use, and cached segments
- **Voice**: A specific voice option within a provider; has identifier, display name, language, and sample audio URL

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users hear audio begin within 1 second of clicking play on any webpage
- **SC-002**: Text highlighting remains synchronized with audio within 300ms accuracy throughout playback
- **SC-003**: Users can switch between at least 3 different TTS providers
- **SC-004**: Long articles (5000+ words) begin playing within the same 1-second threshold as short content
- **SC-005**: 95% of playback sessions complete without requiring user intervention for errors
- **SC-006**: Cost display accuracy is within 10% of actual API charges incurred

## Assumptions

- Users have stable internet connectivity for premium TTS providers (browser native works offline)
- API providers maintain their current pricing structures and latency characteristics
- Paragraph-level granularity is sufficient for highlighting (not word-level or sentence-level)
- Users accept that voice quality varies between free and premium options
