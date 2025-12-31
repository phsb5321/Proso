# Implementation Plan: UI Quality & Testing Infrastructure

**Branch**: `003-ui-quality-testing` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-ui-quality-testing/spec.md`

## Summary

This feature addresses critical UI quality issues in VoxPage: fixing z-index stacking problems (icons floating above overlays), replacing the disliked purple color scheme with Teal/Cyan (#0D9488, #14B8A6), aligning with Firefox Photon design patterns, and establishing testing infrastructure (visual regression with Playwright, unit tests with Jest). The goal is to create a maintainable, accessible, and visually polished extension UI.

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: Native Web APIs (CSS Custom Properties, Web Audio API, Canvas API, browser.storage API)
**Storage**: browser.storage.local (existing)
**Testing**: Jest (unit tests), Playwright (visual regression + extension testing)
**Target Platform**: Firefox 109+ (Manifest V3 baseline)
**Project Type**: Browser Extension (popup, options, content script, background)
**Performance Goals**: Popup renders in <100ms, no jank during playback visualization
**Constraints**: Max popup size 800x600, WCAG AA compliance (4.5:1 contrast), reduced motion support
**Scale/Scope**: Single extension with ~15 UI components across popup/options pages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Assessment |
|-----------|--------|------------|
| I. Privacy First | PASS | No new data collection; UI changes are purely visual/local |
| II. Security by Default | PASS | No new external requests; testing runs locally in dev |
| III. User Experience Excellence | PASS | Core goal: improve UI feedback, accessibility, visual polish |
| IV. Modular Architecture | PASS | Design tokens enable modular theming; tests isolate components |
| V. Test Coverage for Critical Paths | PASS | This feature explicitly adds test coverage for UI components |

**Quality Gates Check**:
- Manifest validation: Will verify with `web-ext lint` after changes
- No console errors: Visual testing will catch rendering errors
- Permission justification: No new permissions required
- Storage migration: No schema changes (styling only)

## Project Structure

### Documentation (this feature)

```text
specs/003-ui-quality-testing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (design tokens schema)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CSS token contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Browser Extension Structure
background/
├── background.js        # Service worker
├── providers/           # TTS provider implementations
├── audio-*.js           # Audio handling modules
└── *.js                 # Utility modules

popup/
├── popup.html           # Popup markup
├── popup.css            # Popup styles (to be refactored)
├── popup.js             # Popup logic
└── components/          # UI component modules
    ├── accessibility.js
    ├── onboarding.js
    └── visualizer.js

options/
├── options.html         # Settings page markup
├── options.css          # Settings page styles
└── options.js           # Settings logic

content/
└── content.js           # Content script

styles/
├── tokens.css           # Design tokens (to be updated)
└── content.css          # Content script styles

tests/
├── contract/            # Existing provider tests
├── unit/                # NEW: Component unit tests
└── visual/              # NEW: Playwright visual tests
```

**Structure Decision**: Extend existing browser extension structure. Add `tests/unit/` for Jest component tests and `tests/visual/` for Playwright visual regression tests. Package.json will be added for test tooling.

## Complexity Tracking

No constitution violations detected. All changes align with existing principles:
- Privacy: No new data transmission
- Security: No credential handling changes
- UX: Explicit improvement goal
- Modular: Token-based theming supports modularity
- Testing: Explicit test coverage addition
