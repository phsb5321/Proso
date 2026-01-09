/**
 * Animation Control Helper for Playwright Visual Tests
 *
 * Disables CSS animations and transitions to eliminate timing-based flakiness
 * in screenshot comparison tests.
 *
 * Usage:
 *   import { disableAnimations, waitForStableState } from '../helpers/disable-animations.js';
 *
 *   test.beforeEach(async ({ page }) => {
 *     await disableAnimations(page);
 *   });
 *
 *   test('screenshot test', async ({ page }) => {
 *     await page.hover('#element');
 *     await waitForStableState(page, '#element', 'opacity', '1');
 *     await expect(page).toHaveScreenshot('stable.png');
 *   });
 */

/**
 * Disable all CSS animations and transitions on the page
 * @param {import('@playwright/test').Page} page - Playwright page object
 */
export async function disableAnimations(page) {
  await page.addStyleTag({
    content: `
      /* Disable all animations and transitions for deterministic screenshots */
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }

      /* Disable smooth scrolling */
      html {
        scroll-behavior: auto !important;
      }

      /* Disable any animated backgrounds */
      * {
        background-attachment: initial !important;
      }
    `
  });
}

/**
 * Wait for an element to reach a specific CSS property value
 * Replaces waitForTimeout() with explicit state waiting
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} selector - CSS selector for the element
 * @param {string} property - CSS property name (e.g., 'opacity', 'visibility')
 * @param {string} expectedValue - Expected value of the property
 * @param {number} timeout - Maximum wait time in milliseconds (default: 5000)
 */
export async function waitForStableState(page, selector, property, expectedValue, timeout = 5000) {
  await page.waitForFunction(
    ({ selector, property, expectedValue }) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const computedValue = getComputedStyle(element)[property];
      return computedValue === expectedValue;
    },
    { selector, property, expectedValue },
    { timeout }
  );
}

/**
 * Wait for an element to be visible and stable (no ongoing layout changes)
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} selector - CSS selector for the element
 * @param {number} stabilityTime - Time in ms the element must remain unchanged (default: 100)
 */
export async function waitForLayoutStable(page, selector, stabilityTime = 100) {
  await page.waitForFunction(
    ({ selector, stabilityTime }) => {
      return new Promise((resolve) => {
        const element = document.querySelector(selector);
        if (!element) {
          resolve(false);
          return;
        }

        let lastRect = element.getBoundingClientRect();
        let stableCount = 0;
        const checkInterval = 20;
        const requiredChecks = Math.ceil(stabilityTime / checkInterval);

        const check = () => {
          const currentRect = element.getBoundingClientRect();
          if (
            currentRect.width === lastRect.width &&
            currentRect.height === lastRect.height &&
            currentRect.x === lastRect.x &&
            currentRect.y === lastRect.y
          ) {
            stableCount++;
            if (stableCount >= requiredChecks) {
              resolve(true);
              return;
            }
          } else {
            stableCount = 0;
            lastRect = currentRect;
          }
          setTimeout(check, checkInterval);
        };

        check();
      });
    },
    { selector, stabilityTime },
    { timeout: 5000 }
  );
}

/**
 * Wait for all images in the page to load
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 */
export async function waitForImagesLoaded(page) {
  await page.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll('img'));
    return images.every(img => img.complete && img.naturalHeight !== 0);
  }, { timeout: 10000 });
}

/**
 * Inject a style tag and wait for it to be applied
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} css - CSS content to inject
 */
export async function injectStyleAndWait(page, css) {
  await page.addStyleTag({ content: css });
  // Wait a frame for styles to apply
  await page.waitForFunction(() => true);
}
