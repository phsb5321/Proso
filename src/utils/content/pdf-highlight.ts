// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * PDF Text Layer Highlighting
 * Handles paragraph highlighting for Firefox's built-in PDF viewer (PDF.js)
 *
 * Firefox renders PDFs using PDF.js which creates a `.textLayer` div containing
 * actual DOM `<span>` elements for each text run. This module finds and highlights
 * spans that match the currently playing paragraph text.
 *
 * @module utils/content/pdf-highlight
 */

/**
 * Bounding box for fallback highlighting when text matching fails
 */
export interface BoundingBox {
  /** X coordinate relative to the page */
  x: number;
  /** Y coordinate relative to the page */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Options for PDF paragraph highlighting
 */
export interface PDFHighlightOptions {
  /** Target a specific page number (1-indexed as per PDF.js convention) */
  pageNumber?: number;
  /** Bounding box for fallback highlighting when text match fails */
  boundingBox?: BoundingBox;
  /** Use reduced motion (instant scroll instead of smooth) */
  reducedMotion?: boolean;
}

/**
 * Check if the current page is a Firefox PDF viewer with a text layer
 */
export function isPDFTextLayerAvailable(): boolean {
  // Firefox PDF viewer uses .textLayer for text content
  const textLayer = document.querySelector('.textLayer');
  if (textLayer) {
    return true;
  }

  // Also check for PDF.js viewer patterns
  const pdfViewer = document.querySelector('#viewer.pdfViewer');
  if (pdfViewer) {
    return true;
  }

  return false;
}

/**
 * Get all text layer containers (one per page)
 * Optionally filter to a specific page number
 *
 * @param pageNumber - Optional 1-indexed page number to target
 * @returns Array of text layer elements
 */
function getTextLayers(pageNumber?: number): Element[] {
  if (pageNumber !== undefined) {
    // PDF.js uses data-page-number attribute (1-indexed)
    const pageElement = document.querySelector(
      `.page[data-page-number="${pageNumber}"] .textLayer`,
    );
    return pageElement ? [pageElement] : [];
  }
  return Array.from(document.querySelectorAll('.textLayer'));
}

/**
 * Normalize text for fuzzy matching
 * Removes extra whitespace and normalizes unicode
 */
function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Find spans in the text layer that match the given paragraph text
 * Uses fuzzy matching to handle slight differences in whitespace/formatting
 *
 * @param paragraphText - The text content to find
 * @param pageNumber - Optional page number to limit search scope
 * @returns Array of matching span elements
 */
export function findMatchingSpans(paragraphText: string, pageNumber?: number): HTMLSpanElement[] {
  const textLayers = getTextLayers(pageNumber);
  if (textLayers.length === 0) {
    return [];
  }

  const normalizedParagraph = normalizeText(paragraphText);
  if (normalizedParagraph.length < 10) {
    // Too short to reliably match
    return [];
  }

  const matchingSpans: HTMLSpanElement[] = [];

  for (const textLayer of textLayers) {
    const spans = textLayer.querySelectorAll('span');

    // Build a map of text content to spans
    // PDF.js often splits text across multiple spans, so we need to combine them
    let runningText = '';
    let runningSpans: HTMLSpanElement[] = [];

    for (const span of Array.from(spans)) {
      const spanText = span.textContent || '';
      runningText += spanText;
      runningSpans.push(span as HTMLSpanElement);

      const normalizedRunning = normalizeText(runningText);

      // Check if we've accumulated enough text to match the paragraph
      if (normalizedRunning.includes(normalizedParagraph)) {
        // Found a match - add all spans that contribute to this text
        matchingSpans.push(...runningSpans);

        // Reset for next potential match
        runningText = '';
        runningSpans = [];
      } else if (normalizedRunning.length > normalizedParagraph.length * 2) {
        // We've gone too far without a match - slide the window
        // Remove the first span's text and continue
        if (runningSpans.length > 1) {
          const firstSpan = runningSpans.shift();
          if (firstSpan) {
            runningText = runningText.substring((firstSpan.textContent || '').length);
          }
        } else {
          runningText = '';
          runningSpans = [];
        }
      }
    }
  }

  // If no exact match found, try partial matching with first N characters
  if (matchingSpans.length === 0) {
    const searchPrefix = normalizedParagraph.substring(0, Math.min(50, normalizedParagraph.length));

    for (const textLayer of textLayers) {
      const spans = textLayer.querySelectorAll('span');
      let runningText = '';
      const runningSpans: HTMLSpanElement[] = [];

      for (const span of Array.from(spans)) {
        const spanText = span.textContent || '';
        runningText += spanText;
        runningSpans.push(span as HTMLSpanElement);

        const normalizedRunning = normalizeText(runningText);

        if (normalizedRunning.includes(searchPrefix)) {
          // Found prefix match - grab surrounding spans
          matchingSpans.push(...runningSpans);
          break;
        }

        // Limit window size
        if (runningSpans.length > 20) {
          const removedSpan = runningSpans.shift();
          if (removedSpan) {
            const removedText = removedSpan.textContent || '';
            const idx = runningText.indexOf(removedText);
            if (idx >= 0) {
              runningText = runningText.substring(idx + removedText.length);
            }
          }
        }
      }

      if (matchingSpans.length > 0) {
        break;
      }
    }
  }

  return matchingSpans;
}

/**
 * CSS class for PDF highlight
 */
const PDF_HIGHLIGHT_CLASS = 'voxpage-pdf-highlight';

/**
 * CSS class for bounding box fallback highlight
 */
const PDF_BBOX_HIGHLIGHT_CLASS = 'voxpage-pdf-bbox-highlight';

/**
 * Create a bounding box overlay highlight when text matching fails
 * This provides a visual fallback that shows approximately where the paragraph is
 *
 * @param pageNumber - The page number (1-indexed)
 * @param boundingBox - The bounding box coordinates
 * @param paragraphIndex - The paragraph index for data attribute
 * @returns The created overlay element, or null if page not found
 */
function createBoundingBoxHighlight(
  pageNumber: number,
  boundingBox: BoundingBox,
  paragraphIndex: number,
): HTMLElement | null {
  const pageElement = document.querySelector(`.page[data-page-number="${pageNumber}"]`);
  if (!pageElement) {
    console.warn(`[VoxPage:PDF] Page ${pageNumber} not found for bounding box fallback`);
    return null;
  }

  // Create overlay element
  const overlay = document.createElement('div');
  overlay.className = `${PDF_BBOX_HIGHLIGHT_CLASS} voxpage-highlight`;
  overlay.dataset.voxpageIndex = String(paragraphIndex);
  overlay.dataset.voxpageFallback = 'true';

  // Position the overlay
  overlay.style.position = 'absolute';
  overlay.style.left = `${boundingBox.x}px`;
  overlay.style.top = `${boundingBox.y}px`;
  overlay.style.width = `${boundingBox.width}px`;
  overlay.style.height = `${boundingBox.height}px`;
  overlay.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
  overlay.style.border = '2px solid rgba(255, 200, 0, 0.5)';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '1';

  // Append to the page's text layer or the page itself
  const textLayer = pageElement.querySelector('.textLayer');
  if (textLayer) {
    textLayer.appendChild(overlay);
  } else {
    (pageElement as HTMLElement).appendChild(overlay);
  }

  return overlay;
}

/**
 * Clear bounding box fallback highlights
 */
function clearBoundingBoxHighlights(): void {
  const highlights = document.querySelectorAll(`.${PDF_BBOX_HIGHLIGHT_CLASS}`);
  for (const el of Array.from(highlights)) {
    el.remove();
  }
}

/**
 * Highlight spans in the PDF text layer
 *
 * @param paragraphText - The paragraph text to highlight
 * @param paragraphIndex - The paragraph index (for data attribute)
 * @param options - Optional highlighting options (page targeting, bounding box fallback)
 * @returns The first highlighted element (for scrolling), or null if not found
 */
export function highlightPDFParagraph(
  paragraphText: string,
  paragraphIndex: number,
  options?: PDFHighlightOptions,
): HTMLElement | null {
  // Clear previous PDF highlights
  clearPDFHighlights();

  const matchingSpans = findMatchingSpans(paragraphText, options?.pageNumber);

  if (matchingSpans.length === 0) {
    // Try bounding box fallback if provided
    if (options?.boundingBox && options?.pageNumber) {
      console.warn(
        `[VoxPage:PDF] No matching spans for paragraph ${paragraphIndex}, using bounding box fallback`,
      );
      return createBoundingBoxHighlight(options.pageNumber, options.boundingBox, paragraphIndex);
    }

    console.warn('[VoxPage:PDF] No matching spans found for paragraph', paragraphIndex);
    return null;
  }

  console.log(
    `[VoxPage:PDF] Highlighting ${matchingSpans.length} spans for paragraph ${paragraphIndex}` +
      (options?.pageNumber ? ` on page ${options.pageNumber}` : ''),
  );

  // Apply highlight class to all matching spans
  for (const span of matchingSpans) {
    span.classList.add(PDF_HIGHLIGHT_CLASS);
    span.classList.add('voxpage-highlight'); // Also add standard class for styling
    span.dataset.voxpageIndex = String(paragraphIndex);
  }

  // Save state for re-highlighting on page changes
  setCurrentHighlightState(paragraphText, paragraphIndex, options);

  // Return first span for scrolling
  return matchingSpans[0] || null;
}

/**
 * Clear all PDF paragraph highlights
 */
export function clearPDFHighlights(): void {
  // Clear span-based highlights
  const highlighted = document.querySelectorAll(`.${PDF_HIGHLIGHT_CLASS}`);
  for (const el of Array.from(highlighted)) {
    el.classList.remove(PDF_HIGHLIGHT_CLASS);
    el.classList.remove('voxpage-highlight');
    delete (el as HTMLElement).dataset.voxpageIndex;
  }

  // Clear bounding box fallback highlights
  clearBoundingBoxHighlights();

  // Clear the stored highlight state
  clearCurrentHighlightState();
}

/**
 * Get all currently highlighted PDF elements (both span and bounding box)
 */
export function getPDFHighlightElements(): Element[] {
  const spanHighlights = Array.from(document.querySelectorAll(`.${PDF_HIGHLIGHT_CLASS}`));
  const bboxHighlights = Array.from(document.querySelectorAll(`.${PDF_BBOX_HIGHLIGHT_CLASS}`));
  return [...spanHighlights, ...bboxHighlights];
}

/**
 * Scroll to the first highlighted PDF span
 *
 * @param reducedMotion - Use instant scroll instead of smooth (for accessibility)
 */
export function scrollToPDFHighlight(reducedMotion = false): void {
  // Check for span highlights first, then bounding box fallbacks
  const firstHighlight =
    document.querySelector(`.${PDF_HIGHLIGHT_CLASS}`) ||
    document.querySelector(`.${PDF_BBOX_HIGHLIGHT_CLASS}`);

  if (firstHighlight) {
    firstHighlight.scrollIntoView({
      behavior: reducedMotion ? 'instant' : 'smooth',
      block: 'center',
    });
  }
}

/**
 * Get the page number from a highlighted element
 *
 * @param element - The highlighted element
 * @returns The page number (1-indexed) or null if not found
 */
export function getHighlightPageNumber(element: Element): number | null {
  const pageElement = element.closest('.page[data-page-number]');
  if (!pageElement) {
    return null;
  }
  const pageNumber = pageElement.getAttribute('data-page-number');
  return pageNumber ? parseInt(pageNumber, 10) : null;
}

// ============================================================================
// PDF Page Change Detection
// ============================================================================

/**
 * Callback for when a new page's text layer becomes available
 */
export type PageTextLayerCallback = (pageNumber: number, textLayer: Element) => void;

/**
 * Callback for when page visibility changes
 */
export type PageVisibilityCallback = (pageNumber: number, isVisible: boolean) => void;

/**
 * State for the current highlight that needs to be re-applied on page changes
 */
interface CurrentHighlightState {
  paragraphText: string;
  paragraphIndex: number;
  options?: PDFHighlightOptions;
}

let currentHighlightState: CurrentHighlightState | null = null;
let textLayerObserver: MutationObserver | null = null;
let pageVisibilityObserver: IntersectionObserver | null = null;
let pageTextLayerCallbacks: PageTextLayerCallback[] = [];
let pageVisibilityCallbacks: PageVisibilityCallback[] = [];

/**
 * Store the current highlight state for re-application on page changes
 * Called internally by highlightPDFParagraph when highlighting succeeds
 */
function setCurrentHighlightState(
  paragraphText: string,
  paragraphIndex: number,
  options?: PDFHighlightOptions,
): void {
  currentHighlightState = { paragraphText, paragraphIndex, options };
}

/**
 * Get the current highlight state
 */
export function getCurrentHighlightState(): CurrentHighlightState | null {
  return currentHighlightState;
}

/**
 * Clear the current highlight state
 */
export function clearCurrentHighlightState(): void {
  currentHighlightState = null;
}

/**
 * Register a callback for when new text layers appear
 *
 * @param callback - Function to call when a new text layer is rendered
 */
export function onPageTextLayerReady(callback: PageTextLayerCallback): void {
  pageTextLayerCallbacks.push(callback);
}

/**
 * Register a callback for page visibility changes
 *
 * @param callback - Function to call when page visibility changes
 */
export function onPageVisibilityChange(callback: PageVisibilityCallback): void {
  pageVisibilityCallbacks.push(callback);
}

/**
 * Start observing for PDF page changes
 * This sets up:
 * 1. MutationObserver to detect when new text layers are rendered
 * 2. IntersectionObserver to detect page visibility changes
 */
export function startPDFPageObserver(): void {
  // Don't start if already running
  if (textLayerObserver) {
    return;
  }

  const pdfViewer = document.querySelector('#viewer.pdfViewer, .pdfViewer');
  if (!pdfViewer) {
    console.warn('[VoxPage:PDF] PDF viewer not found, cannot start page observer');
    return;
  }

  // Track which pages have had their text layer fully loaded
  const loadedTextLayers = new Set<number>();

  // MutationObserver for text layer changes
  textLayerObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check for added nodes that are text layers or contain text layers
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;

        // Check if it's a text layer or contains one
        const textLayers = node.classList?.contains('textLayer')
          ? [node]
          : Array.from(node.querySelectorAll('.textLayer'));

        for (const textLayer of textLayers) {
          // Get the page number from parent .page element
          const pageElement = textLayer.closest('.page[data-page-number]');
          if (!pageElement) continue;

          const pageNumberAttr = pageElement.getAttribute('data-page-number');
          const pageNumber = pageNumberAttr ? parseInt(pageNumberAttr, 10) : null;

          if (pageNumber && !loadedTextLayers.has(pageNumber)) {
            // Check if text layer has actual content (spans)
            const spans = textLayer.querySelectorAll('span');
            if (spans.length > 0) {
              loadedTextLayers.add(pageNumber);
              console.log(`[VoxPage:PDF] Text layer ready for page ${pageNumber}`);

              // Notify callbacks
              for (const callback of pageTextLayerCallbacks) {
                try {
                  callback(pageNumber, textLayer);
                } catch (err) {
                  console.error('[VoxPage:PDF] Error in text layer callback:', err);
                }
              }

              // Auto re-highlight if we have a current highlight state for this page
              if (currentHighlightState?.options?.pageNumber === pageNumber) {
                console.log(`[VoxPage:PDF] Re-applying highlight on page ${pageNumber}`);
                highlightPDFParagraph(
                  currentHighlightState.paragraphText,
                  currentHighlightState.paragraphIndex,
                  currentHighlightState.options,
                );
              }
            }
          }
        }
      }
    }
  });

  // Observe the PDF viewer for changes
  textLayerObserver.observe(pdfViewer, {
    childList: true,
    subtree: true,
  });

  // IntersectionObserver for page visibility
  pageVisibilityObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pageElement = entry.target;
        const pageNumberAttr = pageElement.getAttribute('data-page-number');
        const pageNumber = pageNumberAttr ? parseInt(pageNumberAttr, 10) : null;

        if (pageNumber) {
          const isVisible = entry.isIntersecting;

          // Notify callbacks
          for (const callback of pageVisibilityCallbacks) {
            try {
              callback(pageNumber, isVisible);
            } catch (err) {
              console.error('[VoxPage:PDF] Error in visibility callback:', err);
            }
          }
        }
      }
    },
    {
      // Trigger when 10% of the page is visible
      threshold: 0.1,
      // Observe relative to the viewport
      root: null,
    },
  );

  // Observe all existing pages
  const pages = document.querySelectorAll('.page[data-page-number]');
  for (const page of Array.from(pages)) {
    pageVisibilityObserver.observe(page);
  }

  // Also observe new pages as they're added
  const pageAddObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;

        const pages = node.classList?.contains('page')
          ? [node]
          : Array.from(node.querySelectorAll('.page[data-page-number]'));

        for (const page of pages) {
          if (page.hasAttribute('data-page-number') && pageVisibilityObserver) {
            pageVisibilityObserver.observe(page);
          }
        }
      }
    }
  });

  pageAddObserver.observe(pdfViewer, {
    childList: true,
    subtree: true,
  });

  console.log('[VoxPage:PDF] Page observers started');
}

/**
 * Stop observing PDF page changes
 */
export function stopPDFPageObserver(): void {
  if (textLayerObserver) {
    textLayerObserver.disconnect();
    textLayerObserver = null;
  }

  if (pageVisibilityObserver) {
    pageVisibilityObserver.disconnect();
    pageVisibilityObserver = null;
  }

  pageTextLayerCallbacks = [];
  pageVisibilityCallbacks = [];
  currentHighlightState = null;

  console.log('[VoxPage:PDF] Page observers stopped');
}

/**
 * Check if PDF page observers are running
 */
export function isPDFPageObserverRunning(): boolean {
  return textLayerObserver !== null;
}
