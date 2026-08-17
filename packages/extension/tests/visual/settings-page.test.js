/**
 * Visual tests for settings page UI
 * Feature: 036-testing-strategy (T040)
 *
 * Tests visual appearance of the settings page
 * in various states (sections expanded/collapsed, light/dark mode).
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { disableAnimations, waitForLayoutStable } from '../helpers/disable-animations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to built extension settings page
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/firefox-mv2');
const SETTINGS_PATH = path.join(EXTENSION_PATH, 'settings.html');
// Served by the webServer (scripts/serve-built.mjs) so the suite renders the
// BUILT page's real CSS (PROSO-130c) — file:// resolves the absolute asset
// paths to the filesystem root and screenshots an unstyled page.
const APP_URL = 'http://127.0.0.1:4273/settings.html';

/**
 * Check if settings page exists in build
 */
function settingsExists() {
  return fs.existsSync(SETTINGS_PATH);
}

/**
 * Open the BUILT settings page over HTTP (PROSO-130c): file:// renders the
 * page unstyled because the built HTML references assets by absolute path —
 * baselines taken that way can never catch a styling regression. The build's
 * entry chunks are aborted: the tests drive static markup, and the module
 * scripts would otherwise run against an extension-less page.
 */
async function openSettings(page) {
  await page.route('**/chunks/*.js', (route) => route.abort());
  await page.goto(APP_URL);
  await page.waitForLoadState('domcontentloaded');
  await disableAnimations(page);
  await waitForLayoutStable(page, 'main', 100);
}

test.describe('Settings Page Visual Tests (T040)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
  });

  test.skip(!settingsExists(), 'Settings page build not found. Run pnpm run build:firefox first.');

  // Test settings page default state - light mode
  test('settings page default - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openSettings(page);

    await expect(page).toHaveScreenshot('settings-default-light.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  // Test settings page default state - dark mode
  test('settings page default - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openSettings(page);

    await expect(page).toHaveScreenshot('settings-default-dark.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  // Test quick settings section
  test('quick settings section - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openSettings(page);

    // No `count() > 0` guard (PROSO-183): a refactor dropping the testid must
    // FAIL here, not silently skip the snapshot. The section is a plain card
    // (not an accordion), so no DOM-state expansion is needed.
    const quickSettings = page.locator('[data-testid="settings-quick-settings-section"]');
    await expect(quickSettings).toBeVisible();
    await expect(quickSettings.locator('[data-testid="settings-provider-select"]')).toBeVisible();
    await expect(quickSettings.locator('[data-testid="settings-voice-select"]')).toBeVisible();
    await expect(quickSettings.locator('[data-testid="settings-speed-slider"]')).toBeVisible();
    await expect(quickSettings.locator('.section-reset-btn')).toBeVisible();

    await quickSettings.scrollIntoViewIfNeeded();
    await waitForLayoutStable(page, '[data-testid="settings-quick-settings-section"]', 50);

    await expect(quickSettings).toHaveScreenshot('quick-settings-section-light.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test API keys section expanded
  for (const mode of ['light', 'dark']) {
    test(`api keys section - ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await openSettings(page);
      await page.waitForLoadState('domcontentloaded');
      await disableAnimations(page);
      await waitForLayoutStable(page, 'main', 100);

      // The API-keys content lives inside the collapsed Developer accordion.
      // This harness loads the page as file:// with no extension context, so
      // options/main.ts (which binds the accordion listeners) cannot run; the
      // page's own click handler never exists here. Expand the accordion the
      // way the page would (aria-expanded + un-hide the content), then assert
      // the real UI below — a vanished accordion or testid still FAILS the
      // toBeVisible assertions, so this is not a vacuous guard.
      const developerSection = page.locator('[data-section="developer"]');
      await expect(developerSection).toBeVisible();
      await page.evaluate(() => {
        const section = document.querySelector('[data-section="developer"]');
        const header = section?.querySelector('.proso-accordion__header');
        const content = section
          ? document.getElementById(header?.getAttribute('aria-controls') ?? '')
          : null;
        header?.setAttribute('aria-expanded', 'true');
        content?.removeAttribute('hidden');
      });
      await waitForLayoutStable(page, '[data-testid="settings-api-keys-section"]', 50);
      const apiKeysSection = page.locator('[data-testid="settings-api-keys-section"]');
      await expect(apiKeysSection).toBeVisible();
      const elevenLabsCard = apiKeysSection.locator('.provider-card[data-provider="elevenlabs"]');
      await expect(elevenLabsCard).toBeVisible();
      await expect(elevenLabsCard.locator('input#elevenlabsKey')).toBeVisible();

      await apiKeysSection.scrollIntoViewIfNeeded();
      await waitForLayoutStable(page, '[data-testid="settings-api-keys-section"]', 50);

      await expect(apiKeysSection).toHaveScreenshot(`api-keys-section-${mode}.png`, {
        maxDiffPixelRatio: 0.02,
      });
    });
  }

  // Test appearance section
  test('appearance section - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openSettings(page);

    // Expand appearance section if collapsed
    const appearanceSection = page.locator('[data-testid="settings-appearance-section"]');
    if ((await appearanceSection.count()) > 0) {
      const header = appearanceSection.locator('.proso-accordion__header');
      const isExpanded = (await header.getAttribute('aria-expanded')) === 'true';
      if (!isExpanded) {
        await header.click();
        await waitForLayoutStable(page, '[data-testid="settings-appearance-section"]', 50);
      }
      await appearanceSection.scrollIntoViewIfNeeded();

      await expect(appearanceSection).toHaveScreenshot('appearance-section-light.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  // Test settings page with sidebar navigation
  test('sidebar navigation visible - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openSettings(page);

    const sidebar = page.locator('#settings-sidebar, .settings-sidebar');
    if ((await sidebar.count()) > 0) {
      await expect(sidebar).toHaveScreenshot('sidebar-navigation-light.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  // Test form controls interaction states
  test('form controls focus state', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await openSettings(page);

    // No `count() > 0` guard (PROSO-183): the provider select is a quick-settings
    // control; a refactor dropping its testid must FAIL, not silently skip.
    const providerSelect = page.locator('[data-testid="settings-provider-select"]');
    await expect(providerSelect).toBeVisible();
    await providerSelect.focus();
    await waitForLayoutStable(page, '[data-testid="settings-provider-select"]', 50);

    const quickSettings = page.locator('[data-testid="settings-quick-settings-section"]');
    await expect(quickSettings).toBeVisible();
    await expect(quickSettings).toHaveScreenshot('provider-select-focused.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test reduced motion preference
  test('settings page with reduced motion', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    await openSettings(page);

    await expect(page).toHaveScreenshot('settings-reduced-motion.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  // Test responsive layout - narrow viewport
  test('settings page narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.emulateMedia({ colorScheme: 'light' });
    await openSettings(page);

    await expect(page).toHaveScreenshot('settings-narrow-viewport.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });
});
