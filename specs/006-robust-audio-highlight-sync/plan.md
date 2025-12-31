# Implementation Plan: Robust Audio-Text Highlight Synchronization

**Branch**: `006-robust-audio-highlight-sync` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-robust-audio-highlight-sync/spec.md`

## Summary

Fix the disconnected audio-text highlighting by implementing robust synchronization using `audio.currentTime` as the authoritative time source and Groq Whisper API for word-level timestamps. The sync loop runs via `requestAnimationFrame` to ensure <200ms paragraph latency and <100ms word latency. Highlights persist until audio sections complete, with automatic drift correction.

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: Web Audio API, CSS Custom Highlight API, browser.storage API, Groq Whisper API
**Storage**: browser.storage.local (API keys, controller position)
**Testing**: Jest (unit), Playwright (visual/integration)
**Target Platform**: Firefox 119+ (CSS Custom Highlight API requirement)
**Project Type**: Browser extension (background service worker + content scripts)
**Performance Goals**: <200ms paragraph sync latency, <100ms word sync latency, 60fps animation loop
**Constraints**: <500ms drift auto-correction, graceful fallback when Groq unavailable
**Scale/Scope**: Single-user browser extension, audio files up to 10 minutes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Privacy First | PASS | Groq API key stored locally; audio sent only to user-selected TTS provider + Groq for timestamps |
| II. Security by Default | PASS | Groq API endpoint already in manifest host_permissions; API key in background only |
| III. User Experience Excellence | PASS | Immediate visual feedback via highlight sync; fallback to paragraph-only gracefully |
| IV. Modular Architecture | PASS | New GroqTimestampProvider follows existing provider pattern; PlaybackSyncState is already modular |
| V. Test Coverage | PASS | Will add contract tests for Groq Whisper API; unit tests for sync logic |

**Gate Result**: PASS - No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/006-robust-audio-highlight-sync/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (Groq Whisper API contract)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
background/
├── background.js           # Main service worker (modify sync integration)
├── playback-sync.js        # MODIFY: Enhanced sync logic with drift correction
├── constants.js            # ADD: Groq-related constants
├── provider-registry.js    # MODIFY: Register Groq timestamp provider
└── providers/
    ├── groq-provider.js    # EXISTS: TTS provider
    └── groq-timestamp-provider.js  # NEW: Whisper timestamp extraction

content/
├── content.js              # MODIFY: Word highlight integration
├── floating-controller.js  # No changes needed
└── text-segment.js         # MODIFY: Word range creation improvements

options/
├── options.html            # MODIFY: Add Groq API key field
└── options.js              # MODIFY: Handle Groq API key storage

tests/
├── contract/
│   └── test-groq-whisper.js  # NEW: Groq Whisper API contract test
└── unit/
    ├── playback-sync.test.js  # MODIFY: Add drift correction tests
    └── groq-timestamp.test.js # NEW: Timestamp extraction tests
```

**Structure Decision**: Browser extension structure - background service worker handles API calls and sync state; content scripts handle DOM highlighting. Follows existing VoxPage architecture.

## Complexity Tracking

> No violations to justify - Constitution Check passed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
