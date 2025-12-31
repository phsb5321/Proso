# Implementation Plan: Fix Highlight Synchronization

**Branch**: `005-fix-highlight-sync` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-fix-highlight-sync/spec.md`

## Summary

This plan addresses three critical bugs in the text-to-speech highlighting system:
1. **Broken highlighting** - Synchronization between audio playback and text visualization fails
2. **Skipped sections** - Some paragraphs are not highlighted during playback
3. **Missing dual highlighting** - Word-level highlights replace paragraph highlights instead of layering

The fix will ensure reliable paragraph highlighting, implement proper dual-layer highlighting (paragraph + word), maintain <200ms sync latency for paragraphs and <100ms for words, and add smart scroll detection to avoid interrupting user navigation.

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: Web Audio API, CSS Custom Highlight API, browser.storage API
**Storage**: browser.storage.local (existing)
**Testing**: Jest with jest-webextension-mock, Playwright for visual tests
**Target Platform**: Firefox 112+ (Manifest V3 baseline), Firefox 119+ for CSS Highlight API
**Project Type**: Browser Extension (popup, options, content, background scripts)
**Performance Goals**: <200ms paragraph sync latency, <100ms word sync latency in 95% of cases
**Constraints**: No external dependencies beyond TTS providers, offline-capable for cached audio
**Scale/Scope**: Single-user browser extension, handles articles with 100+ paragraphs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Privacy First | ✅ PASS | No new data transmission; all sync logic is local |
| II. Security by Default | ✅ PASS | No new external requests; DOM manipulation uses safe methods (classList, CSS Highlight API) |
| III. User Experience Excellence | ✅ PASS | Feature improves visual feedback; smart scroll respects user intent |
| IV. Modular Architecture | ✅ PASS | Fixes are scoped to existing modules (playback-sync.js, content.js) |
| V. Test Coverage for Critical Paths | ✅ PASS | Unit tests exist for PlaybackSyncState; will add tests for new behaviors |

**Security Constraints Check**:
- API Key Handling: N/A (no changes to key handling)
- External Requests: N/A (no new external requests)
- Content Script Isolation: ✅ Uses safe DOM methods (classList, CSS.highlights API)

**Quality Gates**:
- `web-ext lint`: Will verify before merge
- No console errors: Will verify all highlight states handle gracefully
- Breaking changes to storage: None planned

## Project Structure

### Documentation (this feature)

```text
specs/005-fix-highlight-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (message contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
background/
├── background.js        # Main background script - sync loop integration
├── playback-sync.js     # PlaybackSyncState class - timing calculations
├── constants.js         # Message types and storage keys
└── providers/           # TTS providers (ElevenLabs word timing)

content/
├── content.js           # DOM highlighting, scroll handling
├── floating-controller.js # Playback controls UI
└── text-segment.js      # Text-to-DOM mapping

styles/
├── content.css          # Paragraph + word highlight styles
└── floating-controller.css

tests/
├── unit/
│   ├── playback-sync.test.js
│   └── text-segment.test.js
└── contract/
    └── elevenlabs-timestamps.test.js
```

**Structure Decision**: Browser extension structure with background/, content/, popup/, options/ at root level. This is the existing structure; no changes needed.

## Complexity Tracking

> No constitution violations requiring justification.

N/A - All changes align with existing architecture and constitution principles.
