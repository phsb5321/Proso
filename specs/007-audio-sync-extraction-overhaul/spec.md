# Feature Specification: Audio-Text Sync & Content Extraction Overhaul

**Feature Branch**: `007-audio-sync-extraction-overhaul`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "Web search for better algorithms and implementations for this kind of project. Search for research, for good articles on how to nail this kind of implementation"

## Research Summary

This specification is informed by academic research and industry best practices:

### Audio-Text Synchronization Research
- **Forced Alignment via Viterbi Algorithm**: NVIDIA research shows optimal text-to-audio alignment using dynamic programming with CTC models achieving <50ms mean error
- **Amazon Polly Speech Marks**: Industry-standard approach using word-level timestamps and JavaScript setTimeout scheduling
- **React Speech Highlight**: Production library demonstrating dual-layer highlighting (sentence + word)

### Content Extraction Research
- **Trafilatura Algorithm**: Academic benchmark winner (F1: 0.937, Precision: 0.978) using text density and link density heuristics
- **Boilerpipe Algorithm**: Chrome's DOM Distiller foundation using shallow text features
- **Ensemble Methods**: Research shows combining Readability + Trafilatura + Goose3 outperforms individual extractors

**Key Sources**:
- [NVIDIA Forced Alignment](https://research.nvidia.com/labs/conv-ai/blogs/2023/2023-08-forced-alignment/)
- [Amazon Polly Speech Marks](https://docs.aws.amazon.com/polly/latest/dg/speechmarks.html)
- [Trafilatura Evaluation](https://trafilatura.readthedocs.io/en/latest/evaluation.html)
- [ACM SIGIR Content Extraction Comparison](https://dl.acm.org/doi/10.1145/3539618.3591920)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate Word-by-Word Highlighting (Priority: P1)

As a user reading along with TTS, I want each word to be highlighted precisely when it's spoken so I can follow the audio visually without lag or desynchronization.

**Why this priority**: Core user value - the fundamental feature that makes VoxPage useful. Without accurate sync, the extension fails its primary purpose.

**Independent Test**: Play any paragraph, visually confirm each word highlights within 100ms of being spoken. Test with slow/fast speech speeds.

**Acceptance Scenarios**:

1. **Given** audio is playing, **When** a word is spoken, **Then** that word is highlighted within 100ms of the audio
2. **Given** audio is at 50% progress, **When** user seeks to a different position, **Then** correct word highlights within 200ms
3. **Given** audio is playing at 2x speed, **When** words are spoken faster, **Then** highlights still track accurately
4. **Given** audio has finished a paragraph, **When** next paragraph begins, **Then** first word of new paragraph highlights immediately

---

### User Story 2 - Smart Content Extraction (Priority: P1)

As a user on any website, I want the extension to read only the main article content, automatically filtering out navigation, ads, sidebars, and other non-content elements.

**Why this priority**: Equally critical - users cannot tolerate hearing "Home Menu Login Sign Up" before the article. Bad extraction destroys the user experience.

**Independent Test**: On various sites (news, wiki, blog), verify only article content is extracted. Navigation, ads, and sidebars should never be read.

**Acceptance Scenarios**:

1. **Given** a wiki page (Fextralife, Wikipedia), **When** extracting article content, **Then** only main article text is extracted (no navigation, table of contents, or infoboxes)
2. **Given** a news article, **When** extracting content, **Then** article body is extracted without ads, related articles, or comment sections
3. **Given** a blog post, **When** extracting content, **Then** post content is extracted without sidebar, header, footer, or social buttons
4. **Given** a page with minimal structure, **When** content detection fails, **Then** system uses intelligent fallback with content scoring algorithm

---

### User Story 3 - Paragraph-Audio Alignment (Priority: P2)

As a user, I want the correct paragraph to be highlighted while its audio plays, and the highlight should scroll into view smoothly.

**Why this priority**: Important for navigation and context, but word-level sync (P1) provides more granular feedback.

**Independent Test**: Play 5 paragraphs, verify each paragraph highlights when its audio plays, scrolls smoothly into view.

**Acceptance Scenarios**:

1. **Given** audio for paragraph 3 starts, **When** paragraph 3 begins playing, **Then** paragraph 3 is highlighted and scrolled into view within 200ms
2. **Given** user clicks on paragraph 5, **When** clicking the paragraph, **Then** audio jumps to paragraph 5 and begins playing
3. **Given** paragraph audio ends, **When** next paragraph audio starts, **Then** highlight transitions smoothly without flash/flicker

---

### User Story 4 - Graceful Fallback (Priority: P2)

As a user without Groq API configured, I want paragraph-level highlighting to still work reliably, even if word-level sync is unavailable.

**Why this priority**: Users should have a usable experience even without premium features.

**Independent Test**: Disable Groq API key, play audio, verify paragraph highlighting works correctly.

**Acceptance Scenarios**:

1. **Given** no Groq API key configured, **When** audio plays, **Then** paragraph-level highlighting works correctly
2. **Given** Groq API returns error, **When** error occurs, **Then** system falls back to paragraph sync without interrupting playback
3. **Given** word timing extraction fails, **When** failure occurs, **Then** user is notified via subtle indicator (not blocking popup)

---

### User Story 5 - Resilient Sync Recovery (Priority: P3)

As a user who switches tabs or experiences browser throttling, I want the sync to automatically recover when I return.

**Why this priority**: Edge case handling - important for polish but not core functionality.

**Independent Test**: Switch away from tab for 30 seconds, return, verify sync recovers within 500ms.

**Acceptance Scenarios**:

1. **Given** user switches to another tab during playback, **When** returning to the tab, **Then** sync recovers within 500ms
2. **Given** browser throttles background tab, **When** audio timing drifts, **Then** system detects and auto-corrects drift
3. **Given** significant drift (>500ms), **When** drift is detected, **Then** highlight snaps to correct position without jarring jump

---

### Edge Cases

- What happens when the extracted text differs from what TTS speaks (contractions, numbers, abbreviations)?
- How does system handle pages with mostly images and minimal text?
- What happens when audio fails to load mid-playback?
- How does system handle very long articles (10,000+ words)?
- What happens when DOM changes during playback (dynamic content loading)?

---

## Requirements *(mandatory)*

### Functional Requirements

#### Audio-Text Synchronization

- **FR-001**: System MUST use audio.currentTime as the single authoritative time source for all sync decisions
- **FR-002**: System MUST update sync state at least 4 times per second (250ms max interval) using timeupdate events
- **FR-003**: System MUST support requestAnimationFrame for smoother visual updates when tab is active (60fps target)
- **FR-004**: System MUST handle word timing data in multiple formats (startMs/endMs and startTimeMs/endTimeMs)
- **FR-005**: System MUST implement binary search or linear scan to find current word from timeline efficiently
- **FR-006**: System MUST detect sync drift exceeding 200ms and auto-correct without user intervention
- **FR-007**: System MUST resync within 500ms when tab visibility changes (background to foreground)

#### Word Timing Extraction

- **FR-008**: System MUST support Groq Whisper API for word-level timestamp extraction
- **FR-009**: System MUST align transcribed words to source text using fuzzy matching for contractions, numbers
- **FR-010**: System MUST cache word timing data alongside audio to avoid redundant API calls
- **FR-011**: System MUST scale word timings proportionally when actual audio duration differs from estimated

#### Content Extraction

- **FR-012**: System MUST detect wiki content containers (Fextralife, Wikipedia, Fandom) with priority selectors
- **FR-013**: System MUST calculate content score using: paragraph count, text length, link density, heading count
- **FR-014**: System MUST filter navigation elements by class/id patterns: nav, menu, sidebar, header, footer, comment, ad
- **FR-015**: System MUST require minimum 30 characters for a text block to be considered content
- **FR-016**: System MUST skip text blocks with >70% link text (navigation-like)
- **FR-017**: System MUST remove: scripts, styles, forms, hidden elements, cookie notices, social buttons
- **FR-018**: System MUST use text-based matching (not just index) to find DOM elements for highlighting

#### Highlighting

- **FR-019**: System MUST use CSS Custom Highlight API for word-level highlighting (Firefox 119+)
- **FR-020**: System MUST fall back to paragraph-only highlighting when word timing unavailable
- **FR-021**: System MUST support dual-layer highlighting (paragraph background + word highlight)
- **FR-022**: System MUST clear previous word highlight before applying new one (no accumulation)
- **FR-023**: System MUST scroll highlighted element into view with smooth animation

### Key Entities

- **WordTiming**: Represents timing data for a single word (word text, start time, end time, character offset, character length)
- **ParagraphTiming**: Represents timing data for a paragraph (start time, end time, text content)
- **ContentBlock**: Represents extracted content (DOM element reference, text content, content score, element type)
- **SyncState**: Represents current synchronization state (current time, current word index, current paragraph index, drift amount)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Word highlighting achieves <100ms latency from audio position (measured via performance.now timestamps)
- **SC-002**: Paragraph highlighting achieves <200ms latency from audio position
- **SC-003**: Content extraction filters out 95%+ of navigation/boilerplate on tested wiki sites (Fextralife, Wikipedia)
- **SC-004**: Sync drift auto-correction activates when drift exceeds 200ms and corrects within 500ms
- **SC-005**: Tab visibility resync completes within 500ms of returning to foreground
- **SC-006**: Fallback to paragraph-only sync works when Groq API unavailable (100% graceful degradation)
- **SC-007**: System processes content extraction in <500ms for typical articles (<5000 words)
- **SC-008**: Memory usage for word timing cache remains under 5MB for typical session (50 paragraphs)

---

## Assumptions

- Users have Firefox 119+ for CSS Custom Highlight API support (graceful fallback for older versions)
- Groq API returns word timestamps in seconds with at least 10ms precision
- TTS audio duration is known after loadedmetadata event fires
- DOM structure is stable during playback (no major dynamic content changes mid-paragraph)
- Standard wiki sites follow predictable container patterns (#wiki-content-block, #mw-content-text, etc.)
