# Implementation Plan: Real-Time TTS API Integration

**Branch**: `001-realtime-tts-api` | **Date**: 2025-12-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-realtime-tts-api/spec.md`

## Summary

Enhance VoxPage's TTS system to support real-time streaming audio with paragraph-level
synchronization. The current implementation generates audio per-paragraph but lacks
streaming for long content and doesn't cache audio segments. This plan adds streaming
audio generation, session-based caching, cost estimation, and an optional Cartesia
provider for lowest-latency real-time sync.

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: Web Audio API, Fetch API with streaming, browser.storage API
**Storage**: browser.storage.local for settings/keys, in-memory Map for audio cache
**Testing**: web-ext lint for manifest, manual testing in Firefox Developer Edition
**Target Platform**: Firefox 109+ (Manifest V3 baseline)
**Project Type**: Browser Extension (background worker, content scripts, popup UI)
**Performance Goals**: <500ms time-to-first-audio, <200ms highlight sync accuracy
**Constraints**: No external build tools, vanilla JS only, <5MB total extension size
**Scale/Scope**: Single user, ~50 paragraphs per session max cached

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| I. Privacy First | Data stored locally, only sent to selected provider | PASS | API keys in storage.local, text sent only on user action |
| II. Security by Default | HTTPS only, keys in storage.local, not in content scripts | PASS | All API calls from background worker |
| III. User Experience | Immediate feedback, accessible controls, error messages | PASS | Progress indicator, cost estimate, clear errors |
| IV. Modular Architecture | Providers as independent modules with common interface | PASS | New provider module pattern from existing code |
| V. Test Coverage | Contract tests for providers, unit tests for extraction | PARTIAL | Tests recommended but not blocking for MVP |

**Security Constraints Compliance:**
- API Key Handling: Keys stored in browser.storage.local, never logged, background-only
- External Requests: Cartesia endpoint will be added to manifest.json host_permissions
- Content Script Isolation: Content scripts only handle highlighting, no API access

## Project Structure

### Documentation (this feature)

```text
specs/001-realtime-tts-api/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── openai-tts.md
│   ├── elevenlabs-tts.md
│   └── cartesia-tts.md
└── checklists/
    └── requirements.md  # Validation checklist
```

### Source Code (repository root)

```text
background/
├── background.js        # Main service worker (existing, enhance)
├── providers/           # NEW: TTS provider modules
│   ├── base-provider.js
│   ├── openai-provider.js
│   ├── elevenlabs-provider.js
│   ├── cartesia-provider.js
│   └── browser-provider.js
├── audio-cache.js       # NEW: Session audio segment cache
└── cost-estimator.js    # NEW: Per-provider cost calculation

content/
└── content.js           # Existing (minor enhancement for sync)

popup/
├── popup.html           # Existing (add cost display, provider info)
├── popup.js             # Existing (enhance for streaming state)
└── popup.css            # Existing (styling for new elements)

options/
├── options.html         # Existing (add Cartesia API key field)
├── options.js           # Existing (handle new provider)
└── options.css          # Existing

manifest.json            # Add Cartesia host permission
```

**Structure Decision**: Browser Extension structure with new `providers/` subdirectory
for modular TTS implementations. Single-file providers follow common interface.

## Complexity Tracking

> No constitution violations requiring justification.

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| Separate provider files | Follows Constitution IV (Modular Architecture) | Inline in background.js - rejected for testability |
| In-memory cache only | Simpler, no storage quota concerns | IndexedDB - rejected, overkill for session cache |
| Paragraph-level granularity | Spec assumption, balances sync precision with API efficiency | Word-level - rejected, requires speech marks/timing data not available from all providers |
