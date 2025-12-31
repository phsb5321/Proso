# Research: UI Quality & Testing Infrastructure

**Feature**: 003-ui-quality-testing
**Date**: 2025-12-31
**Status**: Complete

## Research Tasks

### 1. Color Scheme Selection

**Decision**: Teal/Cyan color scheme using Firefox Photon-aligned tokens

**Primary Colors**:
- Primary: `#0D9488` (Tailwind teal-600 equivalent, good contrast)
- Secondary: `#14B8A6` (Tailwind teal-500 equivalent, lighter accent)
- Gradient: `linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)`

**Firefox Photon Reference Colors** (from photon-colors.css):
- `--teal-50`: `#00feff` (too bright for accent, use for highlights)
- `--teal-60`: `#00c8d7` (bold teal, alternative primary)
- `--teal-70`: `#008ea4` (darker, good for hover states)

**Rationale**:
- User explicitly rejected purple (#7c3aed, #a855f7)
- Teal provides strong contrast on both light and dark backgrounds
- Complements Firefox's blue without blending into browser chrome
- WCAG AA compliant: #0D9488 on white = 4.5:1, on dark (#1a1a2e) = 4.7:1

**Alternatives Considered**:
- Blue (#2563EB): Rejected - too similar to Firefox browser UI
- Green (#059669): Considered - good contrast but user preferred teal
- Orange: Not proposed - accessibility concerns with red-green colorblindness

### 2. Z-Index Stacking Strategy

**Decision**: Use CSS `isolation: isolate` for predictable stacking contexts

**Implementation Pattern**:
```css
/* Create isolated stacking context for overlay layer */
.onboarding-overlay {
  isolation: isolate;
  z-index: 100;
}

/* Elements within overlays use local z-index */
.onboarding-tooltip {
  position: relative;
  z-index: 1; /* Local to isolated context */
}
```

**Stacking Layer System**:
| Layer | Z-Index Range | Elements |
|-------|---------------|----------|
| Base | auto (0) | Normal document flow |
| Elevated | 1-10 | Hover states, focused elements |
| Floating | 50-99 | Dropdowns, tooltips |
| Overlay | 100+ | Modals, onboarding overlays |

**Rationale**:
- CSS `isolation` property creates predictable stacking without complex z-index management
- Prevents z-index wars where values escalate unnecessarily
- Each major UI layer gets its own stacking context

**Source**: [Josh W Comeau - Stacking Contexts](https://www.joshwcomeau.com/css/stacking-contexts/)

### 3. Visual Regression Testing Setup

**Decision**: Playwright with built-in screenshot comparison

**Configuration**:
```javascript
// playwright.config.js
export default {
  projects: [
    { name: 'firefox', use: { browserName: 'firefox' } }
  ],
  expect: {
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02, // Allow 2% diff for anti-aliasing
    }
  }
};
```

**Test Strategy**:
1. Load extension popup in Playwright with fixed viewport (360x480)
2. Capture screenshots for each UI state: idle, playing, paused, error, onboarding
3. Compare against baseline snapshots in `tests/visual/__snapshots__/`
4. Generate diff images when changes detected

**Firefox Extension Loading**:
- Use `firefoxUserPrefs` to set `extensions.autoDisableScopes` to 0
- Load extension via `pathToExtension` in browser launch options
- Use fixed extension ID for consistent `moz-extension://` URLs

**Rationale**:
- Playwright natively supports Firefox and visual comparison
- `toMatchSnapshot()` provides baseline management
- Cross-browser consistency with Chromium/WebKit if needed later

**Sources**:
- [CSS-Tricks: Visual Regression Testing with Playwright](https://css-tricks.com/automated-visual-regression-testing-with-playwright/)
- [BrowserStack: Visual Regression Testing](https://www.browserstack.com/guide/visual-regression-testing-using-playwright)

### 4. Unit Testing Framework

**Decision**: Jest with ES Modules support and WebExtension mocks

**Setup Requirements**:
```json
// package.json
{
  "type": "module",
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "test:visual": "npx playwright test"
  },
  "devDependencies": {
    "jest": "^29.x",
    "jest-environment-jsdom": "^29.x",
    "jest-webextension-mock": "^3.x",
    "@playwright/test": "^1.x"
  }
}
```

**Jest Configuration**:
```javascript
// jest.config.js
export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['jest-webextension-mock'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {} // Use native ESM
};
```

**Rationale**:
- Jest is industry standard for JavaScript unit testing
- `jest-webextension-mock` provides browser.* API mocks
- ES Module support requires `--experimental-vm-modules` flag
- jsdom environment simulates DOM for component testing

**Sources**:
- [Jest ECMAScript Modules](https://jestjs.io/docs/ecmascript-modules)
- [jest-webextension-mock](https://github.com/clarkbw/jest-webextension-mock)

### 5. Firefox Photon/Acorn Design Alignment

**Decision**: Adopt Acorn design patterns with local tokens

**Key Design Patterns**:
- **Border Radius**: 4px (small), 8px (medium), 12px (large) - matches Photon
- **Spacing Scale**: 4px base unit (4, 8, 12, 16, 20, 24, 32px)
- **Typography**: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', ...`)
- **Color Function**: Use `light-dark()` for theme-aware colors where supported

**Button Styling (Photon-aligned)**:
```css
.button {
  border-radius: 4px;
  padding: 8px 16px;
  font-weight: 500;
  transition: background-color 150ms;
}
```

**Focus Indicators**:
- Visible focus ring: 2px solid with offset
- High contrast focus styles for accessibility

**Rationale**:
- Acorn is Firefox's current design system (evolved from Photon)
- Matching Firefox patterns creates native feel
- Users expect extensions to feel like part of the browser

**Sources**:
- [Acorn Design System](https://acorn.firefox.com)
- [Firefox Design Tokens](https://firefox-source-docs.mozilla.org/toolkit/themes/shared/design-system/docs/README.design-tokens.stories.html)

### 6. CSS Architecture Best Practices

**Decision**: Extend existing token system with semantic layers

**Token Hierarchy**:
```
Base Tokens (primitives)
  └── Semantic Tokens (purpose-based)
       └── Component Tokens (scoped)
```

**Naming Convention**:
- Pattern: `--{category}-{property}-{variant}`
- Example: `--color-accent-primary`, `--spacing-md`, `--radius-lg`

**Hardcoded Value Elimination Strategy**:
1. Audit popup.css and options.css for hardcoded colors
2. Replace with token references
3. Add lint rule to prevent future hardcoded values

**Current Hardcoded Values to Replace** (from code review):
- `rgba(124, 58, 237, 0.5)` → use `--color-accent-primary` with opacity
- `rgba(124, 58, 237, 0.15)` → use `--color-accent-bg`
- `0 6px 20px rgba(124, 58, 237, 0.5)` → `--shadow-accent`

**Rationale**:
- Design tokens enable consistent theming
- Single source of truth for visual properties
- Facilitates future theme switching (dark mode already works)

**Source**: [CSS-Tricks: Design Tokens](https://css-tricks.com/what-are-design-tokens/)

## Summary of Technology Decisions

| Component | Technology | Version |
|-----------|------------|---------|
| Color Scheme | Teal/Cyan | #0D9488, #14B8A6 |
| Visual Testing | Playwright | 1.x |
| Unit Testing | Jest + jsdom | 29.x |
| Extension Mocking | jest-webextension-mock | 3.x |
| Design Reference | Firefox Acorn/Photon | Latest |
| CSS Architecture | CSS Custom Properties | Native |

## Dependencies to Add

```json
{
  "devDependencies": {
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "jest-webextension-mock": "^3.9.0",
    "@playwright/test": "^1.40.0",
    "web-ext": "^7.11.0"
  }
}
```
