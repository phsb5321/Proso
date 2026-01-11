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
 * Characters to normalize for PDF text matching
 * Based on PDF.js CHARACTERS_TO_NORMALIZE from pdf_find_controller.js
 * Maps special Unicode characters to their ASCII equivalents
 */
const CHARACTERS_TO_NORMALIZE: Record<string, string> = {
  // Hyphens and dashes
  '\u2010': '-', // Hyphen
  '\u2011': '-', // Non-breaking hyphen
  '\u2012': '-', // Figure dash
  '\u2013': '-', // En dash
  '\u2014': '-', // Em dash
  '\u2015': '-', // Horizontal bar
  '\u2212': '-', // Minus sign

  // Quotation marks
  '\u2018': "'", // Left single quotation mark
  '\u2019': "'", // Right single quotation mark
  '\u201A': "'", // Single low-9 quotation mark
  '\u201B': "'", // Single high-reversed-9 quotation mark
  '\u201C': '"', // Left double quotation mark
  '\u201D': '"', // Right double quotation mark
  '\u201E': '"', // Double low-9 quotation mark
  '\u201F': '"', // Double high-reversed-9 quotation mark
  '\u00AB': '"', // Left-pointing double angle quotation mark
  '\u00BB': '"', // Right-pointing double angle quotation mark

  // Spaces
  '\u00A0': ' ', // Non-breaking space
  '\u2000': ' ', // En quad
  '\u2001': ' ', // Em quad
  '\u2002': ' ', // En space
  '\u2003': ' ', // Em space
  '\u2004': ' ', // Three-per-em space
  '\u2005': ' ', // Four-per-em space
  '\u2006': ' ', // Six-per-em space
  '\u2007': ' ', // Figure space
  '\u2008': ' ', // Punctuation space
  '\u2009': ' ', // Thin space
  '\u200A': ' ', // Hair space
  '\u202F': ' ', // Narrow no-break space
  '\u205F': ' ', // Medium mathematical space
  '\u3000': ' ', // Ideographic space

  // Common ligatures (expanded by NFKC, but include for safety)
  '\uFB00': 'ff', // Latin small ligature ff
  '\uFB01': 'fi', // Latin small ligature fi
  '\uFB02': 'fl', // Latin small ligature fl
  '\uFB03': 'ffi', // Latin small ligature ffi
  '\uFB04': 'ffl', // Latin small ligature ffl
  '\uFB05': 'st', // Latin small ligature st
  '\uFB06': 'st', // Latin small ligature st (long s + t)

  // Ellipsis
  '\u2026': '...', // Horizontal ellipsis

  // Bullets and special punctuation
  '\u2022': '-', // Bullet (treat as list marker)
  '\u2023': '-', // Triangular bullet
  '\u2043': '-', // Hyphen bullet
  '\u204C': '-', // Black leftwards bullet
  '\u204D': '-', // Black rightwards bullet
  '\u2219': '-', // Bullet operator

  // Fraction slash (NFKC converts vulgar fractions to this form)
  '\u2044': '/', // Fraction slash (e.g., 1⁄4 → 1/4)

  // Common fractions (for OCR'd documents - keep as fallback)
  '\u00BC': '1/4', // Vulgar fraction one quarter
  '\u00BD': '1/2', // Vulgar fraction one half
  '\u00BE': '3/4', // Vulgar fraction three quarters
  '\u2153': '1/3', // Vulgar fraction one third
  '\u2154': '2/3', // Vulgar fraction two thirds

  // Other common substitutions
  '\u00D7': 'x', // Multiplication sign
  '\u00F7': '/', // Division sign
  '\u2032': "'", // Prime (minutes, feet)
  '\u2033': '"', // Double prime (seconds, inches)
  '\u2034': "'''", // Triple prime
  '\u2035': "'", // Reversed prime
};

/**
 * Common OCR error patterns - characters that are often confused
 * Maps potentially misrecognized characters to their common alternatives
 * Used for fuzzy matching in OCR'd PDFs
 */
const OCR_CONFUSABLE_CHARS: Record<string, string[]> = {
  // Numbers often confused with letters
  '0': ['O', 'o', 'Q', 'D'],
  '1': ['l', 'I', 'i', '|', '!'],
  '2': ['Z', 'z'],
  '5': ['S', 's'],
  '6': ['b', 'G'],
  '8': ['B'],
  '9': ['g', 'q'],

  // Letters often confused with numbers
  O: ['0', 'Q', 'D'],
  o: ['0'],
  l: ['1', 'I', '|'],
  I: ['1', 'l', '|'],
  i: ['1', '!'],
  S: ['5', '$'],
  s: ['5'],
  Z: ['2'],
  z: ['2'],
  B: ['8', '3'],
  b: ['6'],
  G: ['6'],
  g: ['9', 'q'],
  q: ['9', 'g'],

  // Commonly confused letter pairs
  m: ['rn', 'nn'],
  rn: ['m'],
  cl: ['d'],
  d: ['cl'],
  vv: ['w'],
  w: ['vv'],
};

// Pre-build regex for character normalization (performance optimization)
const NORMALIZE_REGEX = new RegExp('[' + Object.keys(CHARACTERS_TO_NORMALIZE).join('') + ']', 'g');

/**
 * Normalize text for PDF matching
 *
 * Applies multiple normalization steps:
 * 1. Unicode NFKC normalization (expands ligatures, normalizes compatibility chars)
 * 2. Character substitution (quotes, dashes, spaces → ASCII)
 * 3. Whitespace normalization (collapse multiple spaces)
 * 4. Case normalization (lowercase)
 *
 * @param text - The text to normalize
 * @returns Normalized text for matching
 */
export function normalizeText(text: string): string {
  // Step 1: Unicode NFKC normalization
  // This handles most ligatures and compatibility characters
  let normalized = text.normalize('NFKC');

  // Step 2: Apply character substitutions for remaining special chars
  normalized = normalized.replace(NORMALIZE_REGEX, (char) => {
    return CHARACTERS_TO_NORMALIZE[char] || char;
  });

  // Step 3: Collapse whitespace and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Step 4: Lowercase for case-insensitive matching
  return normalized.toLowerCase();
}

/**
 * Create an OCR-tolerant pattern from normalized text
 *
 * Expands commonly confused characters into character classes for regex matching.
 * For example: "hello" becomes "h[e3][l1I|][l1I|][o0O]"
 *
 * This is expensive, so only use for OCR'd PDFs when exact matching fails.
 *
 * @param text - Normalized text to create pattern from
 * @returns RegExp pattern that tolerates OCR errors
 */
export function createOCRTolerantPattern(text: string): RegExp {
  const chars = text.split('');
  const patternParts: string[] = [];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];

    // Check for multi-character sequences first (rn → m, cl → d, etc.)
    if (i < chars.length - 1) {
      const twoChars = char + chars[i + 1];
      const alternatives = OCR_CONFUSABLE_CHARS[twoChars];
      if (alternatives) {
        // Create alternation for the two-character sequence
        const escaped = escapeRegExp(twoChars);
        const altEscaped = alternatives.map(escapeRegExp);
        patternParts.push(`(?:${escaped}|${altEscaped.join('|')})`);
        i++; // Skip next character
        continue;
      }
    }

    // Single character handling
    const alternatives = OCR_CONFUSABLE_CHARS[char];
    if (alternatives) {
      // Create character class for confusable characters
      // Filter out multi-character alternatives (they can't be in a char class)
      const singleCharAlternatives = alternatives.filter((alt) => alt.length === 1);
      const allChars = [char, ...singleCharAlternatives];
      // Use escapeCharClass for characters inside []
      const escaped = allChars.map(escapeCharClass).join('');
      patternParts.push(`[${escaped}]`);
    } else if (char === ' ') {
      // Allow flexible whitespace matching
      patternParts.push('\\s+');
    } else {
      // Regular character
      patternParts.push(escapeRegExp(char));
    }
  }

  return new RegExp(patternParts.join(''), 'i');
}

/**
 * Escape special regex characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape special characters for use inside a regex character class []
 * Only need to escape: ] \ ^ (at start) - (in middle)
 */
function escapeCharClass(char: string): string {
  return char.replace(/[\]\\^-]/g, '\\$&');
}

/**
 * Get the character normalization map (for testing)
 * Returns a shallow copy to prevent external modification
 */
export function getCharacterNormalizationMap(): Readonly<Record<string, string>> {
  return { ...CHARACTERS_TO_NORMALIZE };
}

/**
 * Get the OCR confusable characters map (for testing)
 * Returns a shallow copy to prevent external modification
 */
export function getOCRConfusableChars(): Readonly<Record<string, readonly string[]>> {
  return { ...OCR_CONFUSABLE_CHARS } as Record<string, readonly string[]>;
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

// ============================================================================
// PDF Text Extraction from DOM
// ============================================================================

/**
 * Result from extracting PDF text from the DOM
 */
export interface PDFDOMExtractionResult {
  success: boolean;
  paragraphs?: string[];
  meta?: {
    pageCount?: number;
    title?: string;
  };
  error?: string;
}

/**
 * Extract all text from Firefox's PDF.js viewer DOM.
 * This extracts text from the rendered .textLayer spans, which is useful when:
 * 1. The PDF is loaded via file:// URL (cannot be fetched by background script)
 * 2. We want to extract exactly what the user sees (after PDF.js rendering)
 *
 * Note: This only extracts text from **currently rendered** pages.
 * PDF.js uses virtualization, so only visible pages have their text layer rendered.
 * For multi-page PDFs, you may need to scroll through or use PDF.js APIs.
 *
 * @returns Extraction result with paragraphs and metadata
 */
export function extractPDFTextFromDOM(): PDFDOMExtractionResult {
  // Check if we're in a PDF viewer
  if (!isPDFTextLayerAvailable()) {
    return { success: false, error: 'Not a PDF viewer page' };
  }

  const paragraphs: string[] = [];
  const textLayers = document.querySelectorAll('.textLayer');

  if (textLayers.length === 0) {
    return { success: false, error: 'No text layers found - PDF may still be loading' };
  }

  // Get page count from PDF.js viewer if available
  let pageCount: number | undefined;
  const pdfViewer = document.querySelector('#viewer.pdfViewer, .pdfViewer');
  if (pdfViewer) {
    const pages = pdfViewer.querySelectorAll('.page[data-page-number]');
    pageCount = pages.length;
  }

  // Extract text from each rendered text layer (sorted by page number)
  const sortedTextLayers = Array.from(textLayers).sort((a, b) => {
    const pageA = a.closest('.page[data-page-number]');
    const pageB = b.closest('.page[data-page-number]');
    const numA = parseInt(pageA?.getAttribute('data-page-number') || '0', 10);
    const numB = parseInt(pageB?.getAttribute('data-page-number') || '0', 10);
    return numA - numB;
  });

  for (const textLayer of sortedTextLayers) {
    const spans = textLayer.querySelectorAll('span');
    let currentParagraph = '';

    for (const span of Array.from(spans)) {
      const text = span.textContent || '';
      if (!text.trim()) continue;

      // Check for line break indicators
      // PDF.js typically creates new spans for new lines
      // We use heuristics to detect paragraph breaks:
      // 1. Large vertical gap (handled by span positioning)
      // 2. Text ends with sentence-ending punctuation
      // 3. Span starts at a new vertical position

      currentParagraph += text + ' ';

      // Check if this looks like end of a paragraph
      const trimmedParagraph = currentParagraph.trim();
      if (trimmedParagraph.match(/[.!?]$/) && trimmedParagraph.length > 50) {
        paragraphs.push(trimmedParagraph);
        currentParagraph = '';
      }
    }

    // Don't forget remaining text
    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }
  }

  // Try to get title from document or PDF.js
  let title: string | undefined;
  const titleElement = document.querySelector('title');
  if (titleElement?.textContent) {
    // Firefox PDF viewer typically shows: "filename.pdf - Mozilla Firefox"
    // Or just the filename
    const titleText = titleElement.textContent;
    const pdfNameMatch = titleText.match(/^(.+?)(?:\s*-\s*Mozilla Firefox)?$/i);
    if (pdfNameMatch) {
      title = pdfNameMatch[1].trim();
    }
  }

  if (paragraphs.length === 0) {
    return {
      success: false,
      error: 'No text content found in PDF text layers',
    };
  }

  console.log(
    `[VoxPage:PDF] Extracted ${paragraphs.length} paragraphs from DOM (${textLayers.length} text layers)`,
  );

  return {
    success: true,
    paragraphs,
    meta: {
      pageCount,
      title,
    },
  };
}

/**
 * Wait for PDF text layers to be rendered, then extract text.
 * This is useful for PDFs that are still loading.
 *
 * @param maxWaitMs - Maximum time to wait for text layers (default 10s)
 * @returns Extraction result
 */
export async function waitAndExtractPDFText(maxWaitMs = 10000): Promise<PDFDOMExtractionResult> {
  const startTime = Date.now();
  const checkInterval = 500;

  // First, try immediate extraction
  const immediateResult = extractPDFTextFromDOM();
  if (
    immediateResult.success &&
    immediateResult.paragraphs &&
    immediateResult.paragraphs.length > 0
  ) {
    return immediateResult;
  }

  // Wait for text layers to appear
  return new Promise((resolve) => {
    const check = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        resolve({
          success: false,
          error: `Timeout waiting for PDF text layers after ${maxWaitMs}ms`,
        });
        return;
      }

      const result = extractPDFTextFromDOM();
      if (result.success && result.paragraphs && result.paragraphs.length > 0) {
        resolve(result);
      } else {
        setTimeout(check, checkInterval);
      }
    };

    setTimeout(check, checkInterval);
  });
}
