# Firefox Extension Testing Strategy

Research document for VoxPage testing best practices.

**Last Updated:** 2026-01-09  
**Status:** Research Complete

## Table of Contents

1. [Playwright Firefox Testing](#1-playwright-firefox-testing)
2. [E2E Test Patterns for Extensions](#2-e2e-test-patterns-for-extensions)
3. [Visual Regression Testing](#3-visual-regression-testing)
4. [Flakiness Control](#4-flakiness-control)
5. [Firefox-Specific Challenges](#5-firefox-specific-challenges)
6. [CI/CD Integration](#6-cicd-integration)
7. [VoxPage Recommendations](#7-voxpage-recommendations)

---

## 1. Playwright Firefox Testing

### 1.1 Setting Up Playwright with Firefox

Playwright supports Firefox out of the box, but uses a **patched version** of Firefox (not the branded release).

```bash
# Install Playwright with Firefox
npx playwright install firefox
npx playwright install-deps firefox
```

**Key Limitation:** Playwright's Firefox differs from standard Firefox—it includes patches for automation. Visual and functional behavior may differ slightly from production Firefox.

```javascript
// playwright.config.js - Firefox project setup
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'extensions.autoDisableScopes': 0,
            'devtools.debugger.remote-enabled': true,
          },
        },
      },
    },
  ],
});
```

### 1.2 Loading Extensions in Firefox via Playwright

**Critical Limitation:** Playwright does **NOT** support loading extensions in Firefox the way it does for Chromium.

| Feature | Chromium | Firefox |
|---------|----------|---------|
| `--load-extension` flag | ✅ Yes | ❌ No |
| `launchPersistentContext` with extensions | ✅ Yes | ❌ No |
| Extension service worker access | ✅ Yes | ❌ No |
| `chrome-extension://` URLs | ✅ Yes | ❌ No (uses `moz-extension://`) |

From [Playwright docs](https://playwright.dev/docs/chrome-extensions):
> Extensions only work in Chromium when launched with a persistent context.

### 1.3 Alternatives for Firefox Extension Testing

#### Option A: web-ext (Recommended for Firefox)

Mozilla's official tool for extension development and testing:

```bash
# Install web-ext
npm install --global web-ext

# Run extension in Firefox
web-ext run --source-dir ./extension --firefox-binary $(which firefox)

# Run with specific profile
web-ext run --firefox-profile=./test-profile --keep-profile-changes
```

**web-ext + Playwright hybrid approach:**
1. Use `web-ext run` to start Firefox with extension loaded
2. Connect Playwright to the running browser using CDP or remote debugging
3. Run E2E tests against the browser with extension active

#### Option B: Selenium WebDriver with GeckoDriver

```javascript
const { Builder, Browser } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');

const options = new firefox.Options();
options.addExtensions('./extension.xpi');
options.setPreference('xpinstall.signatures.required', false);

const driver = await new Builder()
  .forBrowser(Browser.FIREFOX)
  .setFirefoxOptions(options)
  .build();
```

#### Option C: Firefox Marionette Protocol

Direct browser automation via Marionette (Firefox's native automation protocol):

```python
# Python example
from marionette_driver.marionette import Marionette

client = Marionette(host='localhost', port=2828)
client.start_session()
client.install_addon('/path/to/extension.xpi', temp=True)
```

### 1.4 VoxPage Current Approach (Recommended)

VoxPage currently uses a **dual-browser strategy**:

| Test Type | Browser | Rationale |
|-----------|---------|-----------|
| Extension E2E | Chromium | Full extension loading support via Playwright |
| Visual regression | Firefox | Uses CSS-only tests without extension |
| Firefox E2E | Firefox | Static file checks, no full extension loading |

This approach is correct given Playwright's limitations.

---

## 2. E2E Test Patterns for Extensions

### 2.1 Testing Content Script Injection

**Pattern: Wait for injection marker**

```typescript
// tests/e2e/extension/content-injection.spec.ts
import { test, expect } from './fixtures/extension.fixture';

test('content script injects on page load', async ({ extensionPage }) => {
  await extensionPage.goto('https://example.com');
  
  // Wait for content script marker
  const injected = await extensionPage.waitForSelector(
    '[data-voxpage-injected]',
    { timeout: 5000, state: 'attached' }
  );
  
  expect(injected).toBeTruthy();
});
```

**Pattern: Verify DOM modifications**

```typescript
test('content script adds footer element', async ({ extensionPage }) => {
  await extensionPage.goto('https://example.com/article');
  
  // Content script should add footer
  await expect(extensionPage.locator('.voxpage-footer')).toBeVisible();
  
  // Footer should have play button
  await expect(extensionPage.locator('.voxpage-play-btn')).toBeEnabled();
});
```

### 2.2 Testing Background Script Functionality

**Pattern: Use service worker URL to verify extension loaded**

```typescript
// From VoxPage extension.fixture.ts
extensionId: async ({ context }, use) => {
  let serviceWorker = context.serviceWorkers()[0];
  
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', {
      timeout: 30000,
    });
  }
  
  // Extract ID from URL: chrome-extension://<id>/background.js
  const extensionId = serviceWorker.url().split('/')[2];
  await use(extensionId);
},
```

**Pattern: Test message passing**

```typescript
test('background script responds to messages', async ({ extensionPage, extensionId }) => {
  // Navigate to page with content script
  await extensionPage.goto('https://example.com');
  
  // Trigger action that sends message to background
  await extensionPage.click('.voxpage-play-btn');
  
  // Verify response (e.g., audio state change)
  await expect(extensionPage.locator('[data-playing="true"]')).toBeVisible();
});
```

### 2.3 Testing Popup/Options Pages

**Pattern: Direct navigation to extension pages**

```typescript
test('popup displays correctly', async ({ context, extensionId }) => {
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  
  // Verify popup UI elements
  await expect(popupPage.locator('.popup-container')).toBeVisible();
  await expect(popupPage.locator('.settings-btn')).toBeEnabled();
});

test('settings page saves preferences', async ({ context, extensionId }) => {
  const settingsPage = await context.newPage();
  await settingsPage.goto(`chrome-extension://${extensionId}/settings.html`);
  
  // Change a setting
  await settingsPage.selectOption('#voice-select', 'en-US-female');
  await settingsPage.click('#save-btn');
  
  // Verify persistence
  await settingsPage.reload();
  await expect(settingsPage.locator('#voice-select')).toHaveValue('en-US-female');
});
```

### 2.4 Testing PDF Viewer Interactions

VoxPage has specific PDF handling. Test patterns:

```typescript
test('PDF content extraction works', async ({ extensionPage }) => {
  // Navigate to PDF
  await extensionPage.goto('https://example.com/sample.pdf');
  
  // Wait for PDF.js viewer to load
  await extensionPage.waitForSelector('.pdfViewer', { timeout: 10000 });
  
  // Wait for VoxPage to process PDF
  await extensionPage.waitForSelector('.voxpage-pdf-ready', { timeout: 15000 });
  
  // Verify text extraction worked
  const textContent = await extensionPage.locator('.voxpage-extracted-text').textContent();
  expect(textContent).toContain('Expected PDF text');
});
```

**PDF wait conditions:**
- Wait for `canvas` elements to render
- Wait for text layer to populate
- Use `page.waitForLoadState('networkidle')` for PDF resources

---

## 3. Visual Regression Testing

### 3.1 Playwright Visual Comparison

```typescript
import { test, expect } from '@playwright/test';

test('hover state styling', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await setupTestPage(page);
  
  await page.hover('#paragraph-1');
  
  await expect(page).toHaveScreenshot('hover-state-light.png', {
    maxDiffPixelRatio: 0.02, // 2% tolerance
  });
});
```

### 3.2 Snapshot Configuration

```javascript
// playwright.config.js
export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2, // Per-pixel threshold
    },
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  
  // Consistent viewport for snapshots
  use: {
    viewport: { width: 800, height: 600 },
  },
});
```

### 3.3 Cross-Platform Visual Consistency

**Problem:** Screenshots differ between OS/browser combinations due to:
- Font rendering differences
- Anti-aliasing variations
- System color profiles
- Subpixel rendering

**Solutions:**

1. **Use stylePath to hide volatile elements:**

```css
/* screenshot.css - Applied during screenshots */
.dynamic-timestamp,
.animation-element,
iframe {
  visibility: hidden !important;
}

/* Force consistent font rendering */
* {
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
}
```

```typescript
await expect(page).toHaveScreenshot('test.png', {
  stylePath: './screenshot.css',
});
```

2. **Disable animations:**

```typescript
// VoxPage pattern from tests/helpers/disable-animations.js
export async function disableAnimations(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}
```

3. **Generate snapshots in consistent environment:**
   - Use Docker container for CI snapshots
   - Same container version for local updates
   - Document platform in snapshot filenames

### 3.4 Handling Dynamic Content

**Pattern: Mask dynamic regions**

```typescript
await expect(page).toHaveScreenshot('page.png', {
  mask: [
    page.locator('.timestamp'),
    page.locator('.user-avatar'),
    page.locator('.random-ad'),
  ],
});
```

**Pattern: Wait for layout stability**

```typescript
// VoxPage pattern
export async function waitForLayoutStable(page, selector, stableMs = 50) {
  const element = page.locator(selector);
  let lastBox = null;
  let stableCount = 0;
  
  while (stableCount < 3) {
    const box = await element.boundingBox();
    if (box && lastBox && 
        box.x === lastBox.x && 
        box.y === lastBox.y && 
        box.width === lastBox.width && 
        box.height === lastBox.height) {
      stableCount++;
    } else {
      stableCount = 0;
    }
    lastBox = box;
    await page.waitForTimeout(stableMs);
  }
}
```

---

## 4. Flakiness Control

### 4.1 Extension Loading Wait Strategies

**Problem:** Extension may not be loaded when test starts.

**Solution: Wait for service worker**

```typescript
// From VoxPage fixture
const SERVICE_WORKER_TIMEOUT = 30000;

if (!serviceWorker) {
  serviceWorker = await context.waitForEvent('serviceworker', {
    timeout: SERVICE_WORKER_TIMEOUT,
  });
}
```

**Solution: Verify extension ID before tests**

```typescript
test.beforeEach(async ({ extensionId }) => {
  if (!extensionId) {
    throw new Error('Extension failed to load');
  }
});
```

### 4.2 Async Message Passing

**Problem:** Messages between content script and background are async.

```typescript
// Bad: No wait
await page.click('.play-btn');
expect(await page.locator('.playing').isVisible()).toBe(true); // May fail!

// Good: Explicit wait
await page.click('.play-btn');
await expect(page.locator('.playing')).toBeVisible({ timeout: 5000 });
```

**Pattern: Wait for state change indicators**

```typescript
// Wait for specific attribute change
await page.click('.play-btn');
await page.waitForFunction(() => {
  const footer = document.querySelector('.voxpage-footer');
  return footer?.getAttribute('data-state') === 'playing';
}, { timeout: 5000 });
```

### 4.3 PDF Rendering Wait Conditions

```typescript
// Wait for PDF to fully render
async function waitForPdfReady(page) {
  // Wait for PDF.js viewer container
  await page.waitForSelector('#viewer', { timeout: 10000 });
  
  // Wait for first page canvas
  await page.waitForSelector('.page[data-page-number="1"] canvas', {
    timeout: 15000,
  });
  
  // Wait for text layer (if needed for text extraction)
  await page.waitForSelector('.textLayer span', { timeout: 10000 });
  
  // Wait for network idle (all PDF resources loaded)
  await page.waitForLoadState('networkidle');
}
```

### 4.4 Audio Playback Testing

**Challenge:** Audio APIs are difficult to test in headless mode.

**Strategies:**

1. **Mock AudioContext:**
```typescript
await page.addInitScript(() => {
  window.AudioContext = class MockAudioContext {
    createMediaElementSource() { return { connect: () => {} }; }
    createGain() { return { connect: () => {}, gain: { value: 1 } }; }
    // ... other mocked methods
  };
});
```

2. **Verify audio element state:**
```typescript
const audioState = await page.evaluate(() => {
  const audio = document.querySelector('audio');
  return {
    paused: audio.paused,
    currentTime: audio.currentTime,
    duration: audio.duration,
  };
});
expect(audioState.paused).toBe(false);
```

3. **Test TTS API calls (mock):**
```typescript
// Mock browser TTS API
await context.addInitScript(() => {
  const utterances = [];
  window.speechSynthesis = {
    speak: (u) => utterances.push(u),
    cancel: () => {},
    getVoices: () => [],
  };
  window.__ttsUtterances = utterances;
});

// Verify TTS was called
const utterances = await page.evaluate(() => window.__ttsUtterances);
expect(utterances.length).toBeGreaterThan(0);
```

### 4.5 General Flakiness Reduction

```javascript
// playwright.config.js
export default defineConfig({
  // Retries for flaky tests
  retries: process.env.CI ? 2 : 1,
  
  // Single worker for stability
  workers: process.env.CI ? 1 : undefined,
  
  // Global timeout
  timeout: 60000,
  
  // Capture artifacts on failure
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
```

---

## 5. Firefox-Specific Challenges

### 5.1 Extension Signing Requirements

Firefox requires extensions to be signed for permanent installation.

**Testing workarounds:**

1. **Temporary installation (development):**
   - Use `about:debugging` → "Load Temporary Add-on"
   - Extension unloads on browser restart
   
2. **Disable signature check (Nightly/Developer Edition):**
   ```javascript
   firefoxUserPrefs: {
     'xpinstall.signatures.required': false,
   }
   ```

3. **Use web-ext for testing:**
   ```bash
   web-ext run --source-dir ./extension
   ```

### 5.2 Profile Setup for Test Isolation

```bash
# Create test profile
firefox -CreateProfile "playwright-test"

# Find profile path
firefox -ProfileManager
```

**Playwright with custom profile:**

```javascript
use: {
  launchOptions: {
    args: ['-profile', '/path/to/test-profile'],
    firefoxUserPrefs: {
      // Disable first-run pages
      'browser.startup.homepage_override.mstone': 'ignore',
      'datareporting.policy.dataSubmissionEnabled': false,
      // Allow unsigned extensions
      'xpinstall.signatures.required': false,
      // Enable extension debugging
      'devtools.debugger.remote-enabled': true,
    },
  },
}
```

### 5.3 about:addons Page Access

Firefox blocks extension access to privileged pages like `about:addons`.

**Testing limitation:** Cannot programmatically verify extension appears in Add-ons Manager.

**Workaround:** Test extension functionality on regular web pages instead.

### 5.4 PDF.js Viewer Testing

Firefox's built-in PDF viewer uses PDF.js.

**Key selectors:**
- `#viewer` - Main viewer container
- `.page` - Individual page containers
- `.textLayer` - Text selection layer
- `.canvasWrapper` - Rendered page canvas

```typescript
// Firefox PDF.js specific test
test('PDF opens in Firefox viewer', async ({ page }) => {
  await page.goto('https://example.com/test.pdf');
  
  // Wait for Firefox PDF viewer
  await page.waitForSelector('#viewer', { timeout: 10000 });
  
  // Check page count
  const pageCount = await page.locator('.page').count();
  expect(pageCount).toBeGreaterThan(0);
});
```

### 5.5 Content Security Policy Differences

Firefox enforces stricter CSP in some contexts.

**manifest.json CSP for MV3:**
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

---

## 6. CI/CD Integration

### 6.1 GitHub Actions for Firefox Extension Tests

```yaml
# .github/workflows/test.yml
name: Firefox Extension Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  visual-tests:
    name: Visual Tests (Firefox)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright Firefox
        run: npx playwright install --with-deps firefox
      
      - name: Build Firefox extension
        run: pnpm run build:firefox
      
      - name: Run visual tests
        run: pnpm run test:visual
      
      - name: Upload report on failure
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  extension-e2e:
    name: Extension E2E (Chromium)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      
      - name: Build Chrome extension
        run: pnpm run build:chrome
      
      # Extension tests require headed mode
      - name: Run Extension E2E tests
        run: xvfb-run --auto-servernum -- pnpm run test:e2e:ext
        timeout-minutes: 10
      
      - name: Upload artifacts on failure
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: extension-e2e-results
          path: |
            playwright-report/
            test-results/
          retention-days: 7
```

### 6.2 Docker Configuration

```yaml
# docker-compose.playwright.yml
version: '3.8'
services:
  e2e-tests:
    image: mcr.microsoft.com/playwright:v1.52.0-noble
    working_dir: /app
    volumes:
      - .:/app
      - ./test-results:/app/test-results
      - ./playwright-report:/app/playwright-report
    environment:
      - CI=true
    command: >
      sh -c "npm ci && 
             npm run build:chrome && 
             npx playwright test --project=chromium-extension"
    # Required for Chromium sandbox
    security_opt:
      - seccomp:unconfined
    # Recommended for Chromium
    ipc: host
```

**Recommended Docker flags:**
- `--init` - Proper PID 1 handling
- `--ipc=host` - Prevent Chromium memory issues
- `--cap-add=SYS_ADMIN` - For sandbox in development

### 6.3 NixOS-Specific Setup

VoxPage has NixOS support documented in `docs/e2e-nixos.md`.

**Key points:**

1. **Use system browsers:**
   ```bash
   export FIREFOX_PATH=$(which firefox)
   export CHROMIUM_PATH=$(which chromium)
   ```

2. **shell.nix for reproducible environment:**
   ```nix
   { pkgs ? import <nixpkgs> {} }:
   pkgs.mkShell {
     buildInputs = with pkgs; [
       nodejs_20
       nodePackages.pnpm
       firefox
       chromium
     ];
     
     shellHook = ''
       export FIREFOX_PATH=$(which firefox)
       export CHROMIUM_PATH=$(which chromium)
     '';
   }
   ```

3. **Docker fallback for CI:**
   ```bash
   ./scripts/e2e-docker.sh
   ```

### 6.4 Caching Playwright Browsers

```yaml
# GitHub Actions caching
- name: Get Playwright version
  id: playwright-version
  run: |
    VERSION=$(pnpm ls @playwright/test --json | jq -r '.[0].devDependencies["@playwright/test"].version')
    echo "version=$VERSION" >> "$GITHUB_OUTPUT"

- name: Cache Playwright browsers
  uses: actions/cache@v4
  id: playwright-cache
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}

- name: Install Playwright browsers
  if: steps.playwright-cache.outputs.cache-hit != 'true'
  run: npx playwright install --with-deps
```

**Note from Playwright docs:** Browser caching provides minimal benefit—download time is comparable to cache restoration time.

---

## 7. VoxPage Recommendations

### 7.1 Recommended Test Architecture

```
tests/
├── unit/                    # Jest unit tests
├── integration/             # Component integration tests
├── contract/                # API contract tests
├── e2e/
│   ├── extension/          # Chromium extension E2E (Playwright)
│   │   ├── fixtures/       # Extension fixture
│   │   ├── content-injection.spec.ts
│   │   ├── playback-flow.spec.ts
│   │   └── popup-ui.spec.ts
│   ├── content-injection.e2e.test.ts  # Firefox E2E (non-extension)
│   ├── playback-flow.e2e.test.ts
│   └── settings-page.e2e.test.ts
├── visual/                  # Firefox visual regression
│   ├── hover-preview.test.js
│   ├── sticky-footer.test.js
│   └── *.test.js-snapshots/
├── security/               # Security tests
└── helpers/               # Shared test utilities
```

### 7.2 Recommended Browser Strategy

| Test Type | Browser | Reason |
|-----------|---------|--------|
| Extension E2E | Chromium | Only browser with Playwright extension support |
| Visual regression | Firefox | Target browser for VoxPage |
| PDF testing | Chromium (extension) | Full extension context needed |
| Static validation | Firefox | Verify build artifacts |
| Settings page | Both | Browser-agnostic functionality |

### 7.3 Recommended Wait Strategies

```typescript
// Extension ready helper
export async function waitForExtensionReady(
  context: BrowserContext,
  timeout = 30000
): Promise<string> {
  const serviceWorker = await context.waitForEvent('serviceworker', { timeout });
  return serviceWorker.url().split('/')[2];
}

// Content script ready helper
export async function waitForContentScriptReady(
  page: Page,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.waitForSelector('[data-voxpage-ready]', { timeout, state: 'attached' });
    return true;
  } catch {
    return false;
  }
}

// PDF ready helper
export async function waitForPdfReady(page: Page, timeout = 15000): Promise<void> {
  await page.waitForSelector('.pdfViewer', { timeout });
  await page.waitForSelector('.page canvas', { timeout });
  await page.waitForLoadState('networkidle');
}
```

### 7.4 Recommended Fixture Pattern

```typescript
// tests/e2e/extension/fixtures/extension.fixture.ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const extensionPath = getExtensionPath();
    
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--headless=new', // Chrome 109+ headless with extension support
        '--disable-gpu',
        '--no-sandbox',
      ],
    });
    
    await use(context);
    await context.close();
  },
  
  extensionId: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? 
               await context.waitForEvent('serviceworker', { timeout: 30000 });
    const extensionId = sw.url().split('/')[2];
    await use(extensionId);
  },
});
```

### 7.5 Recommended CI Configuration

VoxPage's current `test.yml` is well-structured. Recommendations for enhancement:

1. **Add Firefox-specific extension smoke test:**
   ```yaml
   firefox-smoke:
     name: Firefox Smoke Test
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - run: pnpm install
       - run: pnpm build:firefox
       - name: Validate Firefox extension structure
         run: |
           test -f .output/firefox-mv2/manifest.json
           test -f .output/firefox-mv2/background.js
           test -f .output/firefox-mv2/content-scripts/content.js
   ```

2. **Add scheduled full browser matrix:**
   ```yaml
   nightly-full-matrix:
     if: github.event_name == 'schedule'
     strategy:
       matrix:
         browser: [chromium, firefox, webkit]
     steps:
       - run: npx playwright test --project=${{ matrix.browser }}
   ```

3. **Add visual snapshot update workflow:**
   ```yaml
   update-snapshots:
     if: github.event_name == 'workflow_dispatch'
     steps:
       - run: npx playwright test --update-snapshots
       - uses: peter-evans/create-pull-request@v5
         with:
           title: "Update visual snapshots"
           branch: update-snapshots
   ```

---

## References

### Official Documentation

- [Playwright Browsers Documentation](https://playwright.dev/docs/browsers)
- [Playwright Chrome Extensions](https://playwright.dev/docs/chrome-extensions)
- [Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [Playwright CI Configuration](https://playwright.dev/docs/ci)
- [Playwright Docker](https://playwright.dev/docs/docker)

### Firefox Extension Testing

- [Firefox Extension Workshop - Debugging](https://extensionworkshop.com/documentation/develop/debugging/)
- [Firefox Extension Workshop - Testing](https://extensionworkshop.com/documentation/develop/testing-persistent-and-restart-features/)
- [web-ext Command Reference](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/)
- [MDN WebExtensions API](https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions)

### VoxPage Existing Documentation

- `docs/e2e-nixos.md` - NixOS E2E testing setup
- `tests/e2e/extension/fixtures/extension.fixture.ts` - Extension fixture implementation
- `playwright.config.js` - Current Playwright configuration
- `.github/workflows/test.yml` - CI workflow

---

## Summary

VoxPage's current testing strategy is well-designed given Playwright's limitations with Firefox extensions. Key takeaways:

1. **Chromium for extension E2E** - Playwright only supports extensions in Chromium
2. **Firefox for visual regression** - CSS-only tests work without extension loading
3. **Static validation for Firefox** - Verify manifest and file structure
4. **Docker for CI consistency** - Reproducible test environment
5. **web-ext for Firefox-specific testing** - Use Mozilla's official tool when full Firefox extension testing is needed
