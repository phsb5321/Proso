/**
 * VoxPage Popup Visual Regression Tests
 * Tests various UI states for visual consistency
 */
import { test, expect } from '@playwright/test';
import {
  getPopupUrl,
  setupPageWithTokens,
  setUiState,
  setColorScheme,
  POPUP_VIEWPORT
} from './helpers/extension-loader.js';

test.describe('Popup Visual Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(POPUP_VIEWPORT);
  });

  // T034: Popup idle state (dark mode)
  test('idle state - dark mode', async ({ page }) => {
    await setColorScheme(page, 'dark');
    await setupPageWithTokens(page);
    await setUiState(page, 'idle');

    await expect(page).toHaveScreenshot('popup-idle-dark.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  // T035: Popup idle state (light mode)
  test('idle state - light mode', async ({ page }) => {
    await setColorScheme(page, 'light');
    await setupPageWithTokens(page);
    await setUiState(page, 'idle');

    await expect(page).toHaveScreenshot('popup-idle-light.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  // T036: Popup playing state
  test('playing state - dark mode', async ({ page }) => {
    await setColorScheme(page, 'dark');
    await setupPageWithTokens(page);
    await setUiState(page, 'playing');

    await expect(page).toHaveScreenshot('popup-playing-dark.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  // T037: Popup paused state
  test('paused state - dark mode', async ({ page }) => {
    await setColorScheme(page, 'dark');
    await setupPageWithTokens(page);
    await setUiState(page, 'paused');

    await expect(page).toHaveScreenshot('popup-paused-dark.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  // T038: Popup error banner state
  test('error banner state - dark mode', async ({ page }) => {
    await setColorScheme(page, 'dark');
    await setupPageWithTokens(page);
    await setUiState(page, 'error');

    await expect(page).toHaveScreenshot('popup-error-dark.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  // T039: Popup onboarding overlay state
  test('onboarding overlay state - dark mode', async ({ page }) => {
    await setColorScheme(page, 'dark');
    await setupPageWithTokens(page);

    // Create onboarding overlay dynamically
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.className = 'onboarding-overlay';
      overlay.id = 'onboardingOverlay';

      const tooltip = document.createElement('div');
      tooltip.className = 'onboarding-tooltip';
      tooltip.innerHTML = `
        <h2 class="onboarding-title">Welcome to VoxPage!</h2>
        <p class="onboarding-text">
          Click the play button to have any webpage read aloud to you.
        </p>
        <button class="onboarding-dismiss">Got it!</button>
      `;

      overlay.appendChild(tooltip);
      document.body.appendChild(overlay);
    });

    await page.waitForTimeout(100);

    await expect(page).toHaveScreenshot('popup-onboarding-dark.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  // Additional tests for comprehensive coverage
  test('playing state - light mode', async ({ page }) => {
    await setColorScheme(page, 'light');
    await setupPageWithTokens(page);
    await setUiState(page, 'playing');

    await expect(page).toHaveScreenshot('popup-playing-light.png', {
      maxDiffPixelRatio: 0.01
    });
  });

  test('error banner state - light mode', async ({ page }) => {
    await setColorScheme(page, 'light');
    await setupPageWithTokens(page);
    await setUiState(page, 'error');

    await expect(page).toHaveScreenshot('popup-error-light.png', {
      maxDiffPixelRatio: 0.01
    });
  });
});
