# Quickstart: UI Quality & Testing Infrastructure

**Feature**: 003-ui-quality-testing
**Branch**: `003-ui-quality-testing`

## Prerequisites

- Node.js 18+ (for testing tools)
- Firefox Developer Edition (recommended for extension testing)
- Git (for branch management)

## Setup

### 1. Install Dependencies

```bash
# From repository root
npm install
```

This installs:
- Jest (unit testing)
- Playwright (visual regression testing)
- jest-webextension-mock (browser API mocking)
- web-ext (Firefox extension linting)

### 2. Install Playwright Browsers

```bash
npx playwright install firefox
```

## Quick Commands

| Task | Command |
|------|---------|
| Run unit tests | `npm test` |
| Run unit tests with coverage | `npm run test:coverage` |
| Run visual regression tests | `npm run test:visual` |
| Update visual baselines | `npm run test:visual:update` |
| Lint extension manifest | `npm run lint` |
| Run all tests | `npm run test:all` |

## File Locations

### Design Tokens
```
styles/tokens.css          # All CSS custom properties
```

### CSS to Modify
```
popup/popup.css            # Popup styles (color changes, z-index fixes)
options/options.css        # Options page styles
```

### Components to Test
```
popup/components/
├── accessibility.js       # Screen reader utilities
├── onboarding.js          # First-run overlay
└── visualizer.js          # Audio visualization
```

### Test Directories
```
tests/
├── unit/                  # Jest component tests
│   ├── accessibility.test.js
│   ├── onboarding.test.js
│   └── visualizer.test.js
└── visual/                # Playwright visual tests
    ├── popup.visual.spec.js
    └── __snapshots__/     # Baseline images
```

## Key Changes

### Color Scheme Update

**Before (Purple)**:
```css
--color-accent-primary: #7c3aed;
--color-accent-secondary: #a855f7;
```

**After (Teal/Cyan)**:
```css
--color-accent-primary: #0D9488;
--color-accent-secondary: #14B8A6;
```

### Z-Index Fixes

Add to overlay containers:
```css
.onboarding-overlay {
  isolation: isolate;
  z-index: 100;
}
```

## Development Workflow

### 1. Make CSS Changes

Edit `styles/tokens.css` for color/spacing tokens, or `popup/popup.css` for component styles.

### 2. Check for Hardcoded Values

```bash
# Find any remaining purple colors
grep -r "#7c3aed\|#a855f7\|rgba(124, 58, 237" popup/ options/ styles/
```

### 3. Verify Contrast Ratios

Use browser DevTools or online tools to verify:
- Text on accent: ≥4.5:1
- Large text on accent: ≥3:1
- UI components: ≥3:1

### 4. Run Tests

```bash
# Unit tests first
npm test

# Then visual tests
npm run test:visual
```

### 5. Update Baselines (if intentional changes)

```bash
npm run test:visual:update
```

## Debugging

### Visual Test Failures

View the HTML report:
```bash
npx playwright show-report
```

### Unit Test Failures

Run with verbose output:
```bash
npm test -- --verbose
```

### Extension Not Loading

1. Check `manifest.json` for errors: `npm run lint`
2. Verify Firefox Developer Edition is installed
3. Check browser console for errors

## Constitution Compliance

This feature complies with all VoxPage constitution principles:

- **Privacy**: No new data collection
- **Security**: No credential handling changes
- **UX**: Improves visual feedback and accessibility
- **Modular**: Token-based theming supports component isolation
- **Testing**: Adds comprehensive test coverage

## Next Steps

After completing this feature:

1. Run `/speckit.tasks` to generate implementation tasks
2. Follow tasks in `specs/003-ui-quality-testing/tasks.md`
3. Create PR when all tests pass
