/**
 * Extension Fixture for Playwright E2E Tests
 *
 * Provides a browser context with the VoxPage extension loaded.
 * Uses Chromium with launchPersistentContext() as per Playwright extension testing docs.
 *
 * @see https://playwright.dev/docs/chrome-extensions
 * @see specs/038-browser-e2e-hardening/research.md
 *
 * FR: Foundation for all extension tests
 * SC: SC-001 (browser launch + extension load within 60s)
 * Edge Case: Covers Edge Case 1 (extension fails to load during test setup)
 */

import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension build output path (relative to project root)
const EXTENSION_PATH = path.join(__dirname, '../../../../.output/chrome-mv3');

// Timeout for waiting for service worker (extension load)
const SERVICE_WORKER_TIMEOUT = 30000;

/**
 * Find the system Chromium executable path
 * Needed for NixOS where Playwright's downloaded browsers don't work
 */
function findSystemChromium(): string | undefined {
  const candidates = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  
  for (const candidate of candidates) {
    try {
      const result = execSync(`which ${candidate}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      const chromiumPath = result.trim();
      if (chromiumPath) {
        return chromiumPath;
      }
    } catch {
      // Candidate not found, try next
    }
  }
  
  // Check CHROMIUM_PATH or CHROME_PATH environment variables
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  
  return undefined;
}

/**
 * Extended test fixtures for extension testing
 */
export interface ExtensionFixtures {
  /** Browser context with extension loaded */
  context: BrowserContext;
  /** The extension's unique ID */
  extensionId: string;
  /** A page within the extension context */
  extensionPage: Page;
}

/**
 * Custom test with extension fixtures
 */
export const test = base.extend<ExtensionFixtures>({
  // Create a persistent context with extension loaded
  context: async ({}, use) => {
    // Verify extension path exists
    const fs = await import('node:fs');
    if (!fs.existsSync(EXTENSION_PATH)) {
      throw new Error(
        `Extension not found at ${EXTENSION_PATH}. ` +
        'Run "pnpm build:chrome" before running extension E2E tests.'
      );
    }

    // Check for manifest.json to validate extension structure
    const manifestPath = path.join(EXTENSION_PATH, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `manifest.json not found in ${EXTENSION_PATH}. ` +
        'The extension build appears to be incomplete.'
      );
    }

    // Try to find system Chromium for NixOS compatibility
    const systemChromium = findSystemChromium();
    
    // Build launch options - use "new headless" mode for extension support
    // Chrome 109+ supports extensions in headless mode with --headless=new
    const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
      headless: false, // We use --headless=new flag instead for extension support
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Enable new headless mode that supports extensions (Chrome 109+)
        '--headless=new',
        // Disable GPU to improve CI stability
        '--disable-gpu',
        // Disable dev shm usage for Docker/CI environments
        '--disable-dev-shm-usage',
        // Disable sandbox for CI environments (Docker)
        '--no-sandbox',
        // Disable background throttling for consistent timing
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    };

    // Use system Chromium if available (NixOS), otherwise use Playwright's channel
    if (systemChromium) {
      launchOptions.executablePath = systemChromium;
    } else {
      // Use Playwright's bundled Chromium
      launchOptions.channel = 'chromium';
    }

    const context = await chromium.launchPersistentContext('', launchOptions);

    await use(context);
    await context.close();
  },

  // Extract extension ID from service worker URL
  extensionId: async ({ context }, use) => {
    let serviceWorker = context.serviceWorkers()[0];

    if (!serviceWorker) {
      // Wait for service worker to be registered
      try {
        serviceWorker = await context.waitForEvent('serviceworker', {
          timeout: SERVICE_WORKER_TIMEOUT,
        });
      } catch (error) {
        // Provide helpful error message for extension load failure (Edge Case 1)
        throw new Error(
          `Extension service worker not found within ${SERVICE_WORKER_TIMEOUT}ms. ` +
          'This may indicate:\n' +
          '  1. The extension failed to load (check manifest.json for errors)\n' +
          '  2. The extension has no background script/service worker\n' +
          '  3. The extension path is incorrect\n' +
          `  Extension path: ${EXTENSION_PATH}`
        );
      }
    }

    // Extract extension ID from service worker URL
    // URL format: chrome-extension://<extension-id>/background.js
    const extensionId = serviceWorker.url().split('/')[2];

    if (!extensionId) {
      throw new Error(
        `Could not extract extension ID from service worker URL: ${serviceWorker.url()}`
      );
    }

    await use(extensionId);
  },

  // Provide a page within the extension context
  extensionPage: async ({ context }, use) => {
    // Get existing page or create new one
    let page = context.pages()[0];
    if (!page) {
      page = await context.newPage();
    }
    await use(page);
  },
});

// Re-export expect for convenience
export { expect } from '@playwright/test';

/**
 * Navigate to the extension's popup page
 */
export async function openExtensionPopup(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  return popupPage;
}

/**
 * Navigate to the extension's settings page
 */
export async function openExtensionSettings(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const settingsPage = await context.newPage();
  await settingsPage.goto(`chrome-extension://${extensionId}/settings.html`);
  return settingsPage;
}

/**
 * Check if a URL is a blocked extension context (chrome://, edge://, etc.)
 * Used to detect pages where extension injection is blocked (Edge Case 4)
 */
export function isBlockedContext(url: string): boolean {
  const blockedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'data:',
    'file:',
  ];
  return blockedPrefixes.some(prefix => url.startsWith(prefix));
}

/**
 * Wait for the extension content script to be injected
 * Checks for VoxPage footer element as indicator of injection
 */
export async function waitForContentScript(
  page: Page,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.waitForSelector('.voxpage-footer, [data-voxpage]', {
      timeout,
      state: 'attached',
    });
    return true;
  } catch {
    return false;
  }
}
