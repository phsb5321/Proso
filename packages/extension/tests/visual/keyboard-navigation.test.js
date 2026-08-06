/**
 * Keyboard accessibility (Feature 035 T004): every tab step asserts
 * `document.activeElement` — the historical failures were blind tab counts.
 */
import { test, expect } from '@playwright/test';
import { waitForStableState } from '../helpers/disable-animations.js';
import {
  createKeyboardPage,
  defineVisualSuite,
  playIconOpacity,
  readFocusRing,
  tabToEach,
  trackPlayClicks
} from './helpers/visual-fixture.js';

async function focusFirstPlayButton(page) {
  await createKeyboardPage(page);
  await page.focus('body');
  await tabToEach(page, ['p#p1', 'button#proso-play-icon']);
  await waitForStableState(page, '#p1 .proso-play-icon', 'opacity', '1');
}

defineVisualSuite('Keyboard Navigation Accessibility (T004)', () => {
  for (const mode of ['light', 'dark']) {
    // Test 1/2: Tab to paragraph shows play button
    test(`Tab to paragraph shows play button - ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await focusFirstPlayButton(page);

      // Verify play icon is visible (opacity > 0)
      expect(parseFloat(await playIconOpacity(page, '#p1 .proso-play-icon'))).toBeGreaterThan(0);

      await expect(page).toHaveScreenshot(`tab-to-paragraph-${mode}.png`, {
        maxDiffPixelRatio: 0.02
      });
    });

    // Test 3/4: Tab to play button shows focus ring
    test(`Tab to play button shows focus ring - ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await focusFirstPlayButton(page);

      // Verify the focus ring is visible: the icon is at full opacity
      const focusRingStyle = await readFocusRing(page, '#p1 .proso-play-icon');
      expect(parseFloat(focusRingStyle.opacity)).toBe(1);

      await expect(page).toHaveScreenshot(`tab-to-play-button-focus-${mode}.png`, {
        maxDiffPixelRatio: 0.02
      });
    });
  }

  // Test 5/6: Enter/Space activate the focused play button (native button
  // semantics — the browser fires a real click event on the button)
  for (const { key, label, targets, expectedIndex } of [
    { key: 'Enter', label: 'Enter key', targets: ['p#p1', 'button#proso-play-icon'], expectedIndex: 0 },
    { key: 'Space', label: 'Space key', targets: ['p#p1', 'button#proso-play-icon', 'p#p2', 'button#proso-play-icon'], expectedIndex: 1 }
  ]) {
    test(`${label} on focused play button triggers click event`, async ({ page }) => {
      await createKeyboardPage(page);
      await trackPlayClicks(page);

      // Tab to the target play icon
      await page.focus('body');
      await tabToEach(page, targets);

      // Press the activation key
      await page.keyboard.press(key);

      // Verify click was triggered by the browser's native button activation
      const result = await page.evaluate(() => ({
        clicked: window.playButtonClicked,
        index: window.clickedIndex
      }));

      expect(result.clicked).toBe(true);
      expect(result.index).toBe(expectedIndex);
    });
  }

  // Test 7: Focus-within on paragraph shows play icon
  test('focus-within on paragraph shows play icon', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await createKeyboardPage(page);

    // Directly focus the paragraph (not the play icon)
    await page.focus('#p1');

    await waitForStableState(page, '#p1 .proso-play-icon', 'opacity', '1');

    // Check that play icon is visible
    expect(parseFloat(await playIconOpacity(page, '#p1 .proso-play-icon'))).toBeGreaterThan(0);

    await expect(page).toHaveScreenshot('focus-within-paragraph-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test 8: ARIA attributes are correctly set (shipped icon contract)
  test('play button has correct ARIA attributes', async ({ page }) => {
    await createKeyboardPage(page);

    const ariaAttributes = await page.evaluate(() => {
      const icons = document.querySelectorAll('.proso-play-icon');
      return Array.from(icons).map((icon, index) => ({
        tagName: icon.tagName,
        // Native <button> has the implicit role 'button'
        role: icon.getAttribute('role') || (icon.tagName === 'BUTTON' ? 'button' : null),
        ariaLabel: icon.getAttribute('aria-label'),
        tabindex: icon.getAttribute('tabindex'),
        type: icon.getAttribute('type'),
        hasCorrectLabel: icon.getAttribute('aria-label')?.includes(`paragraph ${index + 1}`)
      }));
    });

    // Verify all icons have the shipped ARIA contract
    ariaAttributes.forEach((attrs) => {
      expect(attrs.role).toBe('button');
      expect(attrs.type).toBe('button');
      expect(attrs.tabindex).toBe('0');
      expect(attrs.hasCorrectLabel).toBe(true);
    });
  });

  // Test 9: Focus order follows visual layout
  test('focus order follows visual layout', async ({ page }) => {
    await createKeyboardPage(page);

    // Track focus order
    const focusOrder = [];
    await page.evaluate(() => {
      window.focusOrder = [];
      document.querySelectorAll('[tabindex], a, button, input').forEach((el) => {
        el.addEventListener('focus', () => {
          window.focusOrder.push(`${el.tagName}#${el.id || el.className}`);
        });
      });
    });

    // Tab through all focusable elements
    await page.focus('body');
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
    }

    const order = await page.evaluate(() => window.focusOrder);

    // Focus must move through paragraphs and their play buttons in document
    // order: p1 -> p1.play-icon -> p2 -> p2.play-icon -> p3 -> p3.play-icon
    expect(order).toEqual([
      'P#p1',
      'BUTTON#proso-play-icon',
      'P#p2',
      'BUTTON#proso-play-icon',
      'P#p3',
      'BUTTON#proso-play-icon'
    ]);
  });

  // Test 10: Reduced motion preference
  test('reduced motion preference disables animations on focus', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce'
    });
    await createKeyboardPage(page);

    // Tab to first paragraph, then to its play button
    await page.focus('body');
    await tabToEach(page, ['p#p1', 'button#proso-play-icon']);

    await expect(page).toHaveScreenshot('keyboard-focus-reduced-motion.png', {
      maxDiffPixelRatio: 0.02
    });
  });
});
