# Implementation Plan: Playback Sync & Highlight

**Branch**: `004-playback-sync-highlight` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-playback-sync-highlight/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement audio-text synchronization and a floating playback controller for VoxPage. The core problem is that TTS audio plays content that doesn't match highlighted text, and users lose playback controls when they close the popup. The solution involves:
1. A floating controller injected into web pages that persists independently of the popup
2. Accurate paragraph-level highlighting synchronized within 200ms of audio
3. Word-level highlighting (when provider supports timestamps) synchronized within 100ms
4. Progress indication and click-to-seek functionality

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: Web Audio API, browser.storage API, browser.runtime messaging, CSS Custom Highlight API
**Storage**: browser.storage.local for controller position persistence
**Testing**: Jest (unit), Playwright (visual/integration)
**Target Platform**: Firefox 109+ (Gecko WebExtension, per constitution)
**Project Type**: Browser Extension (content script + background + popup)
**Performance Goals**: 200ms paragraph sync latency, 100ms word sync latency, 60fps UI animations
**Constraints**: Must not interfere with page content, handle dynamic DOM changes, graceful degradation without word timing
**Scale/Scope**: Single-tab playback, typical article length (1-50 paragraphs)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Single Responsibility | ✅ PASS | Floating controller is isolated component; sync logic separate from UI |
| Minimal Dependencies | ✅ PASS | Uses only browser-native APIs (no external libraries) |
| Performance Budget | ✅ PASS | 200ms/100ms latency targets are achievable with requestAnimationFrame |
| Graceful Degradation | ✅ PASS | Falls back to paragraph-only when word timing unavailable |
| User Privacy | ✅ PASS | All state stored locally; no external data transmission |

**No violations detected. Proceeding to Phase 0 research.**

## Project Structure

### Documentation (this feature)

```text
specs/004-playback-sync-highlight/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── messages.contract.md
│   └── floating-controller.contract.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Browser Extension structure (existing)
background/
├── background.js        # Modify: Add word timing support, sync coordination
├── constants.js         # Modify: Add new message types
├── providers/           # Modify: Add timestamp API support for ElevenLabs
│   └── elevenlabs-provider.js
└── playback-sync.js     # NEW: Sync state management

content/
├── content.js           # Modify: Add floating controller injection, word highlighting
├── floating-controller.js  # NEW: Floating playback UI component
└── text-segment.js      # NEW: Text-to-DOM mapping with word boundaries

styles/
├── content.css          # Modify: Add floating controller styles
├── floating-controller.css  # NEW: Controller-specific styles
└── tokens.css           # Existing design tokens

popup/
├── popup.js             # Modify: Communicate with floating controller
└── popup.css            # Existing styles

tests/
├── unit/
│   ├── playback-sync.test.js     # NEW
│   ├── floating-controller.test.js  # NEW
│   └── text-segment.test.js      # NEW
└── visual/
    └── floating-controller.visual.spec.js  # NEW
```

**Structure Decision**: Browser Extension structure - content scripts inject the floating controller into web pages, background script coordinates playback state, popup communicates with both via browser.runtime messaging.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations - complexity tracking not required.
