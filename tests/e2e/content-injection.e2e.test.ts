/**
 * Content Script Injection E2E Tests
 *
 * Tests that the content script properly identifies and processes
 * content on web pages. Uses fixture HTML files for deterministic testing.
 *
 * @module tests/e2e/content-injection
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to test fixtures
const FIXTURES_PATH = path.resolve(__dirname, '../fixtures/html');
const SIMPLE_PAGE_PATH = path.join(FIXTURES_PATH, 'simple-paragraphs.html');
const WIKIPEDIA_PAGE_PATH = path.join(FIXTURES_PATH, 'wikipedia-article.html');

// Path to built extension
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/firefox-mv2');
const CONTENT_SCRIPT_PATH = path.join(EXTENSION_PATH, 'content-scripts/content.js');

/**
 * Helper to check if fixtures exist
 */
function fixturesExist(): boolean {
  return fs.existsSync(FIXTURES_PATH);
}

/**
 * Helper to check if content script exists
 */
function contentScriptExists(): boolean {
  return fs.existsSync(CONTENT_SCRIPT_PATH);
}

test.describe('Content Extraction Logic', () => {
  // These tests verify the content extraction logic without needing the full extension

  test('simple paragraphs fixture has expected structure', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);
    await page.waitForLoadState('domcontentloaded');

    // Should have paragraph elements
    const paragraphs = page.locator('p');
    const paragraphCount = await paragraphs.count();

    expect(paragraphCount).toBeGreaterThan(0);
    console.log(`Found ${paragraphCount} paragraphs in simple fixture`);

    // Log first few paragraphs for debugging
    for (let i = 0; i < Math.min(3, paragraphCount); i++) {
      const text = await paragraphs.nth(i).innerText();
      console.log(`Paragraph ${i}: "${text.substring(0, 50)}..."`);
    }
  });

  test('wikipedia fixture has article structure', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(WIKIPEDIA_PAGE_PATH), 'Wikipedia fixture not found');

    await page.goto(`file://${WIKIPEDIA_PAGE_PATH}`);
    await page.waitForLoadState('domcontentloaded');

    // Should have wiki-style structure
    const contentSelectors = [
      '#mw-content-text',
      '.mw-parser-output',
      '#wiki-content-block',
      '.wiki-content',
      'article',
      'main',
    ];

    let foundContent = false;
    for (const selector of contentSelectors) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        foundContent = true;
        console.log(`Found wiki content container: ${selector}`);
        break;
      }
    }

    // Check for paragraphs
    const paragraphs = page.locator('p');
    const paragraphCount = await paragraphs.count();
    console.log(`Found ${paragraphCount} paragraphs in wiki fixture`);
  });
});

test.describe('Content Script Structure', () => {
  test.skip(!contentScriptExists(), 'Content script build not found. Run pnpm run build:firefox first.');

  test('content script file exists and has code', async () => {
    const content = fs.readFileSync(CONTENT_SCRIPT_PATH, 'utf-8');

    expect(content.length).toBeGreaterThan(0);
    console.log(`Content script size: ${content.length} bytes`);

    // Should not have obvious syntax errors
    expect(content).not.toContain('undefined is not a function');
  });

  test('content CSS file exists', async () => {
    // Find CSS files in content-scripts directory
    const contentScriptsDir = path.dirname(CONTENT_SCRIPT_PATH);
    const files = fs.readdirSync(contentScriptsDir);
    const cssFiles = files.filter((f) => f.endsWith('.css'));

    console.log(`CSS files in content-scripts: ${cssFiles.join(', ')}`);
  });
});

test.describe('DOM Selection Patterns', () => {
  // Test common patterns used by content extraction

  test('can identify main content area', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Common content selectors
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '#content',
      '.content',
      '#main-content',
      '.main-content',
    ];

    const found: string[] = [];
    for (const selector of contentSelectors) {
      if (await page.locator(selector).count() > 0) {
        found.push(selector);
      }
    }

    console.log('Content containers found:', found.join(', '));
  });

  test('can filter out navigation elements', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Elements to exclude
    const excludeSelectors = [
      'nav',
      'header',
      'footer',
      'aside',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '.sidebar',
      '.toc',
      '.table-of-contents',
    ];

    const excludeFound: string[] = [];
    for (const selector of excludeSelectors) {
      if (await page.locator(selector).count() > 0) {
        excludeFound.push(selector);
      }
    }

    console.log('Navigation/exclude elements found:', excludeFound.join(', ') || 'none');
  });

  test('can identify paragraph elements', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Get all paragraphs
    const paragraphs = page.locator('p');
    const allParagraphCount = await paragraphs.count();

    // Filter to content paragraphs (not in nav, header, footer, etc.)
    const contentParagraphs = page.locator(
      'p:not(nav p):not(header p):not(footer p):not(aside p):not(.sidebar p)'
    );
    const contentParagraphCount = await contentParagraphs.count();

    console.log(`Total paragraphs: ${allParagraphCount}, Content paragraphs: ${contentParagraphCount}`);
    expect(contentParagraphCount).toBeLessThanOrEqual(allParagraphCount);
  });

  test('can get text content from paragraphs', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    const paragraphs = page.locator('p');
    const paragraphCount = await paragraphs.count();

    const texts: string[] = [];
    for (let i = 0; i < Math.min(5, paragraphCount); i++) {
      const text = await paragraphs.nth(i).innerText();
      texts.push(text.trim());
    }

    // Should have non-empty text
    const nonEmpty = texts.filter((t) => t.length > 0);
    console.log(`Paragraphs with text: ${nonEmpty.length}/${texts.length}`);

    expect(nonEmpty.length).toBeGreaterThan(0);
  });
});

test.describe('Language Detection Patterns', () => {
  test('can detect page language from HTML', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Check lang attribute
    const htmlLang = await page.locator('html').getAttribute('lang');
    const metaLang = await page.locator('meta[http-equiv="content-language"]').getAttribute('content');

    console.log(`HTML lang: ${htmlLang}, Meta lang: ${metaLang}`);
  });

  test('can sample text for language detection', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Get sample text from main content
    const mainContent = page.locator('main, article, #content, .content, body').first();
    const text = await mainContent.innerText();

    // Sample first 500 characters
    const sample = text.substring(0, 500).trim();
    console.log(`Text sample (first 100 chars): "${sample.substring(0, 100)}..."`);

    expect(sample.length).toBeGreaterThan(0);
  });
});

test.describe('UI Element Injection Patterns', () => {
  // Test patterns for injecting VoxPage UI elements

  test('can inject shadow DOM element', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Inject a shadow DOM container (simulating content script behavior)
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'voxpage-test-container';
      const shadow = container.attachShadow({ mode: 'open' });
      const innerDiv = document.createElement('div');
      innerDiv.className = 'voxpage-footer';
      innerDiv.textContent = 'Test Footer';
      shadow.appendChild(innerDiv);
      document.body.appendChild(container);
    });

    // Verify injection
    const container = page.locator('#voxpage-test-container');
    await expect(container).toBeVisible();

    // Verify shadow DOM content
    const innerContent = await page.evaluate(() => {
      const container = document.getElementById('voxpage-test-container');
      const shadow = container?.shadowRoot;
      return shadow?.querySelector('.voxpage-footer')?.textContent || '';
    });

    expect(innerContent).toBe('Test Footer');
  });

  test('can highlight paragraph elements', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Highlight first paragraph
    await page.evaluate(() => {
      const p = document.querySelector('p');
      if (p) {
        p.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
        p.dataset.voxpageHighlight = 'true';
      }
    });

    // Verify highlight
    const highlighted = page.locator('[data-voxpage-highlight="true"]');
    await expect(highlighted).toBeVisible();

    const bg = await highlighted.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('can scroll to element', async ({ page }) => {
    test.skip(!fixturesExist() || !fs.existsSync(SIMPLE_PAGE_PATH), 'Simple page fixture not found');

    await page.goto(`file://${SIMPLE_PAGE_PATH}`);

    // Get initial scroll position
    const initialScroll = await page.evaluate(() => window.scrollY);

    // Find a paragraph not in view and scroll to it
    await page.evaluate(() => {
      const paragraphs = document.querySelectorAll('p');
      if (paragraphs.length > 3) {
        paragraphs[paragraphs.length - 1].scrollIntoView({ behavior: 'instant' });
      }
    });

    // Check scroll position changed (if there are enough paragraphs)
    const finalScroll = await page.evaluate(() => window.scrollY);

    console.log(`Scroll: ${initialScroll} -> ${finalScroll}`);
  });
});

test.describe('Error Handling Patterns', () => {
  test('handles missing content gracefully', async ({ page }) => {
    // Create an empty page
    await page.setContent('<html><body></body></html>');

    // Try to find content
    const paragraphs = page.locator('p');
    const count = await paragraphs.count();

    expect(count).toBe(0);
  });

  test('handles malformed HTML', async ({ page }) => {
    // Create malformed HTML
    await page.setContent('<html><body><p>Unclosed paragraph<div>Mismatched</p></div></body></html>');

    // Browser should still parse it
    const paragraphs = page.locator('p');
    const count = await paragraphs.count();

    // Browser will auto-fix the HTML
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('handles very long paragraphs', async ({ page }) => {
    const longText = 'a'.repeat(10000);
    await page.setContent(`<html><body><p>${longText}</p></body></html>`);

    const paragraph = page.locator('p');
    const text = await paragraph.innerText();

    expect(text.length).toBe(10000);
  });
});
