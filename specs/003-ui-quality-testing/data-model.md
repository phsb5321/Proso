# Data Model: UI Quality & Testing Infrastructure

**Feature**: 003-ui-quality-testing
**Date**: 2025-12-31

## Overview

This feature primarily deals with CSS tokens (design system values) and test configurations. No persistent data storage changes are required as this is a UI/testing enhancement.

## Entities

### 1. Design Token System

Design tokens are stored as CSS custom properties in `styles/tokens.css`. This is not a database model but a structured configuration.

**Token Categories**:

```yaml
DesignTokens:
  colors:
    # Background colors
    bg-primary: string (CSS color)
    bg-secondary: string (CSS color)
    bg-tertiary: string (CSS color)

    # Text colors
    text-primary: string (CSS color)
    text-secondary: string (CSS color)
    text-muted: string (CSS color)

    # Accent colors (NEW: Teal/Cyan)
    accent-primary: string (CSS color) # #0D9488
    accent-secondary: string (CSS color) # #14B8A6
    accent-gradient: string (CSS gradient)
    accent-bg: string (CSS color with opacity)

    # Semantic colors
    success: string (CSS color)
    warning: string (CSS color)
    error: string (CSS color)
    info: string (CSS color)

    # UI colors
    border: string (CSS color)
    focus-ring: string (CSS color)
    button-bg: string (CSS color)
    button-bg-hover: string (CSS color)
    input-bg: string (CSS color)
    input-border: string (CSS color)

  spacing:
    xs: 4px
    sm: 8px
    md: 12px
    lg: 16px
    xl: 20px
    2xl: 24px
    3xl: 32px

  typography:
    font-family: string (font stack)
    font-size-xs: 0.625rem
    font-size-sm: 0.75rem
    font-size-md: 0.875rem
    font-size-lg: 1rem
    font-size-xl: 1.25rem
    font-weight-normal: 400
    font-weight-medium: 500
    font-weight-semibold: 600
    font-weight-bold: 700
    line-height-tight: 1.25
    line-height-normal: 1.5
    line-height-relaxed: 1.75

  radii:
    sm: 6px
    md: 10px
    lg: 16px
    full: 9999px

  shadows:
    sm: string (box-shadow)
    md: string (box-shadow)
    lg: string (box-shadow)
    accent: string (box-shadow with accent color)

  animation:
    transition-fast: 100ms
    transition-normal: 200ms
    transition-slow: 300ms
    ease-default: ease
    ease-in-out: ease-in-out
    ease-out: ease-out

  dimensions:
    min-touch-target: 44px
    popup-width: 360px
    popup-min-height: 480px
```

### 2. Stacking Context Layers

Defines z-index ranges for predictable element layering.

```yaml
StackingLayers:
  base:
    z-index: auto (0)
    elements: [document-flow, static-elements]

  elevated:
    z-index: 1-10
    elements: [hover-states, focus-rings, selected-items]

  floating:
    z-index: 50-99
    elements: [dropdowns, tooltips, popovers]

  overlay:
    z-index: 100+
    elements: [modals, onboarding-overlay, status-banners]
```

### 3. Visual Test Baseline

Configuration for visual regression test baselines (not stored in database).

```yaml
VisualTestBaseline:
  name: string # e.g., "popup-idle-dark"
  viewport:
    width: number # 360
    height: number # 480
  colorScheme: enum [light, dark]
  uiState: enum [idle, playing, paused, error, onboarding]
  snapshotPath: string # tests/visual/__snapshots__/{name}.png
  threshold: number # 0.02 (2% pixel diff allowed)
```

### 4. Component Test Coverage

Tracks unit test coverage targets (configuration, not persistent).

```yaml
TestCoverage:
  component: string # e.g., "accessibility.js"
  targetCoverage: number # 70 (percent)
  testFile: string # tests/unit/accessibility.test.js
  functions:
    - name: string
      tested: boolean
```

## State Transitions

### UI State Machine

The popup UI has defined states that affect visual testing:

```
┌─────────┐
│  idle   │──────play────►┌─────────┐
└─────────┘               │ playing │
     ▲                    └────┬────┘
     │                         │
   stop                      pause
     │                         │
     │    ┌─────────┐          ▼
     └────┤ paused  │◄─────────┘
          └─────────┘
               │
             error
               │
               ▼
          ┌─────────┐
          │  error  │
          └─────────┘
```

**Visual Test States**:
- `idle`: Initial state, no audio playing
- `playing`: Audio playing, visualizer active
- `paused`: Audio paused, visualizer frozen
- `error`: Error banner displayed
- `onboarding`: First-run overlay shown

## Validation Rules

### Color Contrast Validation

All color combinations must pass WCAG AA:

```yaml
ContrastRules:
  normal-text:
    min-ratio: 4.5
    applies-to: [text-primary, text-secondary, text-muted]

  large-text:
    min-ratio: 3.0
    applies-to: [headings, buttons]

  ui-components:
    min-ratio: 3.0
    applies-to: [borders, icons, focus-rings]
```

### Token Usage Validation

```yaml
TokenValidation:
  no-hardcoded-colors:
    pattern: "#[0-9a-fA-F]{3,8}|rgb|rgba|hsl|hsla"
    allowed-in: [tokens.css]
    forbidden-in: [popup.css, options.css, content.css]

  no-hardcoded-spacing:
    pattern: "\\d+px"
    exceptions: [border-width, line-height]
```

## Relationships

```
┌─────────────────┐
│  tokens.css     │
│  (Design Tokens)│
└────────┬────────┘
         │ imports
         ▼
┌─────────────────┐     ┌─────────────────┐
│   popup.css     │────►│  Popup UI       │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Visual Tests    │
                        │ (Playwright)    │
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│  components/    │────►│  Unit Tests     │
│  *.js           │     │  (Jest)         │
└─────────────────┘     └─────────────────┘
```

## Migration Notes

No database migrations required. CSS token changes are applied by:
1. Updating `styles/tokens.css` with new teal/cyan colors
2. Replacing hardcoded purple values in CSS files
3. Regenerating visual test baselines after color change

## File Locations

| Entity | File Location |
|--------|---------------|
| Design Tokens | `styles/tokens.css` |
| Stacking Rules | `popup/popup.css` (z-index definitions) |
| Visual Baselines | `tests/visual/__snapshots__/` |
| Test Config | `jest.config.js`, `playwright.config.js` |
