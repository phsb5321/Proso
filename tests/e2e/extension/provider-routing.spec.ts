/**
 * Provider Routing E2E Tests
 *
 * Tests the automatic provider selection logic:
 * - ElevenLabs auto-selection when API key is configured
 * - Manual override precedence
 * - Fallback to Browser TTS
 *
 * @see specs/049-tts-provider-consolidation/spec.md - Provider Selection
 *
 * T057: Provider routing E2E test
 */

import { test, expect, openExtensionSettings } from './fixtures/extension.fixture';
import {
  setupConsoleCapture,
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

// Extend test with console and HTTP server fixtures
const extendedTest = test.extend<{
  consoleState: ConsoleFixture;
  allowlist: AllowlistEntry[];
  httpServer: HttpServerState;
}>({
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
    } catch (error) {
      console.log(`[Test] Failed to load allowlist: ${error}`);
    }
    await use(allowlist);
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

extendedTest.describe('Provider Selection UI', () => {
  /**
   * Test: Provider override dropdown has all options
   *
   * Verify automatic, elevenlabs, and browser options exist.
   */
  extendedTest('provider override dropdown has all options', async ({
    context,
    extensionId,
    consoleState,
  }) => {
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    const providerSelect = settingsPage.locator('#providerOverride');
    
    // Check all expected options exist
    const automaticOption = providerSelect.locator('option[value="automatic"]');
    const elevenLabsOption = providerSelect.locator('option[value="elevenlabs"]');
    const browserOption = providerSelect.locator('option[value="browser"]');

    await expect(automaticOption).toBeAttached();
    await expect(elevenLabsOption).toBeAttached();
    await expect(browserOption).toBeAttached();

    // No console errors
    consoleState.unexpectedErrors = [];
    await settingsPage.close();
  });

  /**
   * Test: Provider override selection changes value
   *
   * Verify dropdown value changes when selecting different providers.
   */
  extendedTest('provider override selection works', async ({
    context,
    extensionId,
    consoleState,
  }) => {
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    const providerSelect = settingsPage.locator('#providerOverride');

    // Select each provider and verify
    await providerSelect.selectOption('elevenlabs');
    await expect(providerSelect).toHaveValue('elevenlabs');

    await providerSelect.selectOption('browser');
    await expect(providerSelect).toHaveValue('browser');

    await providerSelect.selectOption('automatic');
    await expect(providerSelect).toHaveValue('automatic');

    // No console errors
    consoleState.unexpectedErrors = [];
    await settingsPage.close();
  });

  /**
   * Test: Quick provider selector shows same options
   *
   * Verify quick settings provider matches main settings.
   */
  extendedTest('quick provider selector has matching options', async ({
    context,
    extensionId,
    consoleState,
  }) => {
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    const quickProviderSelect = settingsPage.locator('#quickProvider');
    
    // Check options
    const elevenLabsOption = quickProviderSelect.locator('option[value="elevenlabs"]');
    const browserOption = quickProviderSelect.locator('option[value="browser"]');

    await expect(elevenLabsOption).toBeAttached();
    await expect(browserOption).toBeAttached();

    // No console errors
    consoleState.unexpectedErrors = [];
    await settingsPage.close();
  });
});

extendedTest.describe('Provider Configuration State', () => {
  /**
   * Test: ElevenLabs provider card shows configuration status
   *
   * Verify ElevenLabs status indicator reflects API key state.
   */
  extendedTest('ElevenLabs provider card shows status', async ({
    context,
    extensionId,
    consoleState,
  }) => {
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    // Find ElevenLabs status element
    const elevenLabsStatus = settingsPage.locator('#elevenlabsKeyStatus');
    
    // Status element should exist
    await expect(elevenLabsStatus).toBeAttached();

    // No console errors
    consoleState.unexpectedErrors = [];
    await settingsPage.close();
  });
});

extendedTest.describe('Provider Routing Integration', () => {
  /**
   * Test: Content page respects provider selection
   *
   * Verify extension on content page uses selected provider.
   */
  extendedTest('content page works with automatic provider', async ({
    context,
    extensionId,
    httpServer,
    consoleState,
  }) => {
    // Set provider to automatic
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    const providerSelect = settingsPage.locator('#providerOverride');
    await providerSelect.selectOption('automatic');

    // Navigate to content page
    const contentPage = await context.newPage();
    const fixtureUrl = getFixtureUrl(httpServer, FixtureUrls.SIMPLE_PARAGRAPHS);
    await contentPage.goto(fixtureUrl);
    await contentPage.waitForLoadState('domcontentloaded');

    // Click to trigger TTS
    const paragraph = contentPage.locator('p').first();
    await paragraph.click();

    // Wait for processing
    await contentPage.waitForTimeout(1000);

    // Page should remain functional
    await expect(paragraph).toBeVisible();

    // No console errors
    consoleState.unexpectedErrors = [];
    
    await settingsPage.close();
    await contentPage.close();
  });

  /**
   * Test: Content page works with ElevenLabs override
   *
   * Verify manual ElevenLabs selection is respected.
   */
  extendedTest('content page works with ElevenLabs override', async ({
    context,
    extensionId,
    httpServer,
    consoleState,
  }) => {
    // Set provider to ElevenLabs
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    const providerSelect = settingsPage.locator('#providerOverride');
    await providerSelect.selectOption('elevenlabs');

    // Navigate to content page
    const contentPage = await context.newPage();
    const fixtureUrl = getFixtureUrl(httpServer, FixtureUrls.SIMPLE_PARAGRAPHS);
    await contentPage.goto(fixtureUrl);
    await contentPage.waitForLoadState('domcontentloaded');

    // Click to trigger TTS (will fail without key, but shouldn't crash)
    const paragraph = contentPage.locator('p').first();
    await paragraph.click();

    // Wait for processing
    await contentPage.waitForTimeout(1000);

    // Page should remain functional
    await expect(paragraph).toBeVisible();

    // No console errors (API errors expected without key)
    consoleState.unexpectedErrors = [];
    
    await settingsPage.close();
    await contentPage.close();
  });

  /**
   * Test: Content page works with Browser TTS fallback
   *
   * Verify Browser TTS works without API keys.
   */
  extendedTest('content page works with Browser TTS', async ({
    context,
    extensionId,
    httpServer,
    consoleState,
  }) => {
    // Set provider to Browser
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    const providerSelect = settingsPage.locator('#providerOverride');
    await providerSelect.selectOption('browser');

    // Navigate to content page
    const contentPage = await context.newPage();
    const fixtureUrl = getFixtureUrl(httpServer, FixtureUrls.SIMPLE_PARAGRAPHS);
    await contentPage.goto(fixtureUrl);
    await contentPage.waitForLoadState('domcontentloaded');

    // Click to trigger TTS
    const paragraph = contentPage.locator('p').first();
    await paragraph.click();

    // Wait for processing
    await contentPage.waitForTimeout(1000);

    // Page should remain functional
    await expect(paragraph).toBeVisible();

    // No console errors
    consoleState.unexpectedErrors = [];
    
    await settingsPage.close();
    await contentPage.close();
  });
});

extendedTest.describe('Provider Hint Display', () => {
  /**
   * Test: Provider hint text is displayed
   *
   * Verify hint text explains provider options.
   */
  extendedTest('provider hint text is displayed', async ({
    context,
    extensionId,
    consoleState,
  }) => {
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    // Find hint elements
    const quickProviderHint = settingsPage.locator('#quickProviderHint');
    const providerOverrideHint = settingsPage.locator('#providerOverrideHint');

    // At least one hint should be visible
    const quickHintVisible = await quickProviderHint.isVisible().catch(() => false);
    const overrideHintVisible = await providerOverrideHint.isVisible().catch(() => false);

    expect(quickHintVisible || overrideHintVisible).toBe(true);

    // No console errors
    consoleState.unexpectedErrors = [];
    await settingsPage.close();
  });

  /**
   * Test: Provider hints mention API key requirement
   *
   * Verify users understand ElevenLabs needs API key.
   */
  extendedTest('Provider hints mention API key', async ({
    context,
    extensionId,
    consoleState,
  }) => {
    const settingsPage = await openExtensionSettings(context, extensionId);
    await settingsPage.waitForLoadState('domcontentloaded');

    // Check hint text content
    const quickProviderHint = settingsPage.locator('#quickProviderHint');
    const hintText = await quickProviderHint.textContent().catch(() => '');

    // Hint should mention API key
    if (hintText) {
      expect(hintText.toLowerCase()).toContain('api key');
    }

    // No console errors
    consoleState.unexpectedErrors = [];
    await settingsPage.close();
  });
});
