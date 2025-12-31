# Implementation Plan: Audio-Text Sync & Content Extraction Overhaul

**Branch**: `007-audio-sync-extraction-overhaul` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-audio-sync-extraction-overhaul/spec.md`

## Summary

Overhaul the audio-text synchronization and content extraction systems to achieve <100ms word-level sync latency and 95%+ boilerplate filtering accuracy. Implementation uses research-backed algorithms: audio.currentTime as authoritative time source, timeupdate + requestAnimationFrame dual-mechanism sync, Trafilatura-inspired content scoring, and CSS Custom Highlight API for word highlighting.

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: Web Audio API, CSS Custom Highlight API, browser.storage API, browser.runtime messaging
**Storage**: browser.storage.local (audio cache, word timing cache, settings)
**Testing**: Jest (unit), Playwright (visual/integration)
**Target Platform**: Firefox 119+ (CSS Custom Highlight API baseline), with graceful fallback for 109+
**Project Type**: Browser extension (background service worker + content scripts)
**Performance Goals**: <100ms word sync latency, <200ms paragraph sync latency, 60fps visual updates
**Constraints**: <5MB word timing cache per session, <500ms content extraction time
**Scale/Scope**: Typical articles <5000 words, 50 paragraphs per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Privacy First | PASS | All sync data stored locally; only TTS provider receives text on playback initiation; no telemetry |
| II. Security by Default | PASS | API calls from background worker only; DOM manipulation uses textContent/classList; no innerHTML |
| III. User Experience Excellence | PASS | <100ms sync feedback; smooth scroll animation; graceful fallback for unsupported browsers |
| IV. Modular Architecture | PASS | PlaybackSyncState is independent module; content extraction is separate from highlighting; clear interfaces between background/content scripts |
| V. Test Coverage for Critical Paths | PASS | Unit tests for PlaybackSyncState, TextSegment; contract tests for word timing formats |

**Quality Gates**:
- [x] Manifest validation via `web-ext lint`
- [x] Firefox 109+ compatibility target (119+ for full features)
- [x] All API permissions already declared

## Project Structure

### Documentation (this feature)

```text
specs/007-audio-sync-extraction-overhaul/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
background/
├── background.js          # Main service worker, playback coordination
├── playback-sync.js       # PlaybackSyncState class - sync state machine
├── constants.js           # Message types, storage keys
├── provider-registry.js   # TTS provider management
├── providers/
│   └── elevenlabs-provider.js  # Word timing support
└── audio-cache.js         # Audio segment caching (word timing cache addition)

content/
├── content.js             # Content extraction, DOM interaction
├── text-segment.js        # Text-to-DOM mapping, Range creation
└── floating-controller.js # Playback UI widget

styles/
├── content.css            # Paragraph + word highlight styles
└── floating-controller.css

tests/
├── unit/
│   ├── playback-sync.test.js   # Sync state machine tests
│   ├── text-segment.test.js    # Text mapping tests
│   └── content-extraction.test.js  # New: extraction algorithm tests
├── contract/
│   └── word-timing-formats.test.js # New: timing format validation
└── integration/
    └── sync-accuracy.test.js   # New: end-to-end sync timing
```

**Structure Decision**: Existing browser extension structure with clear separation between background service worker (audio/sync coordination) and content scripts (DOM interaction/highlighting). New tests added for content extraction and sync accuracy.

## Complexity Tracking

> No constitution violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
