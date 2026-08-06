/**
 * Visual tests for paragraph selection hover preview styling
 * Feature: 011-highlight-playback-fix (T035)
 *
 * Updated for 036-testing-strategy:
 * - Uses disableAnimations helper for deterministic screenshots (T037/T038)
 * - Replaced waitForTimeout with explicit state waits
 * - Shared fixture (helpers/visual-fixture.js) so the hover and keyboard
 *   suites render the same article and the same shipped-style play icons
 */
import { test, expect } from '@playwright/test';
import { waitForLayoutStable } from '../helpers/disable-animations.js';
import { createArticlePage, defineVisualSuite, enableSelectionMode, selectParagraph } from './helpers/visual-fixture.js';

defineVisualSuite('Hover Preview Visual Tests (T035)', () => {
  // Test selectable paragraph base styling (light/dark)
  for (const mode of ['light', 'dark']) {
    test(`selectable paragraphs - ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await createArticlePage(page);
      await enableSelectionMode(page);

      await expect(page).toHaveScreenshot(`selection-mode-${mode}.png`, {
        maxDiffPixelRatio: 0.02
      });
    });

    // Test hover state with play icon visible
    test(`hover state with play icon - ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await createArticlePage(page);
      await enableSelectionMode(page);

      // Hover over second paragraph
      await page.hover('#p2');
      // With animations disabled, we just need to wait for hover to apply
      await waitForLayoutStable(page, '#p2', 50);

      await expect(page).toHaveScreenshot(`hover-state-${mode}.png`, {
        maxDiffPixelRatio: 0.02
      });
    });

    // Test selected paragraph styling
    test(`selected paragraph styling - ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await createArticlePage(page);
      await enableSelectionMode(page);
      await selectParagraph(page, 1); // Select second paragraph

      await expect(page).toHaveScreenshot(`selected-paragraph-${mode}.png`, {
        maxDiffPixelRatio: 0.02
      });
    });
  }

  // Test play icon hover effect
  test('play icon hover effect - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await createArticlePage(page);
    await enableSelectionMode(page);

    // First hover paragraph to show play icon
    await page.hover('#p2');
    await waitForLayoutStable(page, '#p2', 50);

    // Then hover play icon specifically
    await page.hover('#p2 .proso-play-icon');
    await waitForLayoutStable(page, '#p2 .proso-play-icon', 50);

    await expect(page).toHaveScreenshot('play-icon-hover-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test reduced motion preference
  test('reduced motion preference', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce'
    });
    await createArticlePage(page);
    await enableSelectionMode(page);

    // Hover should not have transition animation
    await page.hover('#p2');

    await expect(page).toHaveScreenshot('reduced-motion.png', {
      maxDiffPixelRatio: 0.02
    });
  });
});
