/**
 * Playwright Configuration for VoxPage
 * Visual regression testing for Firefox extension popup
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 360, height: 480 }
  },

  projects: [
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        viewport: { width: 360, height: 480 },
        launchOptions: {
          firefoxUserPrefs: {
            'extensions.autoDisableScopes': 0,
            'devtools.debugger.remote-enabled': true
          }
        }
      }
    }
  ],

  expect: {
    toMatchSnapshot: {
      maxDiffPixelRatio: 0.02
    }
  }
});
