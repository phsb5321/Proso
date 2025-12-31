# Implementation Plan: Architecture Refactor & Code Quality Improvement

**Branch**: `008-architecture-refactor` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-architecture-refactor/spec.md`

## Summary

Refactor the VoxPage Firefox extension to split two monolithic files (background.js at 1,215 lines and content.js at 1,126 lines) into focused modules of ≤300 lines each. The refactoring uses a gradual file-by-file approach with test validation after each split, and introduces lightweight static analysis tooling for circular dependency detection and code duplication measurement.

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: None (pure JS + Web APIs); dev: Jest 29.x, Playwright, web-ext 7.x
**Storage**: browser.storage.local (unchanged)
**Testing**: Jest (unit), Playwright (visual), manual verification
**Target Platform**: Firefox 109+ (Manifest V3 baseline)
**Project Type**: Browser extension (background service worker + content scripts + popup)
**Performance Goals**: No runtime performance regression; identical playback behavior
**Constraints**: ≤300 lines per file; no circular dependencies; no bundler; backward compatible
**Scale/Scope**: ~8,400 lines production code → modularized across ~25-30 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Privacy First | ✅ PASS | No changes to data handling; storage APIs unchanged |
| II. Security by Default | ✅ PASS | No changes to API key handling; message passing unchanged |
| III. User Experience Excellence | ✅ PASS | No UI changes; identical user-facing behavior required |
| IV. Modular Architecture | ✅ PASS | **This refactor directly implements this principle** |
| V. Test Coverage for Critical Paths | ✅ PASS | All existing tests must pass; gradual approach enables validation |

**Quality Gates**:
- ✅ Manifest validation via `web-ext lint` (unchanged)
- ✅ No new permissions required
- ✅ No storage schema changes (FR-018)
- ✅ Browser compatibility: Firefox 109+ (unchanged)

**Constitution Compliance**: All principles satisfied. No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/008-architecture-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (module dependency model)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (message protocol documentation)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Current structure (before refactor)
background/
├── background.js          # 1,215 lines - TO BE SPLIT
├── playback-sync.js       # 698 lines - OK (focused)
├── audio-cache.js         # 190 lines - OK
├── audio-visualizer.js    # 315 lines - BORDERLINE
├── provider-registry.js   # 182 lines - OK
├── constants.js           # 148 lines - OK
├── audio-segment.js       # 94 lines - OK
├── cost-estimator.js      # 96 lines - OK
└── providers/             # OK (each <300 lines)

content/
├── content.js             # 1,126 lines - TO BE SPLIT
├── floating-controller.js # 669 lines - TO BE SPLIT (300+ inline CSS)
└── text-segment.js        # 325 lines - BORDERLINE

popup/
├── popup.js               # 652 lines - TO BE SPLIT
└── components/            # OK

# Target structure (after refactor)
background/
├── index.js               # Entry point, imports all modules
├── message-router.js      # Centralized message handling
├── playback-controller.js # Playback orchestration
├── audio-generator.js     # TTS API calls, queue management
├── ui-coordinator.js      # Popup/controller UI state sync
├── playback-sync.js       # Unchanged (already focused)
├── audio-cache.js         # Unchanged
├── audio-visualizer.js    # Unchanged (borderline OK)
├── provider-registry.js   # Unchanged
├── constants.js           # Unchanged (+ message docs)
├── audio-segment.js       # Unchanged
├── cost-estimator.js      # Unchanged
└── providers/             # Unchanged

content/
├── index.js               # Entry point
├── content-extractor.js   # Text extraction logic
├── content-scorer.js      # Heuristic scoring for article detection
├── highlight-manager.js   # Paragraph and word highlighting
├── floating-controller.js # Slimmed down (CSS extracted)
└── text-segment.js        # Unchanged (borderline OK)

popup/
├── index.js               # Entry point
├── popup-controller.js    # Event handling, state management
├── popup-ui.js            # DOM manipulation, rendering
└── components/            # Unchanged

shared/
├── message-types.js       # Shared message type definitions
└── dom-utils.js           # Shared DOM utilities

styles/
├── floating-controller.css # Extracted from JS
├── content.css            # Unchanged
└── tokens.css             # Unchanged
```

**Structure Decision**: Browser extension structure with background service worker, content scripts, and popup. Adding `shared/` directory for cross-context utilities. Extracting inline CSS from floating-controller.js to styles/.

## Complexity Tracking

No constitution violations. Table not required.
