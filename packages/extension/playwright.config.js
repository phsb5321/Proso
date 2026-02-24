/**
 * Playwright Configuration for Proso
 *
 * Test types:
 * - Visual regression: Screenshot comparison tests (tests/visual/)
 * - E2E: End-to-end tests with real extension (tests/e2e/)
 * - Extension E2E: Chromium extension tests (tests/e2e/extension/) - FR-017, FR-020
 *
 * NixOS Support:
 * - Set FIREFOX_PATH environment variable to use system Firefox
 * - Set PLAYWRIGHT_BROWSERS_PATH for Nix-provided browsers
 * - Example: export FIREFOX_PATH=$(which firefox)
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Test directories
  testDir: './tests',
  testMatch: [
    '**/visual/**/*.test.js',
    '**/e2e/**/*.test.ts',
    '**/e2e/extension/**/*.spec.ts',
  ],

  // Execution settings
  fullyParallel: false, // Single worker for consistent rendering
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // FR-020: 1 retry for extension tests
  workers: 1, // Single worker prevents rendering inconsistencies

  // Reporter configuration - FR-016: HTML report generation
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Global test settings
  use: {
    screenshot: 'only-on-failure',
    trace: 'on-first-retry', // FR-020: Trace capture on first retry
    video: 'retain-on-failure', // FR-016: Video recording for failures
    viewport: { width: 800, height: 600 },
  },

  // Browser projects
  projects: [
    {
      name: 'firefox-visual',
      testMatch: '**/visual/**/*.test.js',
      use: {
        browserName: 'firefox',
        viewport: { width: 800, height: 600 },
        launchOptions: {
          // NixOS support: Use system Firefox if FIREFOX_PATH is set
          executablePath: process.env.FIREFOX_PATH || undefined,
          firefoxUserPrefs: {
            'extensions.autoDisableScopes': 0,
            'devtools.debugger.remote-enabled': true,
          },
        },
      },
    },
    {
      name: 'firefox-e2e',
      testMatch: '**/e2e/**/*.test.ts',
      testIgnore: '**/e2e/extension/**', // Exclude extension tests (Chromium only)
      use: {
        browserName: 'firefox',
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          // NixOS support: Use system Firefox if FIREFOX_PATH is set
          executablePath: process.env.FIREFOX_PATH || undefined,
          // E2E tests need headed mode for extension loading
          headless: false,
          firefoxUserPrefs: {
            'extensions.autoDisableScopes': 0,
            'devtools.debugger.remote-enabled': true,
          },
        },
      },
    },
    // Extension E2E tests (Chromium only - Playwright extension support)
    {
      name: 'chromium-extension',
      testDir: './tests/e2e/extension',
      testMatch: '**/*.spec.ts',
      timeout: 60000, // SC-001: 60s timeout for browser + extension load
      use: {
        viewport: { width: 1280, height: 720 },
        // Note: Extension tests use custom fixture with launchPersistentContext
        // The browserName is not used directly; fixture handles Chromium launch
      },
    },
  ],

  // Snapshot comparison settings
  expect: {
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02, // 2% tolerance
    },
  },

  // Output directories - FR-017: Stable, predictable paths
  outputDir: 'test-results',
});
