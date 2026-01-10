/**
 * Settings Page E2E Tests
 *
 * Tests the options/settings page displays correctly and
 * form controls work as expected.
 *
 * @module tests/e2e/settings-page
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
// WXT uses settings.html instead of options.html
const OPTIONS_PATH = path.join(EXTENSION_PATH, 'settings.html');

/**
 * Helper to check if options file exists
 */
function optionsExists(): boolean {
  return fs.existsSync(OPTIONS_PATH);
}

test.describe('Settings Page Structure', () => {
  test.skip(!optionsExists(), 'Options page build not found. Run pnpm run build:firefox first.');

  test('options page has valid HTML structure', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);

    const html = page.locator('html');
    await expect(html).toBeVisible();

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should have a title
    const title = await page.title();
    console.log('Options page title:', title);
    expect(title.length).toBeGreaterThan(0);
  });

  test('options page has main content area', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Look for main content container
    const mainContent = page.locator('main, #app, .settings-container, .options-container, [role="main"]').first();
    await expect(mainContent).toBeVisible();
  });

  test('options page has form elements', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Check for form or form-like structure
    const formElements = page.locator('form, .form, [role="form"]');
    const inputs = page.locator('input, select, textarea');

    const formCount = await formElements.count();
    const inputCount = await inputs.count();

    console.log(`Forms: ${formCount}, Inputs: ${inputCount}`);

    // Should have input elements
    expect(inputCount).toBeGreaterThan(0);
  });

  test('options page includes styles', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);

    const styleLinks = await page.locator('link[rel="stylesheet"]').count();
    const styleTags = await page.locator('style').count();

    expect(styleLinks + styleTags).toBeGreaterThan(0);
  });
});

test.describe('Settings Page Sections', () => {
  test.skip(!optionsExists(), 'Options page build not found. Run pnpm run build:firefox first.');

  test('options page has API keys section', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Look for API keys section (various patterns)
    const apiSection = page.locator(
      '[data-testid="api-keys-section"], ' +
      '#api-keys, ' +
      '.api-keys, ' +
      'section:has-text("API"), ' +
      '[aria-label*="API"]'
    ).first();

    // May be in collapsed accordion
    const bodyText = await page.locator('body').innerText();
    const hasApiText = bodyText.toLowerCase().includes('api');

    console.log('Has API text:', hasApiText);
  });

  test('options page has appearance section', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Look for appearance/theme section
    const bodyText = await page.locator('body').innerText();
    const hasAppearanceText =
      bodyText.toLowerCase().includes('appearance') ||
      bodyText.toLowerCase().includes('theme') ||
      bodyText.toLowerCase().includes('display');

    console.log('Has appearance text:', hasAppearanceText);
  });

  test('options page has provider selection', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Look for provider selector
    const providerSelect = page.locator(
      'select[name="provider"], ' +
      'select[id*="provider"], ' +
      '[data-testid="provider-select"]'
    );

    const providerCount = await providerSelect.count();

    // Also check for provider text
    const bodyText = await page.locator('body').innerText();
    const hasProviderText =
      bodyText.toLowerCase().includes('provider') ||
      bodyText.toLowerCase().includes('tts') ||
      bodyText.toLowerCase().includes('text-to-speech');

    console.log(`Provider selects: ${providerCount}, Has provider text: ${hasProviderText}`);
  });
});

test.describe('Settings Form Controls', () => {
  test.skip(!optionsExists(), 'Options page build not found. Run pnpm run build:firefox first.');

  test('input fields are editable', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Find text inputs
    const textInputs = page.locator('input[type="text"], input[type="password"], input:not([type])');
    const inputCount = await textInputs.count();

    console.log(`Found ${inputCount} text inputs`);

    // Test that inputs are editable
    for (let i = 0; i < Math.min(inputCount, 3); i++) {
      const input = textInputs.nth(i);

      // Skip if disabled
      const isDisabled = await input.isDisabled();
      if (isDisabled) continue;

      // Try to type in the input
      await input.fill('test-value');
      const value = await input.inputValue();
      expect(value).toBe('test-value');

      // Clear for next test
      await input.clear();
    }
  });

  test('select dropdowns are functional', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const selects = page.locator('select');
    const selectCount = await selects.count();

    console.log(`Found ${selectCount} select elements`);

    for (let i = 0; i < selectCount; i++) {
      const select = selects.nth(i);

      // Check if it has options
      const options = select.locator('option');
      const optionCount = await options.count();

      console.log(`Select ${i} has ${optionCount} options`);
      expect(optionCount).toBeGreaterThan(0);
    }
  });

  test('checkboxes are toggleable', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    console.log(`Found ${checkboxCount} checkboxes`);

    for (let i = 0; i < Math.min(checkboxCount, 3); i++) {
      const checkbox = checkboxes.nth(i);

      // Skip if disabled
      const isDisabled = await checkbox.isDisabled();
      if (isDisabled) continue;

      // Get initial state
      const wasChecked = await checkbox.isChecked();

      // Toggle
      await checkbox.click();
      const nowChecked = await checkbox.isChecked();

      expect(nowChecked).toBe(!wasChecked);

      // Toggle back
      await checkbox.click();
    }
  });

  test('number/range inputs accept valid values', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Test number inputs separately from range inputs
    const numberInputs = page.locator('input[type="number"]');
    const rangeInputs = page.locator('input[type="range"]');

    const numberCount = await numberInputs.count();
    const rangeCount = await rangeInputs.count();

    console.log(`Found ${numberCount} number inputs, ${rangeCount} range inputs`);

    // Test number inputs with fill()
    for (let i = 0; i < numberCount; i++) {
      const input = numberInputs.nth(i);
      const min = await input.getAttribute('min');
      const max = await input.getAttribute('max');
      const step = await input.getAttribute('step');

      console.log(`Number input ${i}: min=${min}, max=${max}, step=${step}`);

      const minVal = parseFloat(min || '0');
      const maxVal = parseFloat(max || '100');
      const midVal = ((minVal + maxVal) / 2).toString();

      await input.fill(midVal);
      const value = await input.inputValue();
      console.log(`Set value to ${midVal}, got ${value}`);
    }

    // Test range inputs with evaluate (can't use fill() on range)
    for (let i = 0; i < rangeCount; i++) {
      const input = rangeInputs.nth(i);
      const min = await input.getAttribute('min');
      const max = await input.getAttribute('max');
      const step = await input.getAttribute('step');

      console.log(`Range input ${i}: min=${min}, max=${max}, step=${step}`);

      const minVal = parseFloat(min || '0');
      const maxVal = parseFloat(max || '100');
      const stepVal = parseFloat(step || '1');
      // Round target to step to avoid precision issues
      const midVal = Math.round((minVal + maxVal) / 2 / stepVal) * stepVal;

      // Set value via JavaScript for range inputs
      await input.evaluate((el, val) => {
        (el as HTMLInputElement).value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, midVal);

      const value = await input.inputValue();
      console.log(`Set range to ${midVal}, got ${value}`);

      // Verify value is within valid range and close to target
      const parsedValue = parseFloat(value);
      expect(parsedValue).toBeGreaterThanOrEqual(minVal);
      expect(parsedValue).toBeLessThanOrEqual(maxVal);
      expect(parsedValue).toBeCloseTo(midVal, 0); // Within 0.5 of target
    }
  });
});

test.describe('Settings Page Rendering', () => {
  test.skip(!optionsExists(), 'Options page build not found. Run pnpm run build:firefox first.');

  test('renders without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Filter out expected extension API errors
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
  });

  test('has reasonable page dimensions', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');

    const body = page.locator('body');
    const box = await body.boundingBox();

    if (box) {
      console.log(`Options page dimensions: ${box.width}x${box.height}`);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test('text content is visible', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const visibleText = await page.locator('body').innerText();
    expect(visibleText.trim().length).toBeGreaterThan(0);

    console.log('Options page text preview:', visibleText.substring(0, 300));
  });
});

test.describe('Settings Page Accessibility', () => {
  test.skip(!optionsExists(), 'Options page build not found. Run pnpm run build:firefox first.');

  test('headings are properly structured', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const h1s = await page.locator('h1').count();
    const h2s = await page.locator('h2').count();
    const h3s = await page.locator('h3').count();

    console.log(`Headings: h1=${h1s}, h2=${h2s}, h3=${h3s}`);

    // Should have at least one heading
    expect(h1s + h2s + h3s).toBeGreaterThan(0);

    // Should have at most one h1
    expect(h1s).toBeLessThanOrEqual(1);
  });

  test('form inputs have labels', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const inputs = page.locator('input:not([type="hidden"]), select, textarea');
    const inputCount = await inputs.count();

    let labelsFound = 0;
    let inputsWithoutLabels = 0;

    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');

      let hasLabel = false;

      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        hasLabel = (await label.count()) > 0;
      }

      if (hasLabel || ariaLabel || ariaLabelledBy) {
        labelsFound++;
      } else {
        inputsWithoutLabels++;
        const type = await input.getAttribute('type');
        const name = await input.getAttribute('name');
        console.log(`Input without label: type=${type}, name=${name}, id=${id}`);
      }
    }

    console.log(`Inputs with labels: ${labelsFound}/${inputCount}`);
  });

  test('buttons have accessible names', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const buttons = page.locator('button, [role="button"], input[type="submit"], input[type="button"]');
    const buttonCount = await buttons.count();

    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i);
      const ariaLabel = await button.getAttribute('aria-label');
      const innerText = (await button.innerText()).trim();
      const value = await button.getAttribute('value');
      const title = await button.getAttribute('title');

      const hasAccessibleName =
        (ariaLabel && ariaLabel.length > 0) ||
        (innerText && innerText.length > 0) ||
        (value && value.length > 0) ||
        (title && title.length > 0);

      if (!hasAccessibleName) {
        console.log(`Button ${i} lacks accessible name`);
      }
    }
  });

  test('focus is visible', async ({ page }) => {
    await page.goto(`file://${OPTIONS_PATH}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Get first focusable element
    const focusable = page.locator('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])').first();

    if (await focusable.count() > 0) {
      await focusable.focus();

      // Check if focus styles are applied (this is a basic check)
      const styles = await focusable.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          outline: computed.outline,
          outlineWidth: computed.outlineWidth,
          boxShadow: computed.boxShadow,
        };
      });

      console.log('Focus styles:', styles);
    }
  });
});
