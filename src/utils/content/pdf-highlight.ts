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
 */
function getTextLayers(): Element[] {
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
 * @returns Array of matching span elements
 */
export function findMatchingSpans(paragraphText: string): HTMLSpanElement[] {
  const textLayers = getTextLayers();
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
 * Highlight spans in the PDF text layer
 *
 * @param paragraphText - The paragraph text to highlight
 * @param paragraphIndex - The paragraph index (for data attribute)
 * @returns The first highlighted element (for scrolling), or null if not found
 */
export function highlightPDFParagraph(
  paragraphText: string,
  paragraphIndex: number,
): HTMLElement | null {
  // Clear previous PDF highlights
  clearPDFHighlights();

  const matchingSpans = findMatchingSpans(paragraphText);

  if (matchingSpans.length === 0) {
    console.warn('[VoxPage:PDF] No matching spans found for paragraph', paragraphIndex);
    return null;
  }

  console.log(
    `[VoxPage:PDF] Highlighting ${matchingSpans.length} spans for paragraph ${paragraphIndex}`,
  );

  // Apply highlight class to all matching spans
  for (const span of matchingSpans) {
    span.classList.add(PDF_HIGHLIGHT_CLASS);
    span.classList.add('voxpage-highlight'); // Also add standard class for styling
    span.dataset.voxpageIndex = String(paragraphIndex);
  }

  // Return first span for scrolling
  return matchingSpans[0] || null;
}

/**
 * Clear all PDF paragraph highlights
 */
export function clearPDFHighlights(): void {
  const highlighted = document.querySelectorAll(`.${PDF_HIGHLIGHT_CLASS}`);
  for (const el of Array.from(highlighted)) {
    el.classList.remove(PDF_HIGHLIGHT_CLASS);
    el.classList.remove('voxpage-highlight');
    delete (el as HTMLElement).dataset.voxpageIndex;
  }
}

/**
 * Get all currently highlighted PDF elements
 */
export function getPDFHighlightElements(): Element[] {
  return Array.from(document.querySelectorAll(`.${PDF_HIGHLIGHT_CLASS}`));
}

/**
 * Scroll to the first highlighted PDF span
 */
export function scrollToPDFHighlight(): void {
  const firstHighlight = document.querySelector(`.${PDF_HIGHLIGHT_CLASS}`);
  if (firstHighlight) {
    firstHighlight.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }
}
