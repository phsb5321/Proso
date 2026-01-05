/**
 * VoxPage Highlight Manager
 * Manages paragraph and word highlighting for TTS playback
 * Uses CSS Custom Highlight API for word-level highlighting
 *
 * Implements:
 * - FR-001: Paragraph highlight within 200ms latency
 * - FR-002: Word highlight within 100ms latency
 * - FR-003: Prevent race condition during paragraph transitions
 * - FR-004: Paragraph index validation
 * - FR-006 to FR-010: Auto-scroll with reduced-motion and user control
 *
 * @module utils/content/highlight
 */

import { z } from 'zod';

/**
 * Word timing data schema
 */
export const wordTimingSchema = z.object({
  word: z.string(),
  charOffset: z.number().int().nonnegative(),
  charLength: z.number().int().positive(),
  startTimeMs: z.number().optional(),
  endTimeMs: z.number().optional(),
});

export type WordTiming = z.infer<typeof wordTimingSchema>;

/**
 * Highlight state interface
 */
export interface HighlightState {
  highlightElements: Element[];
  currentHighlightedElement: Element | null;
  currentWordTimeline: WordTiming[] | null;
  currentParagraphForWords: number;
  wordHighlightSupported: boolean;
  autoScrollEnabled: boolean;
  userScrollTimestamp: number;
  prefersReducedMotion: boolean;
}

/**
 * Constants
 */
const SCROLL_DEBOUNCE_MS = 2000; // Pause auto-scroll for 2s after user scroll
const PARAGRAPH_LATENCY_THRESHOLD_MS = 200; // FR-001
const WORD_LATENCY_THRESHOLD_MS = 100; // FR-002

/**
 * HighlightManager class for managing text highlighting during playback
 */
export class HighlightManager {
  private state: HighlightState;

  constructor() {
    this.state = {
      highlightElements: [],
      currentHighlightedElement: null,
      currentWordTimeline: null,
      currentParagraphForWords: -1,
      wordHighlightSupported: typeof CSS !== 'undefined' && typeof (CSS as any).highlights !== 'undefined',
      autoScrollEnabled: true,
      userScrollTimestamp: 0,
      prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };

    // Listen for user scroll events to pause auto-scroll
    this.setupScrollListener();
  }

  /**
   * Setup scroll event listener
   */
  private setupScrollListener(): void {
    let scrollTimeout: number | null = null;

    window.addEventListener('scroll', () => {
      if (scrollTimeout) {
        window.clearTimeout(scrollTimeout);
      }

      scrollTimeout = window.setTimeout(() => {
        this.onUserScroll();
      }, 100);
    }, { passive: true });
  }

  /**
   * Get the currently highlighted element
   */
  getCurrentHighlightedElement(): Element | null {
    return this.state.currentHighlightedElement;
  }

  /**
   * Check if word highlighting is supported
   */
  isWordHighlightSupported(): boolean {
    return this.state.wordHighlightSupported;
  }

  /**
   * Highlight the current paragraph being read
   * Implements FR-001: Paragraph highlight within 200ms
   *
   * @param index - Paragraph index (fallback)
   * @param text - Text content to match (preferred)
   * @param timestamp - Timestamp for sync verification
   * @param extractedParagraphs - Array of extracted paragraph elements
   * @param findElementByText - Function to find element by text content
   */
  highlightParagraph(
    index: number,
    text?: string,
    timestamp?: number,
    extractedParagraphs?: Element[],
    findElementByText?: (text: string) => Element | null
  ): void {
    console.log(`VoxPage: highlightParagraph called - index: ${index}, paragraphs available: ${extractedParagraphs?.length || 0}`);

    this.clearParagraphHighlights();
    this.clearWordHighlightVisual(); // FR-003: Clear visual only, keep timeline data

    // FR-001: Validate timestamp and measure latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      if (latency > PARAGRAPH_LATENCY_THRESHOLD_MS) {
        console.warn(`VoxPage: Highlight latency ${latency}ms exceeds 200ms sync threshold (FR-001)`);

        // Notify background for drift correction tracking
        this.reportDrift(latency, index);
      }
    }

    let element: Element | null = null;

    // Try text-based matching first (more reliable)
    if (text && text.length > 10 && findElementByText) {
      element = findElementByText(text);
    }

    // Fallback to index-based matching
    if (!element && extractedParagraphs && index >= 0 && index < extractedParagraphs.length) {
      element = extractedParagraphs[index];
    }

    if (element && element.nodeType === Node.ELEMENT_NODE) {
      console.log(`VoxPage: Highlighting element at index ${index}:`, element.tagName, element.textContent?.substring(0, 50));
      element.classList.add('voxpage-highlight');
      (element as HTMLElement).dataset.voxpageIndex = String(index);
      this.state.highlightElements.push(element);
      this.state.currentHighlightedElement = element;

      // Auto-scroll to highlighted element
      this.scrollToHighlight(element);
    } else {
      console.warn(`VoxPage: No element found for highlight at index ${index}, text lookup: ${text ? 'yes' : 'no'}`);
      this.state.currentHighlightedElement = null;
    }
  }

  /**
   * Set word timeline for the current paragraph
   * Sends TIMELINE_READY acknowledgment (FR-002, FR-023)
   *
   * @param wordTimeline - Array of word timing data
   * @param paragraphIndex - Paragraph index
   */
  setWordTimeline(wordTimeline: WordTiming[], paragraphIndex: number): void {
    this.state.currentWordTimeline = wordTimeline;
    this.state.currentParagraphForWords = paragraphIndex;

    // FR-002, FR-023: Send acknowledgment that timeline is ready
    this.sendTimelineReady(paragraphIndex);
  }

  /**
   * Highlight a specific word using CSS Custom Highlight API
   * Implements FR-002: Word highlight within 100ms
   * Implements FR-004: Paragraph index validation
   *
   * @param paragraphIndex - Paragraph index
   * @param wordIndex - Word index
   * @param timestamp - Timestamp for sync verification
   */
  highlightWord(paragraphIndex: number, wordIndex: number, timestamp?: number): void {
    // FR-002: Validate timestamp and measure latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      if (latency > WORD_LATENCY_THRESHOLD_MS) {
        console.warn(`VoxPage: Word highlight latency ${latency}ms exceeds 100ms sync threshold (FR-002)`);
      }
    }

    if (!this.state.wordHighlightSupported) {
      return;
    }

    if (!this.state.currentWordTimeline || this.state.currentWordTimeline.length === 0) {
      return;
    }

    // FR-004: Validate paragraph index matches current timeline
    if (paragraphIndex !== this.state.currentParagraphForWords) {
      console.warn(`VoxPage: Paragraph mismatch (expected ${this.state.currentParagraphForWords}, got ${paragraphIndex}), ignoring highlightWord`);
      return;
    }

    if (wordIndex < 0 || wordIndex >= this.state.currentWordTimeline.length) {
      return;
    }

    const wordData = this.state.currentWordTimeline[wordIndex];
    const element = this.state.currentHighlightedElement;

    if (!element || !wordData) {
      return;
    }

    try {
      const charOffset = wordData.charOffset ?? 0;
      const charLength = wordData.charLength ?? wordData.word?.length ?? 5;

      const range = this.createWordRange(element, charOffset, charLength);

      if (range) {
        const highlight = new (window as any).Highlight(range);
        (CSS as any).highlights.set('voxpage-word', highlight);
      }
    } catch (e) {
      console.warn('VoxPage: Failed to create word highlight:', e);
    }
  }

  /**
   * Create a Range object for a word within an element
   * Handles word spanning multiple text nodes
   *
   * @param element - Container element
   * @param charOffset - Character offset
   * @param charLength - Character length
   * @returns DOM Range or null if failed
   */
  createWordRange(element: Element, charOffset: number, charLength: number): Range | null {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

    let currentOffset = 0;
    let node: Node | null;

    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const nodeLength = textNode.textContent?.length || 0;

      if (currentOffset + nodeLength > charOffset) {
        const startOffset = charOffset - currentOffset;
        const endOffset = Math.min(startOffset + charLength, nodeLength);

        try {
          const range = document.createRange();
          range.setStart(textNode, startOffset);

          if (startOffset + charLength <= nodeLength) {
            // Word fits within single text node
            range.setEnd(textNode, endOffset);
          } else {
            // Word spans multiple text nodes
            let remainingLength = charLength - (nodeLength - startOffset);
            let endNode: Node | null = textNode;

            while ((endNode = walker.nextNode()) && remainingLength > 0) {
              const endTextNode = endNode as Text;
              const endNodeLength = endTextNode.textContent?.length || 0;

              if (endNodeLength >= remainingLength) {
                range.setEnd(endTextNode, remainingLength);
                break;
              }
              remainingLength -= endNodeLength;
            }
          }

          return range;
        } catch (e) {
          console.warn('VoxPage: Range creation failed:', e);
          return null;
        }
      }

      currentOffset += nodeLength;
    }

    return null;
  }

  /**
   * Scroll to keep highlighted element visible
   * Implements FR-006 through FR-010: Auto-scroll with reduced-motion and header handling
   *
   * @param element - Element to scroll to
   */
  scrollToHighlight(element: Element): void {
    if (!element) return;

    // FR-010: Check if auto-scroll is temporarily paused after user scroll
    if (!this.state.autoScrollEnabled) {
      const timeSinceUserScroll = Date.now() - this.state.userScrollTimestamp;
      if (timeSinceUserScroll < SCROLL_DEBOUNCE_MS) {
        // Still in debounce period, skip auto-scroll
        return;
      }
      // Debounce expired, re-enable auto-scroll
      this.state.autoScrollEnabled = true;
    }

    // FR-008: Respect prefers-reduced-motion
    const scrollBehavior: ScrollBehavior = this.state.prefersReducedMotion ? 'instant' : 'smooth';

    // FR-006, FR-007: Scroll to center with smooth behavior
    // FR-009: scroll-margin-top in CSS handles fixed headers
    try {
      element.scrollIntoView({
        behavior: scrollBehavior,
        block: 'center',
      });
    } catch (e) {
      // Fallback for older browsers
      element.scrollIntoView(true);
    }
  }

  /**
   * Handle user scroll event - temporarily pause auto-scroll
   * Implements FR-010: Pause auto-scroll when user manually scrolls
   */
  onUserScroll(): void {
    this.state.userScrollTimestamp = Date.now();
    this.state.autoScrollEnabled = false;

    // Notify background of scroll state
    this.reportScrollState(this.state.userScrollTimestamp);
  }

  /**
   * Enable auto-scroll
   */
  enableAutoScroll(): void {
    this.state.autoScrollEnabled = true;
  }

  /**
   * Disable auto-scroll
   */
  disableAutoScroll(): void {
    this.state.autoScrollEnabled = false;
  }

  /**
   * Check if auto-scroll is currently enabled
   */
  isAutoScrollEnabled(): boolean {
    if (!this.state.autoScrollEnabled) {
      const timeSinceUserScroll = Date.now() - this.state.userScrollTimestamp;
      return timeSinceUserScroll >= SCROLL_DEBOUNCE_MS;
    }
    return true;
  }

  /**
   * Clear paragraph highlights only
   */
  clearParagraphHighlights(): void {
    this.state.highlightElements.forEach(el => {
      el.classList.remove('voxpage-highlight');
    });
    this.state.highlightElements = [];

    document.querySelectorAll('.voxpage-highlight').forEach(el => {
      el.classList.remove('voxpage-highlight');
    });
  }

  /**
   * Clear word highlight visually only (FR-003)
   * Does NOT clear timeline data - used during paragraph transitions
   */
  clearWordHighlightVisual(): void {
    if (this.state.wordHighlightSupported && (CSS as any).highlights) {
      (CSS as any).highlights.delete('voxpage-word');
    }
    // NOTE: Do NOT clear currentWordTimeline or currentParagraphForWords here
  }

  /**
   * Clear word highlight fully (visual + data)
   * Use this only when stopping playback completely
   */
  clearWordHighlightFull(): void {
    if (this.state.wordHighlightSupported && (CSS as any).highlights) {
      (CSS as any).highlights.delete('voxpage-word');
    }
    this.state.currentWordTimeline = null;
    this.state.currentParagraphForWords = -1;
  }

  /**
   * Clear all highlights (for complete stop)
   */
  clearHighlights(): void {
    this.clearParagraphHighlights();
    this.clearWordHighlightFull();
  }

  /**
   * Get highlight elements array
   */
  getHighlightElements(): Element[] {
    return this.state.highlightElements;
  }

  /**
   * Filter highlight elements to only those still in DOM
   */
  filterValidHighlightElements(): void {
    this.state.highlightElements = this.state.highlightElements.filter(el =>
      document.body.contains(el)
    );
  }

  /**
   * Report drift to background script
   */
  private reportDrift(latencyMs: number, paragraphIndex: number): void {
    try {
      browser.runtime.sendMessage({
        action: 'reportDrift',
        latencyMs,
        paragraphIndex,
      }).catch(() => {
        // Ignore send errors
      });
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Send timeline ready acknowledgment to background script
   */
  private sendTimelineReady(paragraphIndex: number): void {
    try {
      browser.runtime.sendMessage({
        type: 'TIMELINE_READY',
        paragraphIndex,
        timestamp: Date.now(),
      }).catch(() => {
        // Ignore send errors
      });
    } catch (e) {
      console.warn('VoxPage: Failed to send TIMELINE_READY:', e);
    }
  }

  /**
   * Report scroll state to background script
   */
  private reportScrollState(userScrolledAt: number): void {
    try {
      browser.runtime.sendMessage({
        action: 'reportScrollState',
        userScrolledAt,
      }).catch(() => {
        // Ignore send errors
      });
    } catch (e) {
      // Ignore
    }
  }
}

/**
 * Singleton instance for content script usage
 */
export const highlightManager = new HighlightManager();
