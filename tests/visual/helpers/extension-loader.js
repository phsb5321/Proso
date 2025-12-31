/**
 * Playwright Extension Loading Helper
 * Utilities for loading VoxPage extension in Firefox for visual testing
 */
import { chromium, firefox } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension root directory (3 levels up from helpers)
const EXTENSION_PATH = path.resolve(__dirname, '..', '..', '..');

/**
 * Get the popup URL for the extension
 * Note: For visual testing, we load popup.html directly as a file
 * since moz-extension:// URLs require actual extension installation
 */
export function getPopupUrl() {
  return `file://${path.join(EXTENSION_PATH, 'popup', 'popup.html')}`;
}

/**
 * Get the options URL for the extension
 */
export function getOptionsUrl() {
  return `file://${path.join(EXTENSION_PATH, 'options', 'options.html')}`;
}

/**
 * Setup page with extension CSS tokens
 * Ensures design tokens are loaded for visual consistency
 */
export async function setupPageWithTokens(page) {
  // Navigate to popup
  await page.goto(getPopupUrl());

  // Wait for CSS to load
  await page.waitForLoadState('domcontentloaded');

  // Inject tokens.css if not already linked
  const hasTokens = await page.evaluate(() => {
    return Array.from(document.styleSheets).some(
      sheet => sheet.href && sheet.href.includes('tokens.css')
    );
  });

  if (!hasTokens) {
    await page.addStyleTag({
      path: path.join(EXTENSION_PATH, 'styles', 'tokens.css')
    });
  }

  return page;
}

/**
 * Set UI state for visual testing
 * @param {Page} page - Playwright page
 * @param {string} state - One of: idle, playing, paused, error, onboarding
 */
export async function setUiState(page, state) {
  await page.evaluate((uiState) => {
    const container = document.querySelector('.container');
    const visualizer = document.querySelector('.visualizer-section');
    const statusBanner = document.querySelector('.status-banner');
    const onboardingOverlay = document.querySelector('.onboarding-overlay');

    // Reset all states
    if (visualizer) {
      visualizer.classList.remove('playing', 'paused', 'idle');
    }
    if (statusBanner) {
      statusBanner.classList.add('hidden');
      statusBanner.classList.remove('error', 'success', 'warning');
    }
    if (onboardingOverlay) {
      onboardingOverlay.classList.add('hidden');
    }

    // Apply requested state
    switch (uiState) {
      case 'playing':
        if (visualizer) visualizer.classList.add('playing');
        break;
      case 'paused':
        if (visualizer) visualizer.classList.add('paused');
        break;
      case 'error':
        if (statusBanner) {
          statusBanner.classList.remove('hidden');
          statusBanner.classList.add('error');
          statusBanner.querySelector('.status-text').textContent = 'Error: API key not configured';
        }
        break;
      case 'onboarding':
        if (onboardingOverlay) {
          onboardingOverlay.classList.remove('hidden');
        }
        break;
      case 'idle':
      default:
        if (visualizer) visualizer.classList.add('idle');
        break;
    }
  }, state);

  // Wait for any animations to settle
  await page.waitForTimeout(100);
}

/**
 * Set color scheme for testing
 * @param {Page} page - Playwright page
 * @param {string} scheme - 'light' or 'dark'
 */
export async function setColorScheme(page, scheme) {
  await page.emulateMedia({ colorScheme: scheme });
}

/**
 * Viewport configuration for popup
 */
export const POPUP_VIEWPORT = {
  width: 360,
  height: 480
};

export default {
  getPopupUrl,
  getOptionsUrl,
  setupPageWithTokens,
  setUiState,
  setColorScheme,
  POPUP_VIEWPORT
};
