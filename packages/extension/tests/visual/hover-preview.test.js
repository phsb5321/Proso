/**
 * Visual tests for paragraph selection hover preview styling
 * Feature: 011-highlight-playback-fix (T035)
 *
 * Updated for 036-testing-strategy:
 * - Uses disableAnimations helper for deterministic screenshots (T037/T038)
 * - Replaced waitForTimeout with explicit state waits
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { disableAnimations, waitForLayoutStable } from '../helpers/disable-animations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');

/**
 * Get the content CSS path for the extension
 * Updated for 026-src-folder-restructure: CSS now in src/styles/
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
    <html>
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
      <h1>Test Article</h1>
      <p id="p1">This is the first paragraph of the test article. It contains enough text to demonstrate the hover preview styling when a user hovers over it during selection mode.</p>
      <p id="p2">The second paragraph has different content to help visualize how multiple paragraphs look when the selection mode is active. Each paragraph should show the play icon on hover.</p>
      <p id="p3">Finally, the third paragraph completes our test content. This ensures we can see how the styling works across multiple consecutive paragraphs.</p>
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
 */
async function enableSelectionMode(page) {
  await page.evaluate(() => {
    const paragraphs = document.querySelectorAll('p');
    paragraphs.forEach((p, index) => {
      p.classList.add('proso-selectable');
      p.dataset.prosoSelectIndex = index.toString();

      // Create play icon
      const icon = document.createElement('div');
      icon.className = 'proso-play-icon';
      icon.dataset.prosoPlayIndex = index.toString();
      icon.setAttribute('role', 'button');
      icon.setAttribute('aria-label', `Play from paragraph ${index + 1}`);
      p.appendChild(icon);
    });
  });

  // Wait for DOM to update
  await waitForLayoutStable(page, 'p', 50);
}

/**
 * Select a specific paragraph
 */
async function selectParagraph(page, index) {
  await page.evaluate((idx) => {
    const paragraphs = document.querySelectorAll('p');
    paragraphs.forEach((p, i) => {
      if (i === idx) {
        p.classList.add('proso-selected');
      } else {
        p.classList.remove('proso-selected');
      }
    });
  }, index);

  // Wait for selection styles to apply
  await waitForLayoutStable(page, 'p.proso-selected', 50);
}

test.describe('Hover Preview Visual Tests (T035)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
  });

  // Test selectable paragraph base styling (light mode)
  test('selectable paragraphs - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    await expect(page).toHaveScreenshot('selection-mode-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test selectable paragraph base styling (dark mode)
  test('selectable paragraphs - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    await expect(page).toHaveScreenshot('selection-mode-dark.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test hover state with play icon visible
  test('hover state with play icon - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Hover over second paragraph
    await page.hover('#p2');
    // With animations disabled, we just need to wait for hover to apply
    await waitForLayoutStable(page, '#p2', 50);

    await expect(page).toHaveScreenshot('hover-state-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test hover state (dark mode)
  test('hover state with play icon - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Hover over second paragraph
    await page.hover('#p2');
    await waitForLayoutStable(page, '#p2', 50);

    await expect(page).toHaveScreenshot('hover-state-dark.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test selected paragraph styling
  test('selected paragraph styling - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupTestPage(page);
    await enableSelectionMode(page);
    await selectParagraph(page, 1); // Select second paragraph

    await expect(page).toHaveScreenshot('selected-paragraph-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test selected paragraph styling (dark mode)
  test('selected paragraph styling - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupTestPage(page);
    await enableSelectionMode(page);
    await selectParagraph(page, 1);

    await expect(page).toHaveScreenshot('selected-paragraph-dark.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test play icon hover effect
  test('play icon hover effect - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupTestPage(page);
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
    await setupTestPage(page);
    await enableSelectionMode(page);

    // Hover should not have transition animation
    await page.hover('#p2');

    await expect(page).toHaveScreenshot('reduced-motion.png', {
      maxDiffPixelRatio: 0.02
    });
  });
});
