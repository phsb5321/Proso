/**
 * Paragraph Selection Test Utilities
 *
 * Provides helpers for testing section/paragraph selection functionality.
 *
 * @module tests/fixtures/selection-helpers
 */

import { jest } from '@jest/globals';

/**
 * Extracted paragraph structure for testing
 */
export interface MockExtractedParagraph {
  index: number;
  text: string;
  type: 'paragraph' | 'heading' | 'list';
  headingLevel: number | null;
  element?: HTMLElement;
}

/**
 * Create mock extracted paragraphs array
 */
export function createMockExtractedParagraphs(
  count: number,
  options?: {
    includeHeadings?: boolean;
    headingIndices?: number[];
  }
): MockExtractedParagraph[] {
  const paragraphs: MockExtractedParagraph[] = [];
  const headingIndices = options?.headingIndices ?? (options?.includeHeadings ? [0, 3, 7] : []);

  for (let i = 0; i < count; i++) {
    const isHeading = headingIndices.includes(i);
    paragraphs.push({
      index: i,
      text: isHeading ? `Heading ${i}` : `Paragraph ${i} content text goes here.`,
      type: isHeading ? 'heading' : 'paragraph',
      headingLevel: isHeading ? 2 : null,
    });
  }

  return paragraphs;
}

/**
 * Create DOM elements matching extracted paragraphs
 */
export function createParagraphDOMElements(
  paragraphs: MockExtractedParagraph[],
  container?: HTMLElement
): HTMLElement[] {
  const parent = container ?? document.createElement('article');
  const elements: HTMLElement[] = [];

  for (const para of paragraphs) {
    const el =
      para.type === 'heading'
        ? document.createElement(`h${para.headingLevel ?? 2}`)
        : document.createElement('p');

    el.textContent = para.text;
    el.dataset.paragraphIndex = String(para.index);
    el.classList.add('voxpage-paragraph');

    parent.appendChild(el);
    elements.push(el);
    para.element = el;
  }

  return elements;
}

/**
 * Selection state for testing
 */
export interface SelectionState {
  isActive: boolean;
  selectedIndex: number | null;
  lastClickTime: number;
  extractedCount: number;
}

/**
 * Create initial selection state
 */
export function createSelectionState(
  extractedCount: number,
  options?: Partial<SelectionState>
): SelectionState {
  return {
    isActive: options?.isActive ?? false,
    selectedIndex: options?.selectedIndex ?? null,
    lastClickTime: options?.lastClickTime ?? 0,
    extractedCount,
  };
}

/**
 * Click event options for simulation
 */
export interface ClickEventOptions {
  bubbles?: boolean;
  cancelable?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/**
 * Simulate a click event on an element
 */
export function simulateClick(element: HTMLElement, options?: ClickEventOptions): MouseEvent {
  const event = new MouseEvent('click', {
    bubbles: options?.bubbles ?? true,
    cancelable: options?.cancelable ?? true,
    ctrlKey: options?.ctrlKey ?? false,
    shiftKey: options?.shiftKey ?? false,
    altKey: options?.altKey ?? false,
    metaKey: options?.metaKey ?? false,
    view: window,
  });

  element.dispatchEvent(event);
  return event;
}

/**
 * Simulate rapid clicks (for debounce testing)
 */
export function simulateRapidClicks(
  element: HTMLElement,
  count: number,
  intervalMs: number = 50
): void {
  for (let i = 0; i < count; i++) {
    setTimeout(() => simulateClick(element), i * intervalMs);
  }
}

/**
 * Selection assertion helpers
 */
export const selectionAssertions = {
  /**
   * Assert element is highlighted
   */
  isHighlighted(element: HTMLElement) {
    expect(
      element.classList.contains('voxpage-highlight') ||
        element.classList.contains('voxpage-active') ||
        element.getAttribute('data-highlighted') === 'true'
    ).toBe(true);
  },

  /**
   * Assert element is NOT highlighted
   */
  isNotHighlighted(element: HTMLElement) {
    expect(
      element.classList.contains('voxpage-highlight') ||
        element.classList.contains('voxpage-active') ||
        element.getAttribute('data-highlighted') === 'true'
    ).toBe(false);
  },

  /**
   * Assert selection state matches expected
   */
  stateMatches(actual: SelectionState, expected: Partial<SelectionState>) {
    if (expected.isActive !== undefined) {
      expect(actual.isActive).toBe(expected.isActive);
    }
    if (expected.selectedIndex !== undefined) {
      expect(actual.selectedIndex).toBe(expected.selectedIndex);
    }
    if (expected.extractedCount !== undefined) {
      expect(actual.extractedCount).toBe(expected.extractedCount);
    }
  },

  /**
   * Assert click was debounced (second click ignored)
   */
  wasDebounced(clickCount: number, processedCount: number) {
    expect(processedCount).toBeLessThan(clickCount);
  },
};

/**
 * Mock message sender for paragraph click events
 */
export interface ParagraphClickPayload {
  index: number;
  timestamp: number;
}

/**
 * Create a mock click message capture
 */
export function createClickMessageCapture() {
  const messages: ParagraphClickPayload[] = [];

  const capture = jest.fn((payload: ParagraphClickPayload) => {
    messages.push({ ...payload });
  });

  return {
    capture,
    messages,
    lastMessage: () => messages[messages.length - 1],
    messageCount: () => messages.length,
    reset: () => {
      messages.length = 0;
      capture.mockClear();
    },
  };
}

/**
 * Create a test fixture container with paragraphs
 */
export function createTestArticle(paragraphCount: number = 10): {
  container: HTMLElement;
  paragraphs: MockExtractedParagraph[];
  elements: HTMLElement[];
} {
  const container = document.createElement('article');
  container.id = 'test-article';
  document.body.appendChild(container);

  const paragraphs = createMockExtractedParagraphs(paragraphCount, { includeHeadings: true });
  const elements = createParagraphDOMElements(paragraphs, container);

  return { container, paragraphs, elements };
}

/**
 * Clean up test article from DOM
 */
export function cleanupTestArticle(container: HTMLElement) {
  container.remove();
}

/**
 * Wait for next animation frame (useful for click handler timing)
 */
export function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Wait for debounce period to pass
 */
export function waitForDebounce(debounceMs: number = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, debounceMs + 50));
}
