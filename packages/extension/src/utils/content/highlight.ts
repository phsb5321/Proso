// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Highlight Manager
 * Manages paragraph and word highlighting for TTS playback.
 *
 * Word highlighting uses CSS Custom Highlight API with pre-computed Ranges
 * and a 60fps rAF sync loop driven by interpolated audio position.
 *
 * Three named highlights create a sliding-window reading guide:
 *   ::highlight(proso-word-active) — the spoken word (brightest)
 *   ::highlight(proso-word-near)   — ±1 word  (medium)
 *   ::highlight(proso-word-far)    — ±2 words (subtle)
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
  // rAF word sync state
  wordRanges: (Range | null)[];
  currentActiveWordIndex: number;
  audioTimeAnchorMs: number;
  audioTimeAnchorTimestamp: number;
  audioSpeed: number;
  audioIsPlaying: boolean;
  rafId: number | null;
}

/**
 * Constants
 */
const SCROLL_DEBOUNCE_MS = 2000; // Pause auto-scroll for 2s after user scroll
const PARAGRAPH_LATENCY_THRESHOLD_MS = 200; // FR-001
const WORD_LATENCY_THRESHOLD_MS = 100; // FR-002
const WORD_LEAD_OFFSET_MS = 80; // Highlight word slightly ahead for natural reading feel

// Sliding window: number of words before/after the active word
const WINDOW_BEFORE = 1; // 1 word trailing (fading out)
const WINDOW_AFTER = 2; // 2 words ahead (fading in)

// CSS Highlight API type helpers
type HighlightCtor = new (...ranges: Range[]) => unknown;
type HighlightMap = Map<string, unknown>;

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
      wordHighlightSupported:
        typeof CSS !== 'undefined' &&
        typeof (CSS as unknown as Record<string, unknown>).highlights !== 'undefined',
      autoScrollEnabled: true,
      userScrollTimestamp: 0,
      prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      wordRanges: [],
      currentActiveWordIndex: -1,
      audioTimeAnchorMs: 0,
      audioTimeAnchorTimestamp: 0,
      audioSpeed: 1,
      audioIsPlaying: false,
      rafId: null,
    };

    // Listen for user scroll events to pause auto-scroll
    this.setupScrollListener();
  }

  /**
   * Setup scroll event listener
   */
  private setupScrollListener(): void {
    let scrollTimeout: number | null = null;

    window.addEventListener(
      'scroll',
      () => {
        if (scrollTimeout) {
          window.clearTimeout(scrollTimeout);
        }

        scrollTimeout = window.setTimeout(() => {
          this.onUserScroll();
        }, 100);
      },
      { passive: true },
    );
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
   */
  highlightParagraph(
    index: number,
    text?: string,
    timestamp?: number,
    extractedParagraphs?: Element[],
    findElementByText?: (text: string) => Element | null,
  ): void {
    console.log(
      `Proso: highlightParagraph called - index: ${index}, paragraphs available: ${extractedParagraphs?.length || 0}`,
    );

    this.clearParagraphHighlights();
    this.clearWordHighlightVisual(); // FR-003: Clear visual only, keep timeline data

    // FR-001: Validate timestamp and measure latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      if (latency > PARAGRAPH_LATENCY_THRESHOLD_MS) {
        console.warn(`Proso: Highlight latency ${latency}ms exceeds 200ms sync threshold (FR-001)`);

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
      console.log(
        `Proso: Highlighting element at index ${index}:`,
        element.tagName,
        element.textContent?.substring(0, 50),
      );
      element.classList.add('proso-highlight');
      (element as HTMLElement).dataset.prosoIndex = String(index);
      this.state.highlightElements.push(element);
      this.state.currentHighlightedElement = element;

      // Auto-scroll to highlighted element
      this.scrollToHighlight(element);
    } else {
      console.warn(
        `Proso: No element found for highlight at index ${index}, text lookup: ${text ? 'yes' : 'no'}`,
      );
      this.state.currentHighlightedElement = null;
    }
  }

  /**
   * Set word timeline for the current paragraph.
   * Pre-computes Range objects for each word for fast highlight updates.
   * Sends TIMELINE_READY acknowledgment (FR-002, FR-023).
   */
  setWordTimeline(wordTimeline: WordTiming[], paragraphIndex: number): void {
    this.state.currentWordTimeline = wordTimeline;
    this.state.currentParagraphForWords = paragraphIndex;
    this.state.currentActiveWordIndex = -1;

    // Pre-compute Range objects for each word using the highlighted DOM element
    this.state.wordRanges = [];
    const element = this.state.currentHighlightedElement;
    if (element && wordTimeline.length > 0) {
      for (const wt of wordTimeline) {
        const charOffset = wt.charOffset ?? 0;
        const charLength = wt.charLength ?? wt.word?.length ?? 1;
        const range = this.createWordRange(element, charOffset, charLength);
        this.state.wordRanges.push(range);
      }
      console.log(
        `Proso: Pre-computed ${this.state.wordRanges.filter(Boolean).length}/${wordTimeline.length} word ranges`,
      );
    }

    // FR-002, FR-023: Send acknowledgment that timeline is ready
    this.sendTimelineReady(paragraphIndex);
  }

  /**
   * Update audio position from background script.
   * Called at ~4Hz from timeupdate events.
   */
  updateAudioPosition(currentTimeMs: number, isPlaying: boolean, speed: number): void {
    this.state.audioTimeAnchorMs = currentTimeMs;
    this.state.audioTimeAnchorTimestamp = performance.now();
    this.state.audioSpeed = speed;
    this.state.audioIsPlaying = isPlaying;

    if (isPlaying && this.state.currentWordTimeline && this.state.currentWordTimeline.length > 0) {
      this.startWordSyncLoop();
    } else if (!isPlaying) {
      this.stopWordSyncLoop();
    }
  }

  /**
   * Start the rAF-based word sync loop for 60fps highlighting.
   */
  startWordSyncLoop(): void {
    if (this.state.rafId !== null) return; // Already running

    const tick = () => {
      if (!this.state.audioIsPlaying || !this.state.currentWordTimeline) {
        this.stopWordSyncLoop();
        return;
      }

      const interpolatedTime = this.interpolateTime();
      this.syncWordAtTime(interpolatedTime);

      this.state.rafId = requestAnimationFrame(tick);
    };

    this.state.rafId = requestAnimationFrame(tick);
  }

  /**
   * Stop the rAF-based word sync loop.
   */
  stopWordSyncLoop(): void {
    if (this.state.rafId !== null) {
      cancelAnimationFrame(this.state.rafId);
      this.state.rafId = null;
    }
  }

  /**
   * Interpolate current audio time between background updates.
   */
  private interpolateTime(): number {
    const elapsed = performance.now() - this.state.audioTimeAnchorTimestamp;
    return this.state.audioTimeAnchorMs + elapsed * this.state.audioSpeed;
  }

  /**
   * Sync word highlight at the given interpolated time using binary search.
   * Uses CSS Custom Highlight API with multiple named highlights for a sliding window.
   */
  private syncWordAtTime(timeMs: number): void {
    const timeline = this.state.currentWordTimeline;
    if (!timeline || timeline.length === 0) return;
    if (!this.state.wordHighlightSupported) return;

    const adjustedTime = timeMs + WORD_LEAD_OFFSET_MS;
    const wordIndex = this.findWordIndexAtTime(timeline, adjustedTime);

    if (wordIndex === this.state.currentActiveWordIndex) return;
    this.state.currentActiveWordIndex = wordIndex;

    const highlights = (CSS as unknown as Record<string, unknown>).highlights as
      | HighlightMap
      | undefined;
    if (!highlights) return;

    const HighlightClass = (window as unknown as Record<string, unknown>).Highlight as
      | HighlightCtor
      | undefined;
    if (!HighlightClass) return;

    // Collect ranges for each highlight level
    const activeRanges: Range[] = [];
    const nearRanges: Range[] = [];
    const farRanges: Range[] = [];

    if (wordIndex >= 0) {
      // Active word
      const activeRange = this.state.wordRanges[wordIndex];
      if (activeRange) activeRanges.push(activeRange);

      // Near words (±1)
      for (const offset of [-1, 1]) {
        const i = wordIndex + offset;
        if (i >= 0 && i < this.state.wordRanges.length) {
          const range = this.state.wordRanges[i];
          if (range) nearRanges.push(range);
        }
      }

      // Far words (−2 trailing, +2 ahead)
      for (const offset of [-WINDOW_BEFORE - 1, WINDOW_AFTER]) {
        const i = wordIndex + offset;
        if (i >= 0 && i < this.state.wordRanges.length) {
          const range = this.state.wordRanges[i];
          if (range) farRanges.push(range);
        }
      }
    }

    // Update CSS Highlights (create new Highlight objects — they're lightweight)
    if (activeRanges.length > 0) {
      highlights.set('proso-word-active', new HighlightClass(...activeRanges));
    } else {
      highlights.delete('proso-word-active');
    }

    if (nearRanges.length > 0) {
      highlights.set('proso-word-near', new HighlightClass(...nearRanges));
    } else {
      highlights.delete('proso-word-near');
    }

    if (farRanges.length > 0) {
      highlights.set('proso-word-far', new HighlightClass(...farRanges));
    } else {
      highlights.delete('proso-word-far');
    }

    // Also set the legacy 'proso-word' for backward compat with existing ::highlight(proso-word)
    if (activeRanges.length > 0) {
      highlights.set('proso-word', new HighlightClass(...activeRanges));
    } else {
      highlights.delete('proso-word');
    }
  }

  /**
   * Binary search for the word index at a given time in the timeline.
   */
  private findWordIndexAtTime(timeline: WordTiming[], timeMs: number): number {
    if (timeline.length === 0) return -1;

    const startMs = timeline[0]!.startTimeMs ?? 0;
    if (timeMs < startMs) return -1;

    const lastStart = timeline[timeline.length - 1]!.startTimeMs ?? 0;
    if (timeMs >= lastStart) return timeline.length - 1;

    let lo = 0;
    let hi = timeline.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const entry = timeline[mid]!;
      const entryStart = entry.startTimeMs ?? 0;
      const entryEnd = entry.endTimeMs ?? entryStart;

      if (timeMs >= entryStart && timeMs < entryEnd) {
        return mid;
      }
      if (timeMs < entryStart) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    return lo < timeline.length ? lo : timeline.length - 1;
  }

  /**
   * Highlight a specific word using CSS Custom Highlight API (legacy/fallback).
   * Called when the rAF loop is not active (e.g., from direct highlightWord messages).
   */
  highlightWord(paragraphIndex: number, wordIndex: number, timestamp?: number): void {
    // FR-002: Validate timestamp and measure latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      if (latency > WORD_LATENCY_THRESHOLD_MS) {
        console.warn(
          `Proso: Word highlight latency ${latency}ms exceeds 100ms sync threshold (FR-002)`,
        );
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
      console.warn(
        `Proso: Paragraph mismatch (expected ${this.state.currentParagraphForWords}, got ${paragraphIndex}), ignoring highlightWord`,
      );
      return;
    }

    if (wordIndex < 0 || wordIndex >= this.state.currentWordTimeline.length) {
      return;
    }

    // If we have pre-computed ranges, use the sliding window via syncWordAtTime
    if (this.state.wordRanges.length > 0) {
      const entry = this.state.currentWordTimeline[wordIndex];
      if (entry) {
        this.syncWordAtTime((entry.startTimeMs ?? 0) + 1);
      }
      return;
    }

    // Fallback: single-word highlight via Range
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
        const HighlightClass = (window as unknown as Record<string, unknown>)
          .Highlight as HighlightCtor;
        const highlights = (CSS as unknown as Record<string, unknown>).highlights as HighlightMap;
        highlights.set('proso-word', new HighlightClass(range));
      }
    } catch (e) {
      console.warn('Proso: Failed to create word highlight:', e);
    }
  }

  /**
   * Create a Range object for a word within an element.
   * Walks text nodes to find the character offset within the DOM tree.
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
          console.warn('Proso: Range creation failed:', e);
          return null;
        }
      }

      currentOffset += nodeLength;
    }

    return null;
  }

  /**
   * Scroll to keep highlighted element visible
   * Implements FR-006 through FR-010
   */
  scrollToHighlight(element: Element): void {
    if (!element) return;

    // FR-010: Check if auto-scroll is temporarily paused after user scroll
    if (!this.state.autoScrollEnabled) {
      const timeSinceUserScroll = Date.now() - this.state.userScrollTimestamp;
      if (timeSinceUserScroll < SCROLL_DEBOUNCE_MS) {
        return;
      }
      this.state.autoScrollEnabled = true;
    }

    // FR-008: Respect prefers-reduced-motion
    const scrollBehavior: ScrollBehavior = this.state.prefersReducedMotion ? 'instant' : 'smooth';

    try {
      element.scrollIntoView({
        behavior: scrollBehavior,
        block: 'center',
      });
    } catch (_e) {
      element.scrollIntoView(true);
    }
  }

  /**
   * Handle user scroll event - temporarily pause auto-scroll
   */
  onUserScroll(): void {
    this.state.userScrollTimestamp = Date.now();
    this.state.autoScrollEnabled = false;
    this.reportScrollState(this.state.userScrollTimestamp);
  }

  enableAutoScroll(): void {
    this.state.autoScrollEnabled = true;
  }

  disableAutoScroll(): void {
    this.state.autoScrollEnabled = false;
  }

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
    this.state.highlightElements.forEach((el) => {
      el.classList.remove('proso-highlight');
    });
    this.state.highlightElements = [];

    document.querySelectorAll('.proso-highlight').forEach((el) => {
      el.classList.remove('proso-highlight');
    });
  }

  /**
   * Clear word highlight visually only (FR-003)
   * Does NOT clear timeline data - used during paragraph transitions
   */
  clearWordHighlightVisual(): void {
    this.state.currentActiveWordIndex = -1;

    if (
      this.state.wordHighlightSupported &&
      (CSS as unknown as Record<string, unknown>).highlights
    ) {
      const highlights = (CSS as unknown as Record<string, unknown>).highlights as HighlightMap;
      highlights.delete('proso-word');
      highlights.delete('proso-word-active');
      highlights.delete('proso-word-near');
      highlights.delete('proso-word-far');
    }
  }

  /**
   * Clear word highlight fully (visual + data)
   */
  clearWordHighlightFull(): void {
    this.stopWordSyncLoop();
    this.clearWordHighlightVisual();
    this.state.currentWordTimeline = null;
    this.state.currentParagraphForWords = -1;
    this.state.wordRanges = [];
    this.state.audioIsPlaying = false;
  }

  /**
   * Clear all highlights (for complete stop)
   */
  clearHighlights(): void {
    this.stopWordSyncLoop();
    this.clearParagraphHighlights();
    this.clearWordHighlightFull();
  }

  getHighlightElements(): Element[] {
    return this.state.highlightElements;
  }

  filterValidHighlightElements(): void {
    this.state.highlightElements = this.state.highlightElements.filter((el) =>
      document.body.contains(el),
    );
  }

  /**
   * Report drift to background script
   */
  private reportDrift(latencyMs: number, paragraphIndex: number): void {
    try {
      browser.runtime
        .sendMessage({
          action: 'reportDrift',
          latencyMs,
          paragraphIndex,
        })
        .catch(() => {});
    } catch (_e) {
      // Ignore
    }
  }

  /**
   * Send timeline ready acknowledgment to background script
   */
  private sendTimelineReady(paragraphIndex: number): void {
    try {
      browser.runtime
        .sendMessage({
          type: 'TIMELINE_READY',
          paragraphIndex,
          timestamp: Date.now(),
        })
        .catch(() => {});
    } catch (e) {
      console.warn('Proso: Failed to send TIMELINE_READY:', e);
    }
  }

  /**
   * Report scroll state to background script
   */
  private reportScrollState(userScrolledAt: number): void {
    try {
      browser.runtime
        .sendMessage({
          action: 'reportScrollState',
          userScrolledAt,
        })
        .catch(() => {});
    } catch (_e) {
      // Ignore
    }
  }
}

/**
 * Singleton instance for content script usage
 */
export const highlightManager = new HighlightManager();
