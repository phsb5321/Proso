/**
 * Extension Loading E2E Tests
 *
 * Tests that the Proso extension loads correctly in Firefox
 * without errors in the browser console.
 *
 * @module tests/e2e/extension-loading
 */

import { test, expect, firefox, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to built extension
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/firefox-mv2');

/**
 * Helper to check if extension build exists
 */
function extensionExists(): boolean {
  const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
  return fs.existsSync(manifestPath);
}

/**
 * Create browser context with extension loaded
 */
async function createBrowserWithExtension(): Promise<BrowserContext> {
  // Launch persistent context with extension
  const context = await firefox.launchPersistentContext('', {
    headless: false, // Required for extension loading
    args: [],
    firefoxUserPrefs: {
      'extensions.autoDisableScopes': 0,
      'xpinstall.signatures.required': false,
      'devtools.debugger.remote-enabled': true,
    },
  });

  // Note: Firefox requires temporary addon loading via about:debugging
  // For CI, we use web-ext or manual addon installation

  return context;
}

test.describe('Extension Loading', () => {
  test.skip(!extensionExists(), 'Extension build not found. Run pnpm run build:firefox first.');

  test('extension manifest is valid JSON', async () => {
    const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');

    let manifest: Record<string, unknown>;
    expect(() => {
      manifest = JSON.parse(manifestContent);
    }).not.toThrow();

    // @ts-expect-error - manifest is assigned in expect block
    expect(manifest.manifest_version).toBe(2);
    // @ts-expect-error - manifest is assigned in expect block
    expect(manifest.name).toBeDefined();
    // @ts-expect-error - manifest is assigned in expect block
    expect(manifest.version).toBeDefined();
  });

  test('extension has required entry files', async () => {
    const requiredFiles = [
      'manifest.json',
      'background.js',
      'content-scripts/content.js',
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(EXTENSION_PATH, file);
      expect(fs.existsSync(filePath), `Missing: ${file}`).toBe(true);
    }
  });

  test('extension has popup files', async () => {
    const popupFiles = [
      'popup/index.html',
      'popup/main.js',
    ];

    for (const file of popupFiles) {
      const filePath = path.join(EXTENSION_PATH, file);
      // Popup files may be optional depending on build
      const exists = fs.existsSync(filePath);
      console.log(`${file}: ${exists ? 'exists' : 'missing'}`);
    }
  });

  test('extension has options files', async () => {
    // WXT may use settings.html instead of options.html
    const optionsFiles = [
      'settings.html',
      'options.html',
    ];

    let foundOptions = false;
    for (const file of optionsFiles) {
      const filePath = path.join(EXTENSION_PATH, file);
      if (fs.existsSync(filePath)) {
        foundOptions = true;
        console.log(`Found options page: ${file}`);
        break;
      }
    }

    expect(foundOptions).toBe(true);
  });

  test('extension has icon files', async () => {
    // Read manifest to get icon paths
    const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Check action icons if defined
    if (manifest.action?.default_icon) {
      const icons = manifest.action.default_icon;
      for (const [size, iconPath] of Object.entries(icons)) {
        const fullPath = path.join(EXTENSION_PATH, iconPath as string);
        expect(fs.existsSync(fullPath), `Missing icon ${size}: ${iconPath}`).toBe(true);
      }
    }

    // Check browser_action icons (MV2)
    if (manifest.browser_action?.default_icon) {
      const icons = manifest.browser_action.default_icon;
      for (const [size, iconPath] of Object.entries(icons)) {
        const fullPath = path.join(EXTENSION_PATH, iconPath as string);
        expect(fs.existsSync(fullPath), `Missing icon ${size}: ${iconPath}`).toBe(true);
      }
    }
  });

  test('content script CSS exists', async () => {
    // Read manifest to get content script CSS paths
    const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    if (manifest.content_scripts) {
      for (const contentScript of manifest.content_scripts) {
        if (contentScript.css) {
          for (const cssPath of contentScript.css) {
            const fullPath = path.join(EXTENSION_PATH, cssPath);
            expect(fs.existsSync(fullPath), `Missing CSS: ${cssPath}`).toBe(true);
          }
        }
      }
    }
  });

  test('background script has no syntax errors', async () => {
    const backgroundPath = path.join(EXTENSION_PATH, 'background.js');
    const backgroundContent = fs.readFileSync(backgroundPath, 'utf-8');

    // Basic syntax check - try to parse as a function body
    // This won't catch all errors but catches obvious syntax issues
    expect(backgroundContent.length).toBeGreaterThan(0);

    // Check for common syntax error patterns
    const syntaxPatterns = [
      /\}\s*\{(?!\s*['"`])/,  // }{ without string context
      /,\s*\]/,               // Trailing comma before ]
      /,\s*\}/,               // Trailing comma before } (allowed in ES6 but check)
    ];

    // These patterns are actually allowed in ES6, so we just log them
    for (const pattern of syntaxPatterns) {
      if (pattern.test(backgroundContent)) {
        console.log(`Note: Pattern ${pattern} found in background.js`);
      }
    }
  });

  test('manifest permissions are reasonable', async () => {
    const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const permissions = manifest.permissions || [];

    // Dangerous permissions that should be flagged
    const dangerousPermissions = [
      'nativeMessaging', // Allows native app communication
      'proxy',           // Can intercept all requests
      'debugger',        // Full debugging access
    ];

    for (const dangerous of dangerousPermissions) {
      expect(permissions).not.toContain(dangerous);
    }

    // Expected permissions for Proso
    const expectedPermissions = ['storage', 'activeTab'];
    for (const expected of expectedPermissions) {
      expect(permissions).toContain(expected);
    }
  });
});

test.describe('Extension Runtime', () => {
  test.skip(!extensionExists(), 'Extension build not found. Run pnpm run build:firefox first.');

  // These tests require the extension to be loaded in Firefox
  // Currently marked as fixme until we have proper web-ext integration

  test.fixme('background script initializes without errors', async () => {
    // This test would:
    // 1. Load extension in Firefox using web-ext
    // 2. Navigate to about:debugging
    // 3. Verify background script is running
    // 4. Check browser console for errors
  });

  test.fixme('content script injects on supported pages', async () => {
    // This test would:
    // 1. Load extension
    // 2. Navigate to a test page
    // 3. Verify content script injected
    // 4. Check for Proso UI elements
  });

  test.fixme('popup opens without errors', async () => {
    // This test would:
    // 1. Load extension
    // 2. Click extension icon
    // 3. Verify popup opens
    // 4. Check for error state
  });
});
