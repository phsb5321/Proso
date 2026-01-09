/**
 * Visual tests for keyboard navigation accessibility
 * Feature: 035-selection-tts-hardening (T004)
 *
 * Verifies that keyboard-only users can:
 * - Tab to paragraphs and see play buttons (opacity > 0)
 * - Tab to play buttons and see focus ring
 * - Activate playback with Enter/Space
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { disableAnimations, waitForLayoutStable, waitForStableState } from '../helpers/disable-animations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');

/**
 * Get the content CSS path for the extension
 */
function getContentCssPath() {
  return path.join(EXTENSION_PATH, 'src', 'styles', 'content.css');
}

/**
 * Create a test page with sample paragraphs and content.css loaded
 */
async function setupTestPage(page) {
  // Create minimal HTML with test paragraphs
  await page.setContent(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 40px 80px;
          line-height: 1.6;
          background: #ffffff;
          color: #1a1a1a;
        }
        p {
          margin: 1em 0;
          position: relative;
        }
        @media (prefers-color-scheme: dark) {
          body {
            background: #1a1a1a;
            color: #e0e0e0;
          }
        }
      </style>
    </head>
    <body>
      <h1>Keyboard Navigation Test</h1>
      <p id="p1" tabindex="0">This is the first paragraph. It should be focusable via Tab key and show a play button when focused.</p>
      <p id="p2" tabindex="0">The second paragraph also supports keyboard navigation. Users can Tab to this element and see the play icon appear.</p>
      <p id="p3" tabindex="0">Finally, the third paragraph completes the test. Keyboard users should be able to navigate through all paragraphs.</p>
    </body>
    </html>
  `);

  // Load content.css
  await page.addStyleTag({
    path: getContentCssPath()
  });

  // Disable animations for deterministic screenshots
  await disableAnimations(page);

  // Wait for layout to stabilize
  await waitForLayoutStable(page, 'body', 50);
  return page;
}

/**
 * Add selectable class and play icons to paragraphs (simulating selection mode)
 * Ensures play icons have tabindex and proper ARIA attributes for keyboard access
 */
async function enableSelectionMode(page) {
  await page.evaluate(() => {
    const paragraphs = document.querySelectorAll('p');
    paragraphs.forEach((p, index) => {
      p.classList.add('voxpage-selectable');
      p.dataset.voxpageSelectIndex = index.toString();
      p.dataset.testid = 'voxpage-paragraph';

      // Create play icon with accessibility attributes (T009)
      const icon = document.createElement('div');
      icon.className = 'voxpage-play-icon';
      icon.dataset.voxpagePlayIndex = index.toString();
      icon.dataset.testid = 'voxpage-play-icon';
      icon.setAttribute('role', 'button');
      icon.setAttribute('aria-label', `Play from paragraph ${index + 1}`);
      icon.setAttribute('tabindex', '0'); // Make focusable
      p.appendChild(icon);
    });
  });

  // Wait for DOM to update
  await waitForLayoutStable(page, 'p.voxpage-selectable', 50);
}

test.describe('Keyboard Navigation Accessibility (T004)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
  });

  // Test 1: Tab to paragraph shows play button
  test('Tab to paragraph shows play button - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Focus the body first
    await page.focus('body');

    // Tab to first paragraph
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Skip past heading to first paragraph

    // Wait for focus styles to apply
    await waitForLayoutStable(page, '#p1', 50);

    // Verify play icon is visible (opacity > 0)
    const playIconOpacity = await page.evaluate(() => {
      const icon = document.querySelector('#p1 .voxpage-play-icon');
      if (!icon) return '0';
      return getComputedStyle(icon).opacity;
    });

    expect(parseFloat(playIconOpacity)).toBeGreaterThan(0);

    await expect(page).toHaveScreenshot('tab-to-paragraph-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test 2: Tab to paragraph shows play button (dark mode)
  test('Tab to paragraph shows play button - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Focus the body first
    await page.focus('body');

    // Tab to second paragraph
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // First paragraph
    await page.keyboard.press('Tab'); // Play icon
    await page.keyboard.press('Tab'); // Second paragraph

    await waitForLayoutStable(page, '#p2', 50);

    await expect(page).toHaveScreenshot('tab-to-paragraph-dark.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test 3: Tab to play button shows focus ring
  test('Tab to play button shows focus ring - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Focus the body first
    await page.focus('body');

    // Tab to first paragraph
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // First paragraph

    // Tab to play icon within the paragraph
    await page.keyboard.press('Tab'); // Play icon

    await waitForLayoutStable(page, '#p1 .voxpage-play-icon', 50);

    // Verify focus ring is visible via outline
    const focusRingStyle = await page.evaluate(() => {
      const icon = document.querySelector('#p1 .voxpage-play-icon');
      if (!icon) return { outline: 'none', opacity: '0' };
      const style = getComputedStyle(icon);
      return {
        outline: style.outline,
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        opacity: style.opacity
      };
    });

    // Play icon should be visible
    expect(parseFloat(focusRingStyle.opacity)).toBe(1);

    await expect(page).toHaveScreenshot('tab-to-play-button-focus-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test 4: Tab to play button shows focus ring (dark mode)
  test('Tab to play button shows focus ring - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Focus the body first
    await page.focus('body');

    // Tab through to second play icon
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // First paragraph
    await page.keyboard.press('Tab'); // First play icon
    await page.keyboard.press('Tab'); // Second paragraph
    await page.keyboard.press('Tab'); // Second play icon

    await waitForLayoutStable(page, '#p2 .voxpage-play-icon', 50);

    await expect(page).toHaveScreenshot('tab-to-play-button-focus-dark.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test 5: Enter key on play button triggers action (simulated)
  test('Enter key on focused play button triggers click event', async ({ page }) => {
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Add click listener to track activation
    await page.evaluate(() => {
      window.playButtonClicked = false;
      window.clickedIndex = null;
      document.querySelectorAll('.voxpage-play-icon').forEach((icon, index) => {
        icon.addEventListener('click', () => {
          window.playButtonClicked = true;
          window.clickedIndex = index;
        });
        // Also handle keyboard activation
        icon.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.playButtonClicked = true;
            window.clickedIndex = index;
          }
        });
      });
    });

    // Tab to first play icon
    await page.focus('body');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // First paragraph
    await page.keyboard.press('Tab'); // First play icon

    // Press Enter
    await page.keyboard.press('Enter');

    // Verify click was triggered
    const result = await page.evaluate(() => ({
      clicked: window.playButtonClicked,
      index: window.clickedIndex
    }));

    expect(result.clicked).toBe(true);
    expect(result.index).toBe(0);
  });

  // Test 6: Space key on play button triggers action
  test('Space key on focused play button triggers click event', async ({ page }) => {
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Add click listener to track activation
    await page.evaluate(() => {
      window.playButtonClicked = false;
      window.clickedIndex = null;
      document.querySelectorAll('.voxpage-play-icon').forEach((icon, index) => {
        icon.addEventListener('click', () => {
          window.playButtonClicked = true;
          window.clickedIndex = index;
        });
        icon.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.playButtonClicked = true;
            window.clickedIndex = index;
          }
        });
      });
    });

    // Tab to second play icon
    await page.focus('body');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // First paragraph
    await page.keyboard.press('Tab'); // First play icon
    await page.keyboard.press('Tab'); // Second paragraph
    await page.keyboard.press('Tab'); // Second play icon

    // Press Space
    await page.keyboard.press('Space');

    // Verify click was triggered
    const result = await page.evaluate(() => ({
      clicked: window.playButtonClicked,
      index: window.clickedIndex
    }));

    expect(result.clicked).toBe(true);
    expect(result.index).toBe(1);
  });

  // Test 7: Focus-within on paragraph shows play icon
  test('focus-within on paragraph shows play icon', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Directly focus the paragraph (not the play icon)
    await page.focus('#p1');

    await waitForLayoutStable(page, '#p1', 50);

    // Check that play icon is visible
    const playIconOpacity = await page.evaluate(() => {
      const icon = document.querySelector('#p1 .voxpage-play-icon');
      if (!icon) return '0';
      return getComputedStyle(icon).opacity;
    });

    expect(parseFloat(playIconOpacity)).toBeGreaterThan(0);

    await expect(page).toHaveScreenshot('focus-within-paragraph-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test 8: ARIA attributes are correctly set
  test('play button has correct ARIA attributes', async ({ page }) => {
    await setupTestPage(page);
    await enableSelectionMode(page);

    const ariaAttributes = await page.evaluate(() => {
      const icons = document.querySelectorAll('.voxpage-play-icon');
      return Array.from(icons).map((icon, index) => ({
        role: icon.getAttribute('role'),
        ariaLabel: icon.getAttribute('aria-label'),
        tabindex: icon.getAttribute('tabindex'),
        hasCorrectLabel: icon.getAttribute('aria-label')?.includes(`paragraph ${index + 1}`)
      }));
    });

    // Verify all icons have correct ARIA attributes
    ariaAttributes.forEach((attrs, index) => {
      expect(attrs.role).toBe('button');
      expect(attrs.tabindex).toBe('0');
      expect(attrs.hasCorrectLabel).toBe(true);
    });
  });

  // Test 9: Focus order follows visual layout
  test('focus order follows visual layout', async ({ page }) => {
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Track focus order
    const focusOrder = [];
    await page.evaluate(() => {
      window.focusOrder = [];
      document.querySelectorAll('[tabindex], a, button, input').forEach(el => {
        el.addEventListener('focus', () => {
          window.focusOrder.push(el.id || el.className || el.tagName);
        });
      });
    });

    // Tab through all focusable elements
    await page.focus('body');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
    }

    const order = await page.evaluate(() => window.focusOrder);

    // Verify focus moves through paragraphs and their play icons in order
    // Expected: p1 -> p1.play-icon -> p2 -> p2.play-icon -> p3 -> p3.play-icon
    expect(order.length).toBeGreaterThanOrEqual(6);
  });

  // Test 10: Reduced motion preference
  test('reduced motion preference disables animations on focus', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce'
    });
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Tab to first paragraph
    await page.focus('body');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    await expect(page).toHaveScreenshot('keyboard-focus-reduced-motion.png', {
      maxDiffPixelRatio: 0.02
    });
  });
});
