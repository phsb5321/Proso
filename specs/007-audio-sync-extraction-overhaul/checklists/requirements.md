# Requirements Checklist: Audio-Text Sync & Content Extraction Overhaul

**Purpose**: Track implementation status of all functional requirements from the specification
**Created**: 2025-12-31
**Feature**: [spec.md](../spec.md)

## Audio-Text Synchronization

- [ ] FR-001 Use audio.currentTime as single authoritative time source
- [ ] FR-002 Update sync state at least 4x/second (250ms max interval) via timeupdate
- [ ] FR-003 Support requestAnimationFrame for 60fps visual updates when tab active
- [ ] FR-004 Handle word timing in multiple formats (startMs/endMs and startTimeMs/endTimeMs)
- [ ] FR-005 Implement efficient word lookup (binary search or linear scan)
- [ ] FR-006 Detect and auto-correct sync drift exceeding 200ms
- [ ] FR-007 Resync within 500ms when tab visibility changes

## Word Timing Extraction

- [ ] FR-008 Support Groq Whisper API for word-level timestamps
- [ ] FR-009 Align transcribed words to source text with fuzzy matching
- [ ] FR-010 Cache word timing data alongside audio
- [ ] FR-011 Scale word timings proportionally for duration differences

## Content Extraction

- [ ] FR-012 Detect wiki content containers (Fextralife, Wikipedia, Fandom)
- [ ] FR-013 Calculate content score using paragraph count, text length, link density, heading count
- [ ] FR-014 Filter navigation by class/id patterns: nav, menu, sidebar, header, footer, comment, ad
- [ ] FR-015 Require minimum 30 characters for content blocks
- [ ] FR-016 Skip text blocks with >70% link text
- [ ] FR-017 Remove scripts, styles, forms, hidden elements, cookie notices, social buttons
- [ ] FR-018 Use text-based matching (not index) to find DOM elements

## Highlighting

- [ ] FR-019 Use CSS Custom Highlight API for word-level highlighting (Firefox 119+)
- [ ] FR-020 Fall back to paragraph-only highlighting when word timing unavailable
- [ ] FR-021 Support dual-layer highlighting (paragraph background + word highlight)
- [ ] FR-022 Clear previous word highlight before applying new one
- [ ] FR-023 Scroll highlighted element into view with smooth animation

## Success Criteria

- [ ] SC-001 Word highlighting <100ms latency
- [ ] SC-002 Paragraph highlighting <200ms latency
- [ ] SC-003 Content extraction filters 95%+ navigation/boilerplate on wiki sites
- [ ] SC-004 Sync drift auto-correction within 500ms
- [ ] SC-005 Tab visibility resync within 500ms
- [ ] SC-006 Graceful fallback to paragraph-only sync (100% degradation)
- [ ] SC-007 Content extraction <500ms for typical articles
- [ ] SC-008 Word timing cache under 5MB for typical session

## Notes

- Check items off as completed: `[x]`
- Add implementation notes inline as needed
- Link to relevant code files when implementing
- Items are numbered per specification (FR-XXX, SC-XXX)
