# Proso Playwright Testing Skill

This skill provides guidance for running and writing Playwright E2E tests for the Proso Firefox extension.

## Test Architecture

Proso uses three test types with Playwright:

| Project | Directory | Browser | Purpose |
|---------|-----------|---------|---------|
| `chromium-extension` | `tests/e2e/extension/` | Chromium | Extension E2E with real browser |
| `firefox-e2e` | `tests/e2e/` | Firefox | Extension structure validation |
| `firefox-visual` | `tests/visual/` | Firefox | Visual regression screenshots |

## Running Tests

### Extension E2E Tests (Chromium)

These test the actual extension loaded in Chromium:

```bash
# Build extension first (required)
pnpm build:chrome

# Run all extension tests
pnpm test:e2e:ext

# Run with UI debugger
pnpm test:e2e:ext:ui

# Run specific test file
npx playwright test tests/e2e/extension/console-errors.spec.ts --project=chromium-extension
```

### Visual Regression Tests (Firefox)

```bash
# Run visual tests
pnpm test:visual

# Update snapshots after intentional changes
pnpm test:visual:update
```

### Firefox E2E Tests

```bash
# These test extension structure, not actual extension loading
pnpm test:e2e
```

## NixOS Environment

On NixOS, use the provided shell.nix:

```bash
# Enter development shell (sets up browsers correctly)
nix-shell

# Then run tests
pnpm build:chrome && pnpm test:e2e:ext
```

Key environment variables set by shell.nix:
- `CHROMIUM_PATH` - System Chromium path
- `FIREFOX_PATH` - System Firefox path
- `LD_LIBRARY_PATH` - Required system libraries

## Test Fixtures

### Extension Fixture (`tests/e2e/extension/fixtures/extension.fixture.ts`)

Provides browser context with Proso extension loaded:

```typescript
import { test, expect } from '../fixtures/extension.fixture';

test('my extension test', async ({ context, extensionId, extensionPage }) => {
  // context: BrowserContext with extension loaded
  // extensionId: Unique extension ID (e.g., "abcdef123456")
  // extensionPage: A page within the extension context
  
  await extensionPage.goto('https://example.com');
  // Extension content script will inject automatically
});
```

### Console Fixture (`tests/e2e/extension/fixtures/console.fixture.ts`)

Monitors browser console for errors:

```typescript
import { test, expect } from '../fixtures/console.fixture';

test('no console errors', async ({ monitoredPage }) => {
  await monitoredPage.goto('https://example.com');
  // Test automatically fails if unexpected console errors occur
});
```

Allowlisted errors (won't fail tests):
- `favicon-not-found` - 404 for favicon.ico
- `resize-observer-loop` - ResizeObserver loop notifications
- `net::ERR_BLOCKED_BY_CLIENT` - Ad blocker interference

### Audio Fixture (`tests/e2e/extension/fixtures/audio.fixture.ts`)

For testing audio playback functionality.

## Writing New Tests

### Extension Test Template

```typescript
// tests/e2e/extension/my-feature.spec.ts
import { test, expect } from './fixtures/extension.fixture';

test.describe('My Feature', () => {
  test('feature works correctly', async ({ context, extensionId, extensionPage }) => {
    // Navigate to a test page
    await extensionPage.goto('https://example.com');
    
    // Wait for content script injection
    await extensionPage.waitForSelector('[data-proso]', { timeout: 5000 });
    
    // Interact with extension UI
    await extensionPage.click('.proso-play-button');
    
    // Assert expected behavior
    await expect(extensionPage.locator('.proso-footer')).toBeVisible();
  });
});
```

### Testing Extension Popup

```typescript
import { test, expect, openExtensionPopup } from './fixtures/extension.fixture';

test('popup renders correctly', async ({ context, extensionId }) => {
  const popup = await openExtensionPopup(context, extensionId);
  
  await expect(popup.locator('.popup-container')).toBeVisible();
  await expect(popup.locator('#provider-select')).toBeEnabled();
});
```

### Testing Settings Page

```typescript
import { test, expect, openExtensionSettings } from './fixtures/extension.fixture';

test('settings page loads', async ({ context, extensionId }) => {
  const settings = await openExtensionSettings(context, extensionId);
  
  await expect(settings.locator('h1')).toHaveText('Proso Settings');
});
```

## Test Configuration

Key settings in `playwright.config.js`:

```javascript
{
  workers: 1,                    // Single worker for consistency
  retries: process.env.CI ? 2 : 1,  // Retry on failure
  timeout: 60000,                // 60s for extension tests
  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  }
}
```

## Debugging Failed Tests

### View HTML Report

```bash
npx playwright show-report
```

### Run with Debug Mode

```bash
PWDEBUG=1 npx playwright test tests/e2e/extension/my-test.spec.ts --project=chromium-extension
```

### View Traces

Failed tests generate traces in `test-results/`. Open with:

```bash
npx playwright show-trace test-results/my-test-chromium-extension/trace.zip
```

## Common Patterns

### Wait for Extension Load

```typescript
// Wait for service worker
let serviceWorker = context.serviceWorkers()[0];
if (!serviceWorker) {
  serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30000 });
}
```

### Check Content Script Injection

```typescript
import { waitForContentScript } from './fixtures/extension.fixture';

const injected = await waitForContentScript(page, 5000);
expect(injected).toBe(true);
```

### Handle Blocked Contexts

```typescript
import { isBlockedContext } from './fixtures/extension.fixture';

if (isBlockedContext(page.url())) {
  // Skip tests on chrome://, about:, file:// URLs
  test.skip();
}
```

## CI Integration

Tests run automatically via GitHub Actions (`.github/workflows/test.yml`):

```yaml
- name: Run Extension E2E Tests
  run: |
    pnpm build:chrome
    pnpm test:e2e:ext
```

## Troubleshooting

### Extension Not Loading

1. Verify build exists: `ls .output/chrome-mv3/manifest.json`
2. Check for manifest errors in browser console
3. Ensure `--load-extension` path is correct

### Service Worker Timeout

If tests fail with "Extension service worker not found":
- Check `background.ts` compiles without errors
- Verify manifest.json has correct `background.service_worker` entry
- Increase `SERVICE_WORKER_TIMEOUT` in fixture if needed

### NixOS Browser Issues

```bash
# Verify browsers are available
which chromium firefox

# Check library path
echo $LD_LIBRARY_PATH

# Re-enter nix-shell if needed
exit && nix-shell
```

### Flaky Tests

For intermittent failures:
1. Add explicit waits: `await page.waitForTimeout(100)`
2. Use `toPass()` for eventual consistency
3. Check for race conditions in async operations

## Test Coverage

Current test suites:

| Suite | Tests | Purpose |
|-------|-------|---------|
| `audio-playback.spec.ts` | 7 | Audio playback timing and stability |
| `console-errors.spec.ts` | 8 | Console error detection and allowlisting |
| `stability.spec.ts` | 5 | Extension stability under stress |

Run coverage report:
```bash
pnpm test:e2e:ext -- --reporter=html
npx playwright show-report
```
