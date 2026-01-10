/**
 * Visual tests for PDF paragraph highlighting
 * Feature: 041-firefox-first-pivot (T3.5)
 *
 * Tests PDF text layer highlighting and bounding box fallback styles.
 * Uses simulated PDF.js DOM structure since Playwright doesn't directly
 * render PDFs in the browser's built-in viewer.
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
 */
function getContentCssPath() {
  return path.join(EXTENSION_PATH, 'src', 'styles', 'content.css');
}

/**
 * Create a test page simulating PDF.js viewer structure with text layer
 * This mimics the DOM structure created by Firefox's built-in PDF viewer
 */
async function setupPDFViewerPage(page) {
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        /* Minimal PDF.js viewer structure styles */
        body {
          margin: 0;
          padding: 20px;
          font-family: sans-serif;
          background: #808080;
        }
        
        .pdfViewer {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
        }
        
        .page {
          position: relative;
          background: white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          margin: 0 auto;
        }
        
        /* Canvas placeholder (PDF.js renders to canvas) */
        .canvasWrapper {
          position: relative;
          width: 600px;
          height: 800px;
          background: white;
        }
        
        /* Text layer overlay */
        .textLayer {
          position: absolute;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          line-height: 1.0;
        }
        
        /* PDF.js text layer spans */
        .textLayer span {
          position: absolute;
          white-space: pre;
          transform-origin: 0% 0%;
          /* Default PDF text styling */
          color: transparent;
          font-size: 12px;
          font-family: sans-serif;
        }
        
        /* Make text visible for testing (normally transparent in PDF.js) */
        .textLayer span {
          color: #333;
        }
        
        /* Dark mode */
        @media (prefers-color-scheme: dark) {
          body {
            background: #404040;
          }
          .page {
            background: #1a1a1a;
          }
          .textLayer span {
            color: #e0e0e0;
          }
        }
      </style>
    </head>
    <body>
      <div id="viewer" class="pdfViewer">
        <!-- Page 1 -->
        <div class="page" data-page-number="1">
          <div class="canvasWrapper"></div>
          <div class="textLayer" id="text-layer-1">
            <span style="left: 10%; top: 5%;">Introduction to Document Processing</span>
            
            <span id="para1-span1" style="left: 10%; top: 12%;">This is the first paragraph of the PDF document. </span>
            <span id="para1-span2" style="left: 10%; top: 14.5%;">It contains multiple spans because PDF.js splits text </span>
            <span id="para1-span3" style="left: 10%; top: 17%;">based on the internal PDF structure.</span>
            
            <span id="para2-span1" style="left: 10%; top: 25%;">The second paragraph demonstrates how text is laid out </span>
            <span id="para2-span2" style="left: 10%; top: 27.5%;">in a typical PDF document with proper spacing.</span>
            
            <span id="para3-span1" style="left: 10%; top: 35%;">A third paragraph for testing multiple selections </span>
            <span id="para3-span2" style="left: 10%; top: 37.5%;">and ensuring highlights work across different areas.</span>
          </div>
        </div>
        
        <!-- Page 2 (for multi-page testing) -->
        <div class="page" data-page-number="2">
          <div class="canvasWrapper"></div>
          <div class="textLayer" id="text-layer-2">
            <span style="left: 10%; top: 5%;">Chapter 2: Advanced Topics</span>
            
            <span id="page2-para1-span1" style="left: 10%; top: 12%;">This paragraph is on page 2 of the document. </span>
            <span id="page2-para1-span2" style="left: 10%; top: 14.5%;">It helps test cross-page highlighting behavior.</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);

  // Load content.css for voxpage highlight styles
  await page.addStyleTag({
    path: getContentCssPath()
  });

  // Disable animations for deterministic screenshots
  await disableAnimations(page);

  // Wait for layout to stabilize
  await waitForLayoutStable(page, '.textLayer', 50);
  return page;
}

/**
 * Apply span-based highlight to PDF text layer spans
 * Simulates what pdf-highlight.ts does
 */
async function highlightSpans(page, spanIds, paragraphIndex = 0) {
  await page.evaluate(({ spanIds, paragraphIndex }) => {
    // Clear existing highlights
    document.querySelectorAll('.voxpage-pdf-highlight').forEach(el => {
      el.classList.remove('voxpage-pdf-highlight', 'voxpage-highlight');
      delete el.dataset.voxpageIndex;
    });
    
    // Apply new highlights
    spanIds.forEach(id => {
      const span = document.getElementById(id);
      if (span) {
        span.classList.add('voxpage-pdf-highlight', 'voxpage-highlight');
        span.dataset.voxpageIndex = paragraphIndex.toString();
      }
    });
  }, { spanIds, paragraphIndex });

  await waitForLayoutStable(page, '.voxpage-highlight', 50);
}

/**
 * Create a bounding box fallback highlight
 * Simulates what pdf-highlight.ts does when text matching fails
 */
async function createBoundingBoxFallback(page, pageNumber, box, paragraphIndex = 0) {
  await page.evaluate(({ pageNumber, box, paragraphIndex }) => {
    const pageElement = document.querySelector(`.page[data-page-number="${pageNumber}"]`);
    if (!pageElement) return;
    
    const textLayer = pageElement.querySelector('.textLayer');
    if (!textLayer) return;
    
    // Create overlay element
    const overlay = document.createElement('div');
    overlay.className = 'voxpage-pdf-bbox-highlight voxpage-highlight';
    overlay.dataset.voxpageIndex = paragraphIndex.toString();
    overlay.dataset.voxpageFallback = 'true';
    
    // Position the overlay
    overlay.style.position = 'absolute';
    overlay.style.left = box.x + '%';
    overlay.style.top = box.y + '%';
    overlay.style.width = box.width + '%';
    overlay.style.height = box.height + '%';
    overlay.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
    overlay.style.border = '2px solid rgba(255, 200, 0, 0.5)';
    overlay.style.borderRadius = '4px';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '1';
    
    textLayer.appendChild(overlay);
  }, { pageNumber, box, paragraphIndex });

  await waitForLayoutStable(page, '.voxpage-pdf-bbox-highlight', 50);
}

/**
 * Clear all PDF highlights
 */
async function clearHighlights(page) {
  await page.evaluate(() => {
    // Clear span highlights
    document.querySelectorAll('.voxpage-pdf-highlight').forEach(el => {
      el.classList.remove('voxpage-pdf-highlight', 'voxpage-highlight');
      delete el.dataset.voxpageIndex;
    });
    
    // Remove bounding box overlays
    document.querySelectorAll('.voxpage-pdf-bbox-highlight').forEach(el => {
      el.remove();
    });
  });
}

test.describe('PDF Highlighting Visual Tests (T3.5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1000 });
  });

  // Test basic span-based highlighting (light mode)
  test('PDF text layer highlight - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupPDFViewerPage(page);
    
    // Highlight the first paragraph (3 spans)
    await highlightSpans(page, ['para1-span1', 'para1-span2', 'para1-span3'], 0);

    await expect(page).toHaveScreenshot('pdf-highlight-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test span-based highlighting (dark mode)
  test('PDF text layer highlight - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupPDFViewerPage(page);
    
    // Highlight the first paragraph
    await highlightSpans(page, ['para1-span1', 'para1-span2', 'para1-span3'], 0);

    await expect(page).toHaveScreenshot('pdf-highlight-dark.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test highlighting different paragraphs
  test('PDF multiple paragraph locations', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupPDFViewerPage(page);
    
    // Highlight the second paragraph
    await highlightSpans(page, ['para2-span1', 'para2-span2'], 1);

    await expect(page).toHaveScreenshot('pdf-highlight-para2.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test bounding box fallback (light mode)
  test('PDF bounding box fallback - light mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupPDFViewerPage(page);
    
    // Create bounding box fallback highlight
    await createBoundingBoxFallback(page, 1, {
      x: 8,   // 8% from left
      y: 10,  // 10% from top
      width: 80, // 80% width
      height: 8  // 8% height
    }, 0);

    await expect(page).toHaveScreenshot('pdf-bbox-fallback-light.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test bounding box fallback (dark mode)
  test('PDF bounding box fallback - dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupPDFViewerPage(page);
    
    // Create bounding box fallback highlight
    await createBoundingBoxFallback(page, 1, {
      x: 8,
      y: 10,
      width: 80,
      height: 8
    }, 0);

    await expect(page).toHaveScreenshot('pdf-bbox-fallback-dark.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test second page highlighting
  test('PDF highlight on page 2', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupPDFViewerPage(page);
    
    // Scroll to page 2
    await page.evaluate(() => {
      const page2 = document.querySelector('.page[data-page-number="2"]');
      page2?.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    
    // Highlight paragraph on page 2
    await highlightSpans(page, ['page2-para1-span1', 'page2-para1-span2'], 3);

    await expect(page).toHaveScreenshot('pdf-highlight-page2.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test clearing highlights
  test('PDF highlights cleared', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupPDFViewerPage(page);
    
    // Apply highlight
    await highlightSpans(page, ['para1-span1', 'para1-span2', 'para1-span3'], 0);
    
    // Then clear it
    await clearHighlights(page);
    
    // Wait for DOM update
    await page.waitForTimeout(50);

    // Should match a clean page with no highlights
    await expect(page).toHaveScreenshot('pdf-no-highlights.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test reduced motion preference
  test('PDF highlight with reduced motion', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'reduce'
    });
    await setupPDFViewerPage(page);
    
    // Highlight paragraph
    await highlightSpans(page, ['para1-span1', 'para1-span2', 'para1-span3'], 0);

    await expect(page).toHaveScreenshot('pdf-highlight-reduced-motion.png', {
      maxDiffPixelRatio: 0.02
    });
  });

  // Test simultaneous span and bounding box (edge case)
  test('PDF combined highlight types', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await setupPDFViewerPage(page);
    
    // Apply span highlight to one paragraph
    await highlightSpans(page, ['para2-span1', 'para2-span2'], 1);
    
    // And bounding box to another area (simulating partial match scenario)
    await createBoundingBoxFallback(page, 1, {
      x: 8,
      y: 33,
      width: 75,
      height: 7
    }, 2);

    await expect(page).toHaveScreenshot('pdf-combined-highlights.png', {
      maxDiffPixelRatio: 0.02
    });
  });
});
