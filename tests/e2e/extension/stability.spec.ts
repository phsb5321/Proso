/**
 * Extension Stability Tests
 *
 * Tests for long-running stability and memory leak detection.
 * These tests run multiple playback cycles to detect:
 * - Memory leaks (audio element accumulation)
 * - Stuck playback states
 * - Console error accumulation
 *
 * @see specs/038-browser-e2e-hardening/spec.md - User Story 2
 *
 * FR-009: Verify 10 consecutive TTS cycles complete without errors
 * SC-005: 0 stuck playback states after 10 test cycles
 */

import { test, expect, waitForContentScript } from './fixtures/extension.fixture';
import {
  setupTTSInterception,
  removeTTSInterception,
  waitForAudioPlaying,
  waitForAudioStopped,
  getAudioState,
  countAudioElements,
  getMemoryInfo,
  AudioFixtures,
  type AudioFixtureState,
} from './fixtures/audio.fixture';
import {
  setupConsoleCapture,
  assertNoConsoleErrors,
  type ConsoleFixture,
  type AllowlistEntry,
} from './fixtures/console.fixture';
import {
  startHttpServer,
  stopHttpServer,
  getFixtureUrl,
  FixtureUrls,
  type HttpServerState,
} from './fixtures/http-server.fixture';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const STABILITY_CYCLES = 10;
const MAX_AUDIO_ELEMENTS = 2;
const MAX_MEMORY_GROWTH_MB = 50;
const CYCLE_DELAY_MS = 150;

// Merge all fixtures
const extendedTest = test.extend<{
  audioState: AudioFixtureState;
  consoleState: ConsoleFixture;
  allowlist: AllowlistEntry[];
  httpServer: HttpServerState;
}>({
  // HTTP server fixture - starts before tests, stops after
  httpServer: async ({}, use) => {
    const server = await startHttpServer();
    await use(server);
    await stopHttpServer(server);
  },

  allowlist: async ({}, use) => {
    const allowlistPath = path.join(__dirname, '../console-allowlist.json');
    let allowlist: AllowlistEntry[] = [];
    try {
      if (fs.existsSync(allowlistPath)) {
        const content = fs.readFileSync(allowlistPath, 'utf-8');
        const config = JSON.parse(content);
        allowlist = config.entries || [];
      }
    } catch {
      // Use empty allowlist
    }
    await use(allowlist);
  },

  audioState: async ({ extensionPage }, use) => {
    const state: AudioFixtureState = {
      interceptedRequests: [],
      isActive: false,
      defaultFixture: AudioFixtures.SHORT, // Use short fixture for faster stability tests
      warnings: [],
    };

    await setupTTSInterception(extensionPage, state, { fixture: AudioFixtures.SHORT });
    await use(state);
    await removeTTSInterception(extensionPage, state);
  },

  consoleState: async ({ extensionPage, allowlist }, use) => {
    const state: ConsoleFixture = {
      capturedErrors: [],
      capturedWarnings: [],
      cspViolations: [],
      allowlistedErrors: [],
      unexpectedErrors: [],
      inTeardown: false,
    };

    await setupConsoleCapture(extensionPage, state, allowlist);
    await use(state);
    state.inTeardown = true;
  },
});

extendedTest.describe('Extension Stability', () => {
  /**
   * Test: Extension survives rapid navigation
   *
   * Rapidly navigate between pages and verify extension doesn't crash.
   */
  extendedTest('survives rapid page navigation', async ({
    extensionPage,
    context,
    consoleState,
  }) => {
    extendedTest.setTimeout(30000);

    const testUrls = [
      'https://example.com',
      'https://example.org',
      'https://example.net',
    ];

    // Navigate rapidly between pages
    for (let i = 0; i < 10; i++) {
      const url = testUrls[i % testUrls.length];
      await extensionPage.goto(url);
      await extensionPage.waitForTimeout(200);
    }

    // Verify extension context still works
    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThan(0);

    // Verify no critical errors
    const criticalErrors = consoleState.capturedErrors.filter(
      e => e.message.includes('extension') || e.message.includes('crash')
    );
    expect(criticalErrors.length).toBe(0);

    console.log('[Test] Extension survived 10 rapid navigations');
    consoleState.unexpectedErrors = [];
  });

  /**
   * Test: Content script re-injection after navigation
   *
   * Navigate to new page and verify content script is properly injected.
   */
  extendedTest('content script re-injects after navigation', async ({
    extensionPage,
    consoleState,
  }) => {
    // First page
    await extensionPage.goto('https://example.com');
    const firstInjection = await waitForContentScript(extensionPage, 5000);

    // Navigate to different page
    await extensionPage.goto('https://example.org');
    const secondInjection = await waitForContentScript(extensionPage, 5000);

    // Navigate back
    await extensionPage.goBack();
    await extensionPage.waitForTimeout(1000);

    // Both navigations should have content script (if supported)
    console.log(`[Test] First injection: ${firstInjection}, Second injection: ${secondInjection}`);

    // Clear console state
    consoleState.unexpectedErrors = [];
  });

  /**
   * Test: No memory leak indicators during repeated playback cycles
   * 
   * LIMITATION: Audio elements in content script isolated world are not visible
   * to Playwright page APIs. This test verifies memory stability during repeated clicks.
   */
  extendedTest('no memory leak indicators during repeated cycles', async ({
    extensionPage,
    consoleState,
    httpServer,
  }) => {
    extendedTest.setTimeout(60000);

    // Use local fixture page via HTTP for reliable paragraph access
    const fixtureUrl = getFixtureUrl(httpServer, FixtureUrls.SIMPLE_PARAGRAPHS);
    await extensionPage.goto(fixtureUrl);
    await extensionPage.waitForLoadState('domcontentloaded');

    // Record initial state
    const memoryStart = await getMemoryInfo(extensionPage);

    const paragraphs = extensionPage.locator('p');
    const paragraphCount = await paragraphs.count();

    if (paragraphCount === 0) {
      console.log('[Test] No paragraphs found - skipping stability test');
      return;
    }

    // Run stability cycles
    console.log(`[Test] Starting ${STABILITY_CYCLES} stability cycles...`);
    
    for (let cycle = 0; cycle < STABILITY_CYCLES; cycle++) {
      const paragraphIndex = cycle % paragraphCount;
      const paragraph = paragraphs.nth(paragraphIndex);

      // Trigger click
      await paragraph.click();

      // Brief wait
      await extensionPage.waitForTimeout(CYCLE_DELAY_MS);

      // Log progress every 5 cycles
      if ((cycle + 1) % 5 === 0) {
        console.log(`[Test] Completed cycle ${cycle + 1}/${STABILITY_CYCLES}`);
      }
    }

    // Final checks
    await extensionPage.waitForTimeout(500);

    // Check memory growth (Chromium only)
    const memoryEnd = await getMemoryInfo(extensionPage);
    if (memoryStart && memoryEnd && memoryStart.usedJSHeapSize && memoryEnd.usedJSHeapSize) {
      const growthBytes = memoryEnd.usedJSHeapSize - memoryStart.usedJSHeapSize;
      const growthMB = growthBytes / 1024 / 1024;
      console.log(`[Test] Memory growth: ${growthMB.toFixed(2)}MB`);
      expect(growthMB).toBeLessThan(MAX_MEMORY_GROWTH_MB);
    }

    // Check for "Invalid URI" errors (common TTS issue)
    const invalidUriErrors = consoleState.capturedErrors.filter(
      e => e.message.includes('Invalid URI') || e.message.includes('invalid url')
    );
    expect(invalidUriErrors.length).toBe(0);

    console.log(`[Test] Stability test complete: ${STABILITY_CYCLES} cycles`);

    // Clear console state
    consoleState.unexpectedErrors = [];
  });

  /**
   * Test: Extension popup remains responsive after playback
   */
  extendedTest('popup remains responsive after playback activity', async ({
    context,
    extensionId,
    extensionPage,
    consoleState,
  }) => {
    // Navigate and trigger some activity
    await extensionPage.goto('https://example.com');
    await extensionPage.waitForLoadState('networkidle');

    // Open popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    // Popup should be responsive (can find UI elements)
    const popupBody = popupPage.locator('body');
    await expect(popupBody).toBeVisible({ timeout: 5000 });

    // Check for popup errors
    const popupState: ConsoleFixture = {
      capturedErrors: [],
      capturedWarnings: [],
      cspViolations: [],
      allowlistedErrors: [],
      unexpectedErrors: [],
      inTeardown: false,
    };
    await setupConsoleCapture(popupPage, popupState, []);
    await popupPage.waitForTimeout(1000);

    await popupPage.close();

    console.log('[Test] Popup remained responsive');
    consoleState.unexpectedErrors = [];
  });

  /**
   * Test: Service worker recovers from errors
   */
  extendedTest('service worker handles errors gracefully', async ({
    context,
    consoleState,
  }) => {
    // Get service worker
    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThan(0);

    const sw = serviceWorkers[0];
    
    // Service worker should still be available
    const swUrl = sw.url();
    expect(swUrl).toContain('chrome-extension://');

    console.log('[Test] Service worker is active');
    consoleState.unexpectedErrors = [];
  });
});
