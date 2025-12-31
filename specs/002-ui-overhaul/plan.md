# Implementation Plan: Premium UI Overhaul

**Branch**: `002-ui-overhaul` | **Date**: 2025-12-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-ui-overhaul/spec.md`

## Summary

Transform VoxPage from a functional TTS extension into a premium, polished browser extension with:
- Real-time audio visualization using Web Audio API's AnalyserNode
- System-aware light/dark theming via CSS custom properties and `prefers-color-scheme`
- Full WCAG 2.1 AA accessibility compliance with keyboard navigation and screen reader support
- Polished micro-interactions with `prefers-reduced-motion` support

All enhancements use native web platform APIs with **zero new dependencies**.

## Technical Context

**Language/Version**: JavaScript ES2022+ (WebExtension Manifest V3)
**Primary Dependencies**: Web Audio API, Canvas API, browser.storage API (all native)
**Storage**: browser.storage.local (existing)
**Testing**: Manual testing + web-ext lint (existing), axe-core for accessibility
**Target Platform**: Firefox 112+ (Manifest V3 baseline)
**Project Type**: Browser extension (popup + options + background)
**Performance Goals**: 200ms popup load, 60fps visualizer animations
**Constraints**: < 50KB popup bundle, no external CDN dependencies
**Scale/Scope**: Single user, local storage only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. Privacy First | **PASS** | No new data collection. Theme follows system preference. No external requests for UI. |
| II. Security by Default | **PASS** | No credential handling changes. All visualization is local. |
| III. User Experience Excellence | **PASS** | Primary focus of this feature - immediate feedback, accessibility, theming. |
| IV. Modular Architecture | **PASS** | New components (visualizer, theme, accessibility) are independent modules. |
| V. Test Coverage | **PASS** | Plan includes accessibility audit and screen reader testing. |

**Quality Gates**:
- ✅ Manifest validation (`web-ext lint`)
- ✅ No console errors - verified via development testing
- ✅ All permissions justified - no new permissions required
- ✅ Storage schema backward compatible - additive `ui` key only

## Project Structure

### Documentation (this feature)

```text
specs/002-ui-overhaul/
├── plan.md              # This file
├── research.md          # Phase 0 output - technical decisions
├── data-model.md        # Phase 1 output - state and entities
├── quickstart.md        # Phase 1 output - implementation guide
├── contracts/           # Phase 1 output
│   └── messages.md      # Message passing contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
popup/
├── popup.html           # Update: ARIA attributes, visualizer canvas
├── popup.css            # Major: CSS custom properties + theming
├── popup.js             # Update: Visualizer, accessibility handlers
└── components/          # New: Modular UI components
    ├── visualizer.js    # Canvas-based audio visualizer
    ├── theme.js         # Theme detection utilities
    └── accessibility.js # ARIA helpers, keyboard navigation

options/
├── options.html         # Update: ARIA attributes
├── options.css          # Major: Align with popup theming
└── options.js           # Update: Accessibility improvements

background/
├── background.js        # Update: Add AnalyserNode, visualizer messages
└── audio-visualizer.js  # New: Audio analysis module

styles/
└── tokens.css           # New: Shared CSS custom properties
```

**Structure Decision**: Extends existing browser extension structure. New `components/` directory for modular UI code. Shared `styles/tokens.css` for design system tokens.

## Complexity Tracking

No constitution violations requiring justification.

| Consideration | Decision | Rationale |
|--------------|----------|-----------|
| Framework vs Vanilla JS | Vanilla JS | Extension popup must be lightweight; React/Vue adds unnecessary bundle size |
| Third-party visualizer | Custom Canvas | wavesurfer.js adds 50KB+; custom solution < 5KB |
| Theming approach | CSS-only | No JS runtime cost; `prefers-color-scheme` handles system detection |

## Design Artifacts Summary

### Research ([research.md](./research.md))

Key decisions:
1. **Audio Visualization**: Web Audio API AnalyserNode + Canvas (no dependencies)
2. **Theming**: CSS custom properties + `prefers-color-scheme` media query
3. **Accessibility**: ARIA attributes + semantic HTML + live regions
4. **Reduced Motion**: `prefers-reduced-motion` CSS media query
5. **Design System**: Custom CSS inspired by Photon (no external package)

### Data Model ([data-model.md](./data-model.md))

Key entities:
- `ThemeConfig`: Light/dark/system preference
- `AudioVisualizerState`: Frequency data and animation state
- `PlaybackState`: Extended with explicit status enum
- `UIState`: Composite popup state

### Contracts ([contracts/messages.md](./contracts/messages.md))

New/extended messages:
- `getVisualizerData`: Request frequency data for visualization
- `visualizerData`: Pushed at 60fps during playback
- Enhanced `error` messages with codes and recovery actions
- Enhanced `progress` with percentage calculation

### Quickstart ([quickstart.md](./quickstart.md))

Implementation phases:
1. **Foundation**: CSS tokens, ARIA attributes, visualizer canvas
2. **Polish**: Theme refinement, contrast compliance, onboarding
3. **Refinement**: Micro-interactions, reduced motion, testing

## Implementation Approach

### Phase 1: Accessibility & Theming Foundation (P1)

**Goal**: Establish accessible foundation and theming system

1. Create `styles/tokens.css` with design tokens
2. Refactor `popup.css` to use CSS custom properties
3. Add light theme via `prefers-color-scheme: light` media query
4. Add ARIA labels and roles to all popup controls
5. Implement keyboard navigation for provider tabs (roving tabindex)
6. Add screen reader live region for status announcements
7. Add `aria-pressed` to play/pause button

**Deliverables**: Themed popup with full keyboard/screen reader support

### Phase 2: Audio Visualization (P1)

**Goal**: Real-time audio feedback during playback

1. Add `AnalyserNode` to background audio pipeline
2. Create `background/audio-visualizer.js` module
3. Add Canvas element to popup HTML
4. Create `popup/components/visualizer.js`
5. Implement message passing for frequency data
6. Handle paused/stopped states with appropriate visuals

**Deliverables**: Working audio visualizer synced to playback

### Phase 3: Options Page & Polish (P2)

**Goal**: Consistent experience across extension pages

1. Apply token system to options page CSS
2. Add ARIA attributes to options controls
3. Implement first-time user tooltip
4. Add API key missing guidance
5. Ensure WCAG 2.1 AA contrast compliance
6. Add `prefers-reduced-motion` support

**Deliverables**: Polished options page, onboarding flow

### Phase 4: Testing & Verification (P3)

**Goal**: Validate all requirements

1. Run axe-core accessibility audit
2. Manual screen reader testing (NVDA, VoiceOver)
3. Keyboard-only navigation testing
4. Performance profiling (popup load time)
5. Cross-theme contrast verification
6. Document any issues and fixes

**Deliverables**: Audit reports, verified compliance

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Web Audio API unavailable | Low | Medium | Graceful degradation - hide visualizer |
| Screen reader inconsistencies | Medium | Medium | Test multiple screen readers, follow ARIA best practices |
| CSS custom property browser support | Low | Low | Firefox 112+ has full support |
| Performance impact of visualizer | Low | High | Use `requestAnimationFrame`, throttle if needed |

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Popup load time | < 200ms | Performance.timing API |
| Keyboard accessible controls | 100% | Manual testing |
| WCAG 2.1 AA compliance | 100% | axe-core audit |
| Visualizer frame rate | 60fps | DevTools performance tab |
| New dependencies | 0 | Package audit |

## Next Steps

Run `/speckit.tasks` to generate the task breakdown from this plan.
