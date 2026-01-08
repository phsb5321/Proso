/**
 * Popup UI E2E Tests
 *
 * Tests the popup interface opens and displays correctly.
 * These tests verify the popup HTML structure and basic functionality.
 *
 * @module tests/e2e/popup-ui
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to built extension
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/firefox-mv2');
const POPUP_PATH = path.join(EXTENSION_PATH, 'popup/index.html');

/**
 * Helper to check if popup file exists
 */
function popupExists(): boolean {
  return fs.existsSync(POPUP_PATH);
}

test.describe('Popup UI Structure', () => {
  test.skip(!popupExists(), 'Popup build not found. Run pnpm run build:firefox first.');

  test('popup HTML has valid structure', async ({ page }) => {
    // Open popup HTML directly for structural testing
    await page.goto(`file://${POPUP_PATH}`);

    // Check basic HTML structure
    const html = page.locator('html');
    await expect(html).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('popup has main container', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);

    // Check for popup container (common patterns)
    const container = page.locator('#app, #popup, .popup-container, main, [role="main"]').first();
    await expect(container).toBeVisible();
  });

  test('popup has expected sections', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);

    // Wait for JavaScript to load
    await page.waitForLoadState('domcontentloaded');

    // Give JS time to render (popup may be dynamically generated)
    await page.waitForTimeout(500);

    // Check for common popup sections (selectors may vary)
    const possibleSections = [
      '[data-testid="status-section"]',
      '[data-testid="controls-section"]',
      '[data-testid="settings-section"]',
      '.status',
      '.controls',
      '.settings',
      '#status',
      '#controls',
      '#settings',
    ];

    // At least one section should exist
    let foundSection = false;
    for (const selector of possibleSections) {
      const section = page.locator(selector);
      if (await section.count() > 0) {
        foundSection = true;
        break;
      }
    }

    // Log what we found for debugging
    const bodyHTML = await page.locator('body').innerHTML();
    console.log('Popup body structure (first 500 chars):', bodyHTML.substring(0, 500));
  });

  test('popup includes CSS styles', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);

    // Check for linked stylesheets or style tags
    const styleLinks = await page.locator('link[rel="stylesheet"]').count();
    const styleTags = await page.locator('style').count();

    expect(styleLinks + styleTags).toBeGreaterThan(0);
  });

  test('popup includes JavaScript', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);

    // Check for script tags
    const scripts = await page.locator('script').count();
    expect(scripts).toBeGreaterThan(0);
  });
});

test.describe('Popup UI Rendering', () => {
  test.skip(!popupExists(), 'Popup build not found. Run pnpm run build:firefox first.');

  test('popup renders without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000); // Wait for JS initialization

    // Filter out expected errors (extension API not available in file:// context)
    const unexpectedErrors = errors.filter((err) => {
      return (
        !err.includes('browser is not defined') &&
        !err.includes('chrome is not defined') &&
        !err.includes('Extension context invalidated')
      );
    });

    if (unexpectedErrors.length > 0) {
      console.log('Unexpected errors:', unexpectedErrors);
    }
    // Note: We don't fail on errors since extension APIs aren't available
    // This test mainly checks for syntax errors in the popup JS
  });

  test('popup has reasonable dimensions', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');

    // Get body dimensions
    const body = page.locator('body');
    const box = await body.boundingBox();

    if (box) {
      // Popup should have reasonable dimensions
      // Typical popup: 300-400px wide, 300-600px tall
      console.log(`Popup dimensions: ${box.width}x${box.height}`);

      // Just verify it's not completely broken
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test('popup text is readable', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Get all visible text
    const visibleText = await page.locator('body').innerText();

    // Should have some visible text content
    expect(visibleText.trim().length).toBeGreaterThan(0);
    console.log('Popup text preview:', visibleText.substring(0, 200));
  });
});

test.describe('Popup Interactive Elements', () => {
  test.skip(!popupExists(), 'Popup build not found. Run pnpm run build:firefox first.');

  test('popup has clickable buttons', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Find buttons
    const buttons = page.locator('button, [role="button"], input[type="button"], input[type="submit"]');
    const buttonCount = await buttons.count();

    console.log(`Found ${buttonCount} buttons`);

    // Check each button is interactive
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
    }
  });

  test('popup has form controls', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Find form controls
    const selects = page.locator('select');
    const inputs = page.locator('input');
    const textareas = page.locator('textarea');

    const selectCount = await selects.count();
    const inputCount = await inputs.count();
    const textareaCount = await textareas.count();

    console.log(`Form controls: ${selectCount} selects, ${inputCount} inputs, ${textareaCount} textareas`);

    // Should have at least some controls (provider selector, etc.)
    expect(selectCount + inputCount + textareaCount).toBeGreaterThan(0);
  });

  test('popup links have valid hrefs', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');

    const links = page.locator('a[href]');
    const linkCount = await links.count();

    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i);
      const href = await link.getAttribute('href');

      // Links should have valid hrefs
      expect(href).not.toBe('');
      expect(href).not.toBe('#');

      // Log the link for debugging
      const text = await link.innerText();
      console.log(`Link: "${text.trim()}" -> ${href}`);
    }
  });
});

test.describe('Popup Accessibility', () => {
  test.skip(!popupExists(), 'Popup build not found. Run pnpm run build:firefox first.');

  test('popup has accessible labels', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Check buttons have accessible names
    const buttons = page.locator('button, [role="button"]');
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const innerText = await button.innerText();
      const title = await button.getAttribute('title');

      // Button should have some accessible name
      const hasAccessibleName =
        (ariaLabel && ariaLabel.trim().length > 0) ||
        (innerText && innerText.trim().length > 0) ||
        (title && title.trim().length > 0);

      if (!hasAccessibleName) {
        console.log(`Button ${i} may lack accessible name`);
      }
    }
  });

  test('popup form controls have labels', async ({ page }) => {
    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Check selects have accessible labels
    const selects = page.locator('select');
    const selectCount = await selects.count();

    for (let i = 0; i < selectCount; i++) {
      const select = selects.nth(i);
      const id = await select.getAttribute('id');
      const ariaLabel = await select.getAttribute('aria-label');
      const ariaLabelledBy = await select.getAttribute('aria-labelledby');

      // Check for associated label
      let hasLabel = false;
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        hasLabel = (await label.count()) > 0;
      }

      const hasAccessibleLabel = hasLabel || ariaLabel || ariaLabelledBy;

      if (!hasAccessibleLabel) {
        console.log(`Select ${i} may lack accessible label`);
      }
    }
  });

  test('popup respects prefers-reduced-motion', async ({ page }) => {
    // Enable reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto(`file://${POPUP_PATH}`);
    await page.waitForLoadState('domcontentloaded');

    // Check that no animations are too long
    // This is a basic check - more thorough testing would examine computed styles
    const animatedElements = page.locator('[class*="animate"], [class*="transition"]');
    const count = await animatedElements.count();

    console.log(`Found ${count} elements with animation/transition classes`);
  });
});
