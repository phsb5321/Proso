# Testing Contract

**Version**: 1.0.0
**Feature**: 003-ui-quality-testing

## Overview

This contract defines the testing requirements and interfaces for VoxPage UI quality assurance. It covers both visual regression testing (Playwright) and unit testing (Jest).

## Visual Regression Testing

### Test Environment

| Property | Value |
|----------|-------|
| Framework | Playwright Test |
| Browser | Firefox (primary) |
| Viewport | 360 x 480 (popup dimensions) |
| Baseline Directory | `tests/visual/__snapshots__/` |
| Diff Threshold | 2% pixel difference allowed |

### Required Test Cases

#### Popup States

| Test Name | UI State | Color Scheme | Screenshot Name |
|-----------|----------|--------------|-----------------|
| `popup-idle-dark` | Idle (no playback) | Dark | `popup-idle-dark.png` |
| `popup-idle-light` | Idle (no playback) | Light | `popup-idle-light.png` |
| `popup-playing-dark` | Playing (visualizer active) | Dark | `popup-playing-dark.png` |
| `popup-paused-dark` | Paused | Dark | `popup-paused-dark.png` |
| `popup-error-dark` | Error banner shown | Dark | `popup-error-dark.png` |
| `popup-onboarding-dark` | Onboarding overlay | Dark | `popup-onboarding-dark.png` |

### Test Interface

```javascript
// tests/visual/popup.visual.spec.js

import { test, expect } from '@playwright/test';

test.describe('Popup Visual Regression', () => {
  test.beforeEach(async ({ context }) => {
    // Load extension
    await context.addInitScript(() => {
      // Mock browser.storage if needed
    });
  });

  test('idle state matches baseline', async ({ page }) => {
    await page.goto('moz-extension://[extension-id]/popup/popup.html');
    await expect(page).toHaveScreenshot('popup-idle-dark.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('onboarding overlay covers content', async ({ page }) => {
    // Force onboarding state
    await page.evaluate(() => {
      localStorage.setItem('hasSeenOnboarding', 'false');
    });
    await page.reload();
    await expect(page).toHaveScreenshot('popup-onboarding-dark.png');
  });
});
```

### Configuration Contract

```javascript
// playwright.config.js

export default {
  testDir: './tests/visual',
  fullyParallel: true,
  reporter: 'html',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        viewport: { width: 360, height: 480 },
        // Extension loading
        launchOptions: {
          firefoxUserPrefs: {
            'extensions.autoDisableScopes': 0,
          },
        },
      },
    },
  ],
  expect: {
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
};
```

---

## Unit Testing

### Test Environment

| Property | Value |
|----------|-------|
| Framework | Jest 29.x |
| Environment | jsdom |
| Extension Mocks | jest-webextension-mock |
| Coverage Target | 70% statements |

### Required Test Suites

#### Component Tests

| Component | Test File | Required Coverage |
|-----------|-----------|-------------------|
| `accessibility.js` | `tests/unit/accessibility.test.js` | 70% |
| `onboarding.js` | `tests/unit/onboarding.test.js` | 70% |
| `visualizer.js` | `tests/unit/visualizer.test.js` | 70% |

### Test Interface

```javascript
// tests/unit/accessibility.test.js

import { announceToScreenReader, focusTrap } from '../../popup/components/accessibility.js';

describe('Accessibility Component', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="srAnnouncer" aria-live="polite"></div>
      <div class="container"></div>
    `;
  });

  describe('announceToScreenReader', () => {
    test('updates live region with message', () => {
      announceToScreenReader('Playing audio');
      const announcer = document.getElementById('srAnnouncer');
      expect(announcer.textContent).toBe('Playing audio');
    });

    test('clears message after delay', async () => {
      jest.useFakeTimers();
      announceToScreenReader('Test message');
      jest.advanceTimersByTime(1000);
      const announcer = document.getElementById('srAnnouncer');
      expect(announcer.textContent).toBe('');
    });
  });
});
```

### Configuration Contract

```javascript
// jest.config.js

export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['jest-webextension-mock'],
  testMatch: ['**/tests/unit/**/*.test.js'],
  collectCoverageFrom: [
    'popup/components/**/*.js',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {},
};
```

---

## Package.json Contract

```json
{
  "name": "voxpage",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "test:coverage": "node --experimental-vm-modules node_modules/.bin/jest --coverage",
    "test:visual": "npx playwright test",
    "test:visual:update": "npx playwright test --update-snapshots",
    "lint": "web-ext lint",
    "test:all": "npm run test && npm run test:visual"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "jest-webextension-mock": "^3.9.0",
    "@playwright/test": "^1.40.0",
    "web-ext": "^7.11.0"
  }
}
```

---

## CI/CD Integration (Future)

```yaml
# .github/workflows/test.yml (reference only)
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:coverage
      - run: npx playwright install firefox
      - run: npm run test:visual
```

---

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Unit Test Coverage | ≥70% | Jest coverage report |
| Visual Tests Passing | 100% | Playwright exit code |
| Visual Diff Threshold | ≤2% | maxDiffPixelRatio |
| Test Execution Time | <60s | Total test runtime |

## Failure Modes

| Failure | Response |
|---------|----------|
| Visual diff >2% | Review screenshot, update baseline if intentional |
| Unit test <70% coverage | Add tests for uncovered code paths |
| Test timeout | Increase timeout or optimize test |
| Extension load failure | Check manifest.json, verify extension ID |
