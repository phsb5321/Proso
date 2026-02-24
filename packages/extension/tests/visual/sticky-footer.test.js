/**
 * Visual tests for sticky footer player styling
 * Feature: 036-testing-strategy (T039)
 *
 * Tests visual appearance of the sticky footer playback controls
 * in various states (playing, paused, minimized).
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { disableAnimations, waitForLayoutStable } from '../helpers/disable-animations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '..', '..');

/**
 * Create a test page with the sticky footer injected
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 */
async function setupTestPage(page, options = {}) {
  const {
    colorScheme = 'light',
    isPlaying = false,
    isMinimized = false,
    progress = 0,
  } = options;

  const isDark = colorScheme === 'dark';
  const bgColor = isDark ? '#1a1a1a' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#1a1a1a';
  const footerBg = isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const footerBorder = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const dragHandleBg = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)';
  const btnBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
  const btnHover = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';
  const btnColor = isDark ? '#fff' : '#333';
  const timeColor = isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
  const progressBg = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';

  await page.emulateMedia({ colorScheme });

  const playIcon =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5V19L19 12L8 5Z"></path></svg>';
  const pauseIcon =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

  const minimizedClass = isMinimized ? 'minimized' : '';
  const playingClass = isPlaying ? 'playing' : '';
  const playPauseIcon = isPlaying ? pauseIcon : playIcon;
  const playPauseLabel = isPlaying ? 'Pause' : 'Play';

  // Create minimal HTML with test content
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 40px 80px;
          line-height: 1.6;
          background: ${bgColor};
          color: ${textColor};
          min-height: 100vh;
          margin: 0;
        }
        p { margin: 1em 0; }
        .proso-sticky-footer {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: min(600px, calc(100% - 32px));
          background: ${footerBg};
          border: 1px solid ${footerBorder};
          border-radius: 12px 12px 0 0;
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 16px;
          z-index: 10000;
        }
        .proso-sticky-footer.minimized {
          width: auto;
          padding: 8px 12px;
          gap: 8px;
        }
        .proso-sticky-footer.minimized .proso-footer__progress {
          display: none;
        }
        .proso-footer__drag-handle {
          width: 40px;
          height: 4px;
          background: ${dragHandleBg};
          border-radius: 2px;
          position: absolute;
          top: 6px;
          left: 50%;
          transform: translateX(-50%);
          cursor: grab;
        }
        .proso-footer__controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .proso-footer__btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 50%;
          background: ${btnBg};
          color: ${btnColor};
          cursor: pointer;
        }
        .proso-footer__btn:hover {
          background: ${btnHover};
        }
        .proso-footer__btn--play-pause {
          width: 44px;
          height: 44px;
          background: #3b82f6;
          color: white;
        }
        .proso-footer__btn--play-pause:hover {
          background: #2563eb;
        }
        .proso-footer__btn--play-pause.playing {
          background: #ef4444;
        }
        .proso-footer__progress {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .proso-footer__time {
          font-size: 12px;
          color: ${timeColor};
          min-width: 32px;
        }
        .proso-footer__progress-bar {
          flex: 1;
          height: 4px;
          background: ${progressBg};
          border-radius: 2px;
          cursor: pointer;
        }
        .proso-footer__progress-fill {
          height: 100%;
          background: #3b82f6;
          border-radius: 2px;
        }
        .proso-footer__actions {
          display: flex;
          align-items: center;
        }
        .proso-footer__btn--close {
          background: transparent;
        }
      </style>
    </head>
    <body>
      <h1>Test Article</h1>
      <p>First paragraph of test content.</p>
      <p>Second paragraph of test content.</p>
      <p>Third paragraph of test content.</p>

      <div class="proso-sticky-footer ${minimizedClass}" data-testid="sticky-footer">
        <div class="proso-footer__drag-handle"></div>
        <div class="proso-footer__controls">
          <button class="proso-footer__btn proso-footer__btn--prev" data-testid="footer-prev-btn" aria-label="Previous">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 20L9 12L19 4V20Z"></path><rect x="5" y="4" width="3" height="16"></rect></svg>
          </button>
          <button class="proso-footer__btn proso-footer__btn--play-pause ${playingClass}" data-testid="footer-play-pause-btn" aria-label="${playPauseLabel}">
            ${playPauseIcon}
          </button>
          <button class="proso-footer__btn proso-footer__btn--next" data-testid="footer-next-btn" aria-label="Next">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4L15 12L5 20V4Z"></path><rect x="16" y="4" width="3" height="16"></rect></svg>
          </button>
        </div>
        <div class="proso-footer__progress">
          <span class="proso-footer__time">0:00</span>
          <div class="proso-footer__progress-bar" data-testid="footer-progress-bar">
            <div class="proso-footer__progress-fill" style="width: ${progress}%"></div>
          </div>
          <span class="proso-footer__time">3:45</span>
        </div>
        <div class="proso-footer__actions">
          <button class="proso-footer__btn proso-footer__btn--close" data-testid="footer-close-btn" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>
    </body>
    </html>
  `;

  await page.setContent(htmlContent);
  await disableAnimations(page);
  await waitForLayoutStable(page, '.proso-sticky-footer', 50);

  return page;
}

test.describe('Sticky Footer Visual Tests (T039)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
  });

  // Test footer in paused state - light mode
  test('footer paused state - light mode', async ({ page }) => {
    await setupTestPage(page, { colorScheme: 'light', isPlaying: false, progress: 0 });

    await expect(page).toHaveScreenshot('footer-paused-light.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test footer in paused state - dark mode
  test('footer paused state - dark mode', async ({ page }) => {
    await setupTestPage(page, { colorScheme: 'dark', isPlaying: false, progress: 0 });

    await expect(page).toHaveScreenshot('footer-paused-dark.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test footer in playing state - light mode
  test('footer playing state - light mode', async ({ page }) => {
    await setupTestPage(page, { colorScheme: 'light', isPlaying: true, progress: 45 });

    await expect(page).toHaveScreenshot('footer-playing-light.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test footer in playing state - dark mode
  test('footer playing state - dark mode', async ({ page }) => {
    await setupTestPage(page, { colorScheme: 'dark', isPlaying: true, progress: 45 });

    await expect(page).toHaveScreenshot('footer-playing-dark.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test minimized footer - light mode
  test('footer minimized - light mode', async ({ page }) => {
    await setupTestPage(page, {
      colorScheme: 'light',
      isPlaying: false,
      isMinimized: true,
    });

    await expect(page).toHaveScreenshot('footer-minimized-light.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test minimized footer - dark mode
  test('footer minimized - dark mode', async ({ page }) => {
    await setupTestPage(page, {
      colorScheme: 'dark',
      isPlaying: false,
      isMinimized: true,
    });

    await expect(page).toHaveScreenshot('footer-minimized-dark.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test footer with progress at various positions
  test('footer progress 75% - light mode', async ({ page }) => {
    await setupTestPage(page, { colorScheme: 'light', isPlaying: true, progress: 75 });

    await expect(page).toHaveScreenshot('footer-progress-75-light.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  // Test reduced motion preference
  test('footer with reduced motion', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    await setupTestPage(page, { colorScheme: 'light', isPlaying: false });

    await expect(page).toHaveScreenshot('footer-reduced-motion.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
