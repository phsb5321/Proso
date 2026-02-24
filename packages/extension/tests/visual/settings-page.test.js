/**
 * Visual tests for settings page UI
 * Feature: 036-testing-strategy (T040)
 *
 * Tests visual appearance of the settings page
 * in various states (sections expanded/collapsed, light/dark mode).
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { disableAnimations, waitForLayoutStable } from '../helpers/disable-animations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to built extension settings page
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/firefox-mv2');
const SETTINGS_PATH = path.join(EXTENSION_PATH, 'settings.html');

/**
 * Check if settings page exists in build
 */
function settingsExists() {
  return fs.existsSync(SETTINGS_PATH);
}

test.describe('Settings Page Visual Tests (T040)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
  });

  test.skip(!settingsExists(), 'Settings page build not found. Run pnpm run build:firefox first.');

  // Test settings page default state - light mode
  test('settings page default - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    await expect(page).toHaveScreenshot('settings-default-light.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  // Test settings page default state - dark mode
  test('settings page default - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    await expect(page).toHaveScreenshot('settings-default-dark.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  // Test quick settings section
  test('quick settings section - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    // Focus on quick settings section
    const quickSettings = page.locator('[data-testid="settings-quick-settings-section"]');
    if ((await quickSettings.count()) > 0) {
      await quickSettings.scrollIntoViewIfNeeded();
      await waitForLayoutStable(page, '[data-testid="settings-quick-settings-section"]', 50);

      await expect(quickSettings).toHaveScreenshot('quick-settings-section-light.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  // Test API keys section expanded
  test('api keys section expanded - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    // Expand API keys section if collapsed
    const apiKeysSection = page.locator('[data-testid="settings-api-keys-section"]');
    if ((await apiKeysSection.count()) > 0) {
      const header = apiKeysSection.locator('.proso-accordion__header');
      const isExpanded = (await header.getAttribute('aria-expanded')) === 'true';
      if (!isExpanded) {
        await header.click();
        await waitForLayoutStable(page, '[data-testid="settings-api-keys-section"]', 50);
      }
      await apiKeysSection.scrollIntoViewIfNeeded();

      await expect(apiKeysSection).toHaveScreenshot('api-keys-section-light.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  // Test appearance section
  test('appearance section - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

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
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    const sidebar = page.locator('#settings-sidebar, .settings-sidebar');
    if ((await sidebar.count()) > 0) {
      await expect(sidebar).toHaveScreenshot('sidebar-navigation-light.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  // Test settings page in dark mode with sections
  test('api keys section - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    const apiKeysSection = page.locator('[data-testid="settings-api-keys-section"]');
    if ((await apiKeysSection.count()) > 0) {
      const header = apiKeysSection.locator('.proso-accordion__header');
      const isExpanded = (await header.getAttribute('aria-expanded')) === 'true';
      if (!isExpanded) {
        await header.click();
        await waitForLayoutStable(page, '[data-testid="settings-api-keys-section"]', 50);
      }
      await apiKeysSection.scrollIntoViewIfNeeded();

      await expect(apiKeysSection).toHaveScreenshot('api-keys-section-dark.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  // Test form controls interaction states
  test('form controls focus state', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    // Focus on provider select
    const providerSelect = page.locator('[data-testid="settings-provider-select"]');
    if ((await providerSelect.count()) > 0) {
      await providerSelect.focus();
      await waitForLayoutStable(page, '[data-testid="settings-provider-select"]', 50);

      const quickSettings = page.locator('[data-testid="settings-quick-settings-section"]');
      await expect(quickSettings).toHaveScreenshot('provider-select-focused.png', {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  // Test reduced motion preference
  test('settings page with reduced motion', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    await expect(page).toHaveScreenshot('settings-reduced-motion.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  // Test responsive layout - narrow viewport
  test('settings page narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`file://${SETTINGS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await disableAnimations(page);
    await waitForLayoutStable(page, 'main', 100);

    await expect(page).toHaveScreenshot('settings-narrow-viewport.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });
});
