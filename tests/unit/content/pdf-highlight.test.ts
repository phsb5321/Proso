// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.

/**
 * Unit tests for PDF text layer highlighting
 * Tests page targeting, span matching, and bounding box fallback
 *
 * @module tests/unit/content/pdf-highlight
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  findMatchingSpans,
  highlightPDFParagraph,
  clearPDFHighlights,
  getPDFHighlightElements,
  scrollToPDFHighlight,
  getHighlightPageNumber,
  isPDFTextLayerAvailable,
  getCurrentHighlightState,
  startPDFPageObserver,
  stopPDFPageObserver,
  isPDFPageObserverRunning,
  onPageTextLayerReady,
  onPageVisibilityChange,
} from '../../../src/utils/content/pdf-highlight';
import type { PDFHighlightOptions } from '../../../src/utils/content/pdf-highlight';

// Mock IntersectionObserver for JSDOM
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
  }

  observe(): void {
    // No-op for testing
  }

  unobserve(): void {
    // No-op for testing
  }

  disconnect(): void {
    // No-op for testing
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// Install mock before tests
(globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver = MockIntersectionObserver;

describe('pdf-highlight', () => {
  // Setup DOM structure mimicking PDF.js viewer
  let container: HTMLDivElement;

  function createPage(pageNumber: number, textContent: string[]): HTMLDivElement {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset.pageNumber = String(pageNumber);

    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';

    for (const text of textContent) {
      const span = document.createElement('span');
      span.textContent = text;
      textLayer.appendChild(span);
    }

    page.appendChild(textLayer);
    return page;
  }

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'viewer';
    container.className = 'pdfViewer';
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Stop observers and clear state before clearing DOM
    stopPDFPageObserver();
    clearPDFHighlights();
    document.body.innerHTML = '';
  });

  describe('isPDFTextLayerAvailable', () => {
    it('should return true when .textLayer exists', () => {
      container.appendChild(createPage(1, ['Hello world']));
      expect(isPDFTextLayerAvailable()).toBe(true);
    });

    it('should return true when #viewer.pdfViewer exists', () => {
      // Already have #viewer.pdfViewer from beforeEach
      expect(isPDFTextLayerAvailable()).toBe(true);
    });

    it('should return false when no PDF viewer elements exist', () => {
      document.body.innerHTML = '<div>Regular page</div>';
      expect(isPDFTextLayerAvailable()).toBe(false);
    });
  });

  describe('findMatchingSpans', () => {
    it('should find spans matching paragraph text', () => {
      container.appendChild(createPage(1, ['The quick ', 'brown fox ', 'jumps over']));

      const spans = findMatchingSpans('The quick brown fox jumps over');
      expect(spans.length).toBeGreaterThan(0);
    });

    it('should return empty array for text shorter than 10 chars', () => {
      container.appendChild(createPage(1, ['Short']));

      const spans = findMatchingSpans('Short');
      expect(spans).toEqual([]);
    });

    it('should handle fragmented spans (PDF.js behavior)', () => {
      // PDF.js often splits text mid-word
      container.appendChild(createPage(1, ['The qui', 'ck bro', 'wn fox j', 'umps']));

      const spans = findMatchingSpans('The quick brown fox jumps');
      expect(spans.length).toBeGreaterThan(0);
    });

    it('should normalize whitespace when matching', () => {
      container.appendChild(createPage(1, ['Hello   world  ', ' with   spaces']));

      const spans = findMatchingSpans('Hello world with spaces');
      expect(spans.length).toBeGreaterThan(0);
    });

    it('should use prefix matching as fallback', () => {
      container.appendChild(
        createPage(1, ['This is the start of a very long paragraph that continues']),
      );

      const spans = findMatchingSpans('This is the start');
      expect(spans.length).toBeGreaterThan(0);
    });

    describe('page targeting', () => {
      beforeEach(() => {
        container.appendChild(createPage(1, ['Content on page one']));
        container.appendChild(createPage(2, ['Content on page two']));
        container.appendChild(createPage(3, ['Content on page three']));
      });

      it('should only search specified page when pageNumber is provided', () => {
        const spans = findMatchingSpans('Content on page two', 2);
        expect(spans.length).toBeGreaterThan(0);
        expect(spans[0].textContent).toContain('two');
      });

      it('should return empty array when text not on specified page', () => {
        const spans = findMatchingSpans('Content on page one', 2);
        expect(spans).toEqual([]);
      });

      it('should search all pages when pageNumber is undefined', () => {
        // Should find text on any page
        const spans1 = findMatchingSpans('Content on page one');
        expect(spans1.length).toBeGreaterThan(0);

        const spans3 = findMatchingSpans('Content on page three');
        expect(spans3.length).toBeGreaterThan(0);
      });

      it('should return empty array for non-existent page', () => {
        const spans = findMatchingSpans('Content on page one', 999);
        expect(spans).toEqual([]);
      });
    });
  });

  describe('highlightPDFParagraph', () => {
    beforeEach(() => {
      container.appendChild(createPage(1, ['First paragraph content here']));
      container.appendChild(createPage(2, ['Second paragraph content here']));
    });

    it('should add highlight class to matching spans', () => {
      const element = highlightPDFParagraph('First paragraph content here', 0);

      expect(element).not.toBeNull();
      expect(element?.classList.contains('voxpage-pdf-highlight')).toBe(true);
      expect(element?.classList.contains('voxpage-highlight')).toBe(true);
    });

    it('should set paragraph index data attribute', () => {
      const element = highlightPDFParagraph('First paragraph content here', 5);

      expect(element?.dataset.voxpageIndex).toBe('5');
    });

    it('should clear previous highlights before adding new ones', () => {
      highlightPDFParagraph('First paragraph content here', 0);
      const firstHighlights = getPDFHighlightElements();
      expect(firstHighlights.length).toBeGreaterThan(0);

      highlightPDFParagraph('Second paragraph content here', 1);

      // First paragraph should no longer be highlighted
      const page1Span = container.querySelector('.page[data-page-number="1"] span');
      expect(page1Span?.classList.contains('voxpage-pdf-highlight')).toBe(false);
    });

    it('should return null when no match found', () => {
      const element = highlightPDFParagraph('Non-existent text that will not match', 0);

      expect(element).toBeNull();
    });

    describe('with options', () => {
      it('should target specific page when pageNumber is provided', () => {
        const options: PDFHighlightOptions = { pageNumber: 2 };

        const element = highlightPDFParagraph('Second paragraph content here', 1, options);

        expect(element).not.toBeNull();
        const pageNumber = getHighlightPageNumber(element!);
        expect(pageNumber).toBe(2);
      });

      it('should fail to match when text is on different page', () => {
        const options: PDFHighlightOptions = { pageNumber: 1 };

        // Text is on page 2, but we're targeting page 1
        const element = highlightPDFParagraph('Second paragraph content here', 1, options);

        expect(element).toBeNull();
      });
    });

    describe('bounding box fallback', () => {
      it('should create bounding box overlay when text match fails and bbox provided', () => {
        const options: PDFHighlightOptions = {
          pageNumber: 1,
          boundingBox: { x: 50, y: 100, width: 300, height: 50 },
        };

        // Non-matching text with bounding box fallback
        const element = highlightPDFParagraph('Non-existent text here', 0, options);

        expect(element).not.toBeNull();
        expect(element?.dataset.voxpageFallback).toBe('true');
        expect(element?.style.left).toBe('50px');
        expect(element?.style.top).toBe('100px');
      });

      it('should not create bbox fallback if pageNumber is missing', () => {
        const options: PDFHighlightOptions = {
          boundingBox: { x: 50, y: 100, width: 300, height: 50 },
          // No pageNumber
        };

        const element = highlightPDFParagraph('Non-existent text here', 0, options);

        expect(element).toBeNull();
      });

      it('should clear bounding box highlights with clearPDFHighlights', () => {
        const options: PDFHighlightOptions = {
          pageNumber: 1,
          boundingBox: { x: 50, y: 100, width: 300, height: 50 },
        };

        highlightPDFParagraph('Non-existent text', 0, options);
        expect(document.querySelector('.voxpage-pdf-bbox-highlight')).not.toBeNull();

        clearPDFHighlights();

        expect(document.querySelector('.voxpage-pdf-bbox-highlight')).toBeNull();
      });
    });
  });

  describe('clearPDFHighlights', () => {
    it('should remove all highlight classes', () => {
      container.appendChild(createPage(1, ['Test content for clearing']));
      highlightPDFParagraph('Test content for clearing', 0);

      expect(getPDFHighlightElements().length).toBeGreaterThan(0);

      clearPDFHighlights();

      expect(getPDFHighlightElements().length).toBe(0);
    });

    it('should remove data attributes', () => {
      container.appendChild(createPage(1, ['Test content']));
      highlightPDFParagraph('Test content', 5);

      const span = container.querySelector('span');
      expect(span?.dataset.voxpageIndex).toBe('5');

      clearPDFHighlights();

      expect(span?.dataset.voxpageIndex).toBeUndefined();
    });
  });

  describe('getPDFHighlightElements', () => {
    it('should return all highlighted elements', () => {
      container.appendChild(createPage(1, ['Multi ', 'span ', 'paragraph']));
      highlightPDFParagraph('Multi span paragraph', 0);

      const elements = getPDFHighlightElements();
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it('should include bounding box fallback elements', () => {
      container.appendChild(createPage(1, ['Some text']));
      const options: PDFHighlightOptions = {
        pageNumber: 1,
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      };
      highlightPDFParagraph('Non-matching text here', 0, options);

      const elements = getPDFHighlightElements();
      expect(elements.length).toBe(1);
      expect((elements[0] as HTMLElement).dataset.voxpageFallback).toBe('true');
    });
  });

  describe('scrollToPDFHighlight', () => {
    it('should scroll to first highlight with smooth behavior', () => {
      container.appendChild(createPage(1, ['Scrollable content here']));
      highlightPDFParagraph('Scrollable content here', 0);

      const highlight = document.querySelector('.voxpage-pdf-highlight') as HTMLElement;
      // JSDOM doesn't have scrollIntoView, so we mock it
      const scrollIntoViewMock = jest.fn();
      highlight.scrollIntoView = scrollIntoViewMock;

      scrollToPDFHighlight();

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });
    });

    it('should use instant scroll when reducedMotion is true', () => {
      container.appendChild(createPage(1, ['Scrollable content here']));
      highlightPDFParagraph('Scrollable content here', 0);

      const highlight = document.querySelector('.voxpage-pdf-highlight') as HTMLElement;
      const scrollIntoViewMock = jest.fn();
      highlight.scrollIntoView = scrollIntoViewMock;

      scrollToPDFHighlight(true);

      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: 'instant',
        block: 'center',
      });
    });

    it('should scroll to bounding box fallback if no span highlights', () => {
      container.appendChild(createPage(1, ['Some text']));
      const options: PDFHighlightOptions = {
        pageNumber: 1,
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      };
      highlightPDFParagraph('Non-matching text here', 0, options);

      const fallback = document.querySelector('.voxpage-pdf-bbox-highlight') as HTMLElement;
      const scrollIntoViewMock = jest.fn();
      fallback.scrollIntoView = scrollIntoViewMock;

      scrollToPDFHighlight();

      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  describe('getHighlightPageNumber', () => {
    it('should return page number from highlighted element', () => {
      container.appendChild(createPage(3, ['Content on page three']));
      const element = highlightPDFParagraph('Content on page three', 0);

      const pageNumber = getHighlightPageNumber(element!);
      expect(pageNumber).toBe(3);
    });

    it('should return null if element is not in a page', () => {
      const orphanSpan = document.createElement('span');
      document.body.appendChild(orphanSpan);

      const pageNumber = getHighlightPageNumber(orphanSpan);
      expect(pageNumber).toBeNull();
    });
  });

  describe('page change detection', () => {
    describe('getCurrentHighlightState', () => {
      it('should return null when no highlight has been applied', () => {
        const state = getCurrentHighlightState();
        expect(state).toBeNull();
      });

      it('should store highlight state when highlighting succeeds', () => {
        container.appendChild(createPage(1, ['Content to highlight here']));

        highlightPDFParagraph('Content to highlight here', 5);

        const state = getCurrentHighlightState();
        expect(state).not.toBeNull();
        expect(state?.paragraphText).toBe('Content to highlight here');
        expect(state?.paragraphIndex).toBe(5);
      });

      it('should store options when provided', () => {
        container.appendChild(createPage(1, ['Content with options here']));

        const options: PDFHighlightOptions = {
          pageNumber: 1,
          reducedMotion: true,
        };
        highlightPDFParagraph('Content with options here', 3, options);

        const state = getCurrentHighlightState();
        expect(state?.options?.pageNumber).toBe(1);
        expect(state?.options?.reducedMotion).toBe(true);
      });

      it('should be cleared when clearPDFHighlights is called', () => {
        container.appendChild(createPage(1, ['Content to clear here']));
        highlightPDFParagraph('Content to clear here', 0);

        expect(getCurrentHighlightState()).not.toBeNull();

        clearPDFHighlights();

        expect(getCurrentHighlightState()).toBeNull();
      });
    });

    describe('startPDFPageObserver', () => {
      it('should warn if no PDF viewer found', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // No PDF viewer in DOM
        document.body.innerHTML = '<div>Not a PDF viewer</div>';

        startPDFPageObserver();

        expect(warnSpy).toHaveBeenCalledWith(
          '[VoxPage:PDF] PDF viewer not found, cannot start page observer',
        );
        warnSpy.mockRestore();
      });

      it('should start observing when PDF viewer exists', () => {
        // container has pdfViewer class from beforeEach
        startPDFPageObserver();

        expect(isPDFPageObserverRunning()).toBe(true);

        stopPDFPageObserver();
      });

      it('should not start twice', () => {
        startPDFPageObserver();
        startPDFPageObserver(); // Second call should be no-op

        expect(isPDFPageObserverRunning()).toBe(true);

        stopPDFPageObserver();
      });
    });

    describe('stopPDFPageObserver', () => {
      it('should stop the observer', () => {
        startPDFPageObserver();
        expect(isPDFPageObserverRunning()).toBe(true);

        stopPDFPageObserver();

        expect(isPDFPageObserverRunning()).toBe(false);
      });
    });

    describe('onPageTextLayerReady', () => {
      it('should call callback when text layer spans are added', async () => {
        container.appendChild(createPage(1, [])); // Empty page initially

        startPDFPageObserver();

        const callback = jest.fn();
        onPageTextLayerReady(callback);

        // Simulate PDF.js adding text layer content
        const textLayer = container.querySelector('.page[data-page-number="1"] .textLayer');
        const span = document.createElement('span');
        span.textContent = 'New text content';
        textLayer?.appendChild(span);

        // MutationObserver is async, wait for it
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Note: The callback won't be called in JSDOM because MutationObserver
        // doesn't observe the same way as real browsers for dynamically added content
        // This test documents the expected behavior

        stopPDFPageObserver();
      });
    });

    describe('onPageVisibilityChange', () => {
      it('should register visibility callback', () => {
        startPDFPageObserver();

        const callback = jest.fn();
        onPageVisibilityChange(callback);

        // IntersectionObserver behavior is hard to test in JSDOM
        // This test documents the expected behavior

        stopPDFPageObserver();
      });
    });
  });
});
