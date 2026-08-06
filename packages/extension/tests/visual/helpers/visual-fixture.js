/**
 * Shared visual-test fixture for the Firefox visual suite.
 *
 * Builds the deterministic article page, injects selection-mode play icons
 * exactly as the shipped code creates them (`ParagraphSelector
 * .addPlayIconWithMargin` in `src/utils/content/paragraph-selector.ts`:
 * native `<button type="button">` with aria-label, title, tabindex and
 * `data-proso-index`), and provides the keyboard step helpers the suite
 * asserts with. One implementation serves both the hover-preview and
 * keyboard-navigation suites, so the fixtures cannot drift apart.
 */
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { disableAnimations, waitForLayoutStable } from '../../helpers/disable-animations.js';

const ARTICLE_HEADING = 'Test Article';

const ARTICLE_PARAGRAPHS = [
  'This is the first paragraph of the test article. It contains enough text to demonstrate the styling when a user interacts with it during selection mode.',
  'The second paragraph has different content to help visualize how multiple paragraphs look when the selection mode is active. Each paragraph should show the play icon.',
  'Finally, the third paragraph completes our test content. This ensures we can see how the styling works across multiple consecutive paragraphs.',
];

/**
 * Create a test page with sample paragraphs and content.css loaded.
 * `paragraphs` may be given as [{ id, tabindex? }] overrides; text is shared.
 */
export async function createArticlePage(page, paragraphOpts = []) {
  const rows = ARTICLE_PARAGRAPHS.map((text, i) => {
    const opt = paragraphOpts[i] ?? {};
    const tabindex = opt.tabindex === undefined ? '' : ` tabindex="${opt.tabindex}"`;
    return `<p id="${opt.id ?? `p${i + 1}`}"${tabindex}>${text}</p>`;
  }).join('\n');

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
      <h1>${ARTICLE_HEADING}</h1>
      ${rows}
    </body>
    </html>
  `);

  await page.addStyleTag({
    path: fileURLToPath(new URL('../../../src/styles/content.css', import.meta.url))
  });

  // Disable animations for deterministic screenshots
  await disableAnimations(page);

  await waitForLayoutStable(page, 'body', 50);
  return page;
}

/**
 * Shared suite prologue for the visual tests: viewport + describe wrapper.
 * Both suites use the same 800×600 viewport, so the prologue lives here once.
 */
export function defineVisualSuite(title, body) {
  test.describe(title, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 800, height: 600 });
    });
    body();
  });
}

/**
 * Add selectable class and play icons to paragraphs (simulating selection
 * mode). The icons mirror `ParagraphSelector.addPlayIconWithMargin` exactly:
 * native `<button type="button">` with aria-label, title, tabindex and
 * `data-proso-index` — the element type the shipped code inserts.
 */
export async function enableSelectionMode(page) {
  await page.evaluate(() => {
    document.querySelectorAll('p').forEach((p, index) => {
      p.classList.add('proso-selectable');
      p.dataset.prosoSelectIndex = index.toString();

      const icon = document.createElement('button');
      icon.className = 'proso-play-icon';
      icon.setAttribute('type', 'button'); // Prevent form submission
      icon.setAttribute('aria-label', `Play from paragraph ${index + 1}`);
      icon.setAttribute('title', 'Start playback from here');
      icon.setAttribute('tabindex', '0');
      icon.dataset.prosoIndex = String(index);

      // Mirrors ParagraphSelector.addPlayIconWithMargin: paragraphs with less
      // than 50px of left margin get the inline positioning class.
      const marginLeft = Number.parseFloat(window.getComputedStyle(p).marginLeft) || 0;
      if (marginLeft < 50) {
        icon.classList.add('proso-play-icon--inline');
      }

      p.appendChild(icon);
    });
  });

  await waitForLayoutStable(page, 'p.proso-selectable', 50);
}

/**
 * Select a specific paragraph (adds .proso-selected, removes it elsewhere).
 */
export async function selectParagraph(page, index) {
  await page.evaluate((idx) => {
    document.querySelectorAll('p').forEach((p, i) => {
      if (i === idx) {
        p.classList.add('proso-selected');
      } else {
        p.classList.remove('proso-selected');
      }
    });
  }, index);

  await waitForLayoutStable(page, 'p.proso-selected', 50);
}

/**
 * Press Tab once and assert focus landed on `expected` (a `tag#id` label or
 * the literal 'body'). This is what makes the keyboard assertions honest: a
 * blind tab count silently tests whichever element happens to be focused.
 */
export async function tabTo(page, expected) {
  await page.keyboard.press('Tab');
  await waitForLayoutStable(page, expected === 'body' ? 'body' : expected, 50);
  const actual = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return 'body';
    return `${el.tagName.toLowerCase()}#${el.id || (el.className.split(/\s+/)[0] ?? '')}`;
  });
  const expectedLabel = expected === 'body' ? 'body' : expected;
  expect(actual, `after Tab, focus should be on ${expectedLabel}, got ${actual}`).toBe(expectedLabel);
}

/**
 * Press Tab through a sequence of expected focus targets, asserting each.
 */
export async function tabToEach(page, targets) {
  for (const target of targets) {
    await tabTo(page, target);
  }
}

/** Focusable-paragraph options the keyboard suite uses for every page. */
export const FOCUSABLE_PARAGRAPHS = [
  { id: 'p1', tabindex: 0 },
  { id: 'p2', tabindex: 0 },
  { id: 'p3', tabindex: 0 },
];

/**
 * The keyboard suite's page: focusable paragraphs plus selection-mode icons.
 */
export async function createKeyboardPage(page) {
  await createArticlePage(page, FOCUSABLE_PARAGRAPHS);
  await enableSelectionMode(page);
}

/** Computed opacity of a play icon ('' when missing). */
export async function playIconOpacity(page, selector) {
  return page.evaluate((sel) => {
    const icon = document.querySelector(sel);
    return icon ? getComputedStyle(icon).opacity : '0';
  }, selector);
}

/** Computed focus styles (outline + opacity) of a play icon. */
export async function readFocusRing(page, selector) {
  return page.evaluate((sel) => {
    const icon = document.querySelector(sel);
    if (!icon) return { outline: 'none', opacity: '0' };
    const style = getComputedStyle(icon);
    return {
      outline: style.outline,
      outlineWidth: style.outlineWidth,
      outlineStyle: style.outlineStyle,
      opacity: style.opacity,
    };
  }, selector);
}

/**
 * Install a click tracker on the play buttons. The shipped code receives the
 * same native `click` events through its document-level listener; the tracker
 * records which button was activated so the Enter/Space tests can assert the
 * browser's native button activation semantics.
 */
export async function trackPlayClicks(page) {
  await page.evaluate(() => {
    window.playButtonClicked = false;
    window.clickedIndex = null;
    document.querySelectorAll('.proso-play-icon').forEach((icon) => {
      icon.addEventListener('click', () => {
        window.playButtonClicked = true;
        window.clickedIndex = Number.parseInt(icon.dataset.prosoIndex || '', 10);
      });
    });
  });
}
