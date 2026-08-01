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
import { createLogger } from '../logging/logger';

const log = createLogger('content');

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
  // rAF word sync state — span-based
  wordSpans: HTMLSpanElement[];
  originalNodes: { parent: Node; nodes: Node[] }[] | null; // for unwrapping
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
// Wider window + more gradient levels = liquid flow effect
const WINDOW_BEFORE = 3; // 3 words trailing (slow fade-out = liquid trail)
const WINDOW_AFTER = 3; // 3 words ahead (fast fade-in = approaching wave)

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
      wordSpans: [],
      originalNodes: null,
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
    log.debug(
      `Proso: highlightParagraph called - index: ${index}, paragraphs available: ${extractedParagraphs?.length || 0}`,
    );

    this.clearParagraphHighlights();
    this.clearWordHighlightVisual(); // FR-003: Clear visual only, keep timeline data

    // FR-001: Validate timestamp and measure latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      if (latency > PARAGRAPH_LATENCY_THRESHOLD_MS) {
        log.warn(`Proso: Highlight latency ${latency}ms exceeds 200ms sync threshold (FR-001)`);
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
      log.debug(`Proso: Highlighting element at index ${index}`, {
        tagName: element.tagName,
        textContent: element.textContent?.substring(0, 50),
      });
      element.classList.add('proso-highlight');
      (element as HTMLElement).dataset.prosoIndex = String(index);
      this.state.highlightElements.push(element);
      this.state.currentHighlightedElement = element;

      // Auto-scroll to highlighted element
      this.scrollToHighlight(element);
    } else {
      log.warn(
        `Proso: No element found for highlight at index ${index}, text lookup: ${text ? 'yes' : 'no'}`,
      );
      this.state.currentHighlightedElement = null;
    }
  }

  /**
   * Set word timeline for the current paragraph.
   * Wraps each word in a <span> for animatable CSS styling (border-radius, transition).
   */
  setWordTimeline(wordTimeline: WordTiming[], paragraphIndex: number): void {
    // Clean up previous span wrapping
    this.unwrapWordSpans();

    this.state.currentWordTimeline = wordTimeline;
    this.state.currentParagraphForWords = paragraphIndex;
    this.state.currentActiveWordIndex = -1;
    this.state.wordSpans = [];

    const element = this.state.currentHighlightedElement;
    if (element && wordTimeline.length > 0) {
      this.wrapWordsInSpans(element as HTMLElement);
      log.debug(
        `Proso: Wrapped ${this.state.wordSpans.length}/${wordTimeline.length} words in spans`,
      );
    }
  }

  /**
   * Wrap words in the highlighted paragraph element with <span class="proso-w"> elements.
   * Walks all text nodes and splits them at word boundaries, matching against the timeline.
   */
  private wrapWordsInSpans(element: HTMLElement): void {
    const timeline = this.state.currentWordTimeline;
    if (!timeline || timeline.length === 0) return;

    // Collect all text nodes in document order
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      textNodes.push(n as Text);
    }
    if (textNodes.length === 0) return;

    // Build flat text from all text nodes
    const flatText = textNodes.map((tn) => tn.textContent || '').join('');

    // Match timeline words against flat text to get char offsets in the flat string
    // (provider charOffset is relative to extracted text which may differ from DOM text)
    const wordPositions: { start: number; end: number; timelineIdx: number }[] = [];
    let searchFrom = 0;
    for (let i = 0; i < timeline.length; i++) {
      const w = timeline[i]!.word.trim();
      if (!w) continue;
      const idx = flatText.indexOf(w, searchFrom);
      if (idx >= 0) {
        wordPositions.push({ start: idx, end: idx + w.length, timelineIdx: i });
        searchFrom = idx + w.length;
      }
    }

    if (wordPositions.length === 0) return;

    // Map flat offsets back to text nodes
    // Build offset map: for each text node, its start offset in the flat string
    const nodeOffsets: number[] = [];
    let cumulative = 0;
    for (const tn of textNodes) {
      nodeOffsets.push(cumulative);
      cumulative += tn.textContent?.length || 0;
    }

    // For each word position, find which text node(s) it falls in and wrap with span
    // Process in reverse order to avoid invalidating offsets
    const spans: HTMLSpanElement[] = new Array(timeline.length);

    for (let wi = wordPositions.length - 1; wi >= 0; wi--) {
      const wp = wordPositions[wi]!;
      // Find the text node containing the start of this word
      let nodeIdx = -1;
      for (let ni = 0; ni < textNodes.length; ni++) {
        const nodeStart = nodeOffsets[ni]!;
        const nodeEnd = nodeStart + (textNodes[ni]!.textContent?.length || 0);
        if (wp.start >= nodeStart && wp.start < nodeEnd) {
          nodeIdx = ni;
          break;
        }
      }
      if (nodeIdx < 0) continue;

      const textNode = textNodes[nodeIdx]!;
      const nodeStart = nodeOffsets[nodeIdx]!;
      const localStart = wp.start - nodeStart;
      const localEnd = Math.min(wp.end - nodeStart, textNode.textContent?.length || 0);

      // Only handle words that fit within a single text node for simplicity
      if (wp.end <= nodeStart + (textNode.textContent?.length || 0)) {
        try {
          // Split text node to isolate the word
          const wordNode = textNode.splitText(localStart);
          const afterWord = wordNode.splitText(localEnd - localStart);

          // Create span wrapper
          const span = document.createElement('span');
          span.className = 'proso-w';
          span.dataset.wi = String(wp.timelineIdx);
          wordNode.parentNode!.replaceChild(span, wordNode);
          span.appendChild(wordNode);

          spans[wp.timelineIdx] = span;

          // Update text nodes array and offsets (splitting changed things)
          // Replace the original text node entry with the parts
          const newNodes: Text[] = [];
          if (textNode.textContent?.length) newNodes.push(textNode);
          // wordNode is now inside span
          if (afterWord.textContent?.length) newNodes.push(afterWord);
          textNodes.splice(nodeIdx, 1, ...newNodes);

          // Rebuild offsets from this point forward
          let off = nodeOffsets[nodeIdx]!;
          for (let j = nodeIdx; j < textNodes.length; j++) {
            nodeOffsets[j] = off;
            off += textNodes[j]!.textContent?.length || 0;
          }
          // Ensure length matches
          while (nodeOffsets.length > textNodes.length) nodeOffsets.pop();
          while (nodeOffsets.length < textNodes.length) nodeOffsets.push(off);
        } catch (e) {
          log.warn('Proso: Span wrapping failed for word', {
            timelineIdx: wp.timelineIdx,
            error: e,
          });
        }
      }
    }

    this.state.wordSpans = spans.filter(Boolean);
    // Store element reference so we can unwrap later
    this.state.originalNodes = [{ parent: element, nodes: [] }];
  }

  /**
   * Remove all word spans and restore original text nodes.
   */
  private unwrapWordSpans(): void {
    if (this.state.wordSpans.length === 0) return;

    for (const span of this.state.wordSpans) {
      if (!span || !span.parentNode) continue;
      // Move children out of span
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }

    // Normalize text nodes (merge adjacent)
    if (this.state.originalNodes) {
      for (const entry of this.state.originalNodes) {
        if (entry.parent && (entry.parent as HTMLElement).normalize) {
          (entry.parent as HTMLElement).normalize();
        }
      }
    }

    this.state.wordSpans = [];
    this.state.originalNodes = null;
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

  /** All CSS classes used on word spans, ordered by intensity. */
  private static readonly WORD_CLASSES = [
    'proso-w--active',
    'proso-w--glow',
    'proso-w--near',
    'proso-w--far',
    'proso-w--mist',
  ] as const;

  /**
   * Sync word highlight at the given interpolated time using binary search.
   * Toggles CSS classes on pre-wrapped <span> elements for a liquid flow effect.
   *
   * 5-level gradient: active → glow (±1) → near (±2) → far (±3) → mist (±4)
   * Asymmetric CSS transitions (fast fade-in, slow fade-out) create the
   * sensation of highlights flowing into each other like liquid.
   */
  private syncWordAtTime(timeMs: number): void {
    const timeline = this.state.currentWordTimeline;
    if (!timeline || timeline.length === 0) return;
    if (this.state.wordSpans.length === 0) return;

    const adjustedTime = timeMs + WORD_LEAD_OFFSET_MS;
    const wordIndex = this.findWordIndexAtTime(timeline, adjustedTime);

    if (wordIndex === this.state.currentActiveWordIndex) return;
    const prevIndex = this.state.currentActiveWordIndex;
    this.state.currentActiveWordIndex = wordIndex;

    // Remove classes from previous window (wider sweep to catch mist edges)
    if (prevIndex >= 0) {
      for (let d = -(WINDOW_BEFORE + 1); d <= WINDOW_AFTER + 1; d++) {
        const span = this.getWordSpan(prevIndex + d);
        if (span) span.classList.remove(...HighlightManager.WORD_CLASSES);
      }
    }

    if (wordIndex < 0) return;

    // Active word — the spoken word
    const activeSpan = this.getWordSpan(wordIndex);
    if (activeSpan) activeSpan.classList.add('proso-w--active');

    // Glow (±1) — brightest halo, merges visually with active
    for (const d of [-1, 1]) {
      const s = this.getWordSpan(wordIndex + d);
      if (s) s.classList.add('proso-w--glow');
    }

    // Near (±2) — medium intensity
    for (const d of [-2, 2]) {
      const s = this.getWordSpan(wordIndex + d);
      if (s) s.classList.add('proso-w--near');
    }

    // Far (±3) — subtle trail/lead
    for (const d of [-3, 3]) {
      const s = this.getWordSpan(wordIndex + d);
      if (s) s.classList.add('proso-w--far');
    }
  }

  /**
   * Get a word span by timeline index, or null if out of bounds.
   */
  private getWordSpan(timelineIndex: number): HTMLSpanElement | null {
    if (timelineIndex < 0) return null;
    // Find span with matching data-wi attribute
    return this.state.wordSpans.find((s) => s.dataset.wi === String(timelineIndex)) ?? null;
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
   * Highlight a specific word (legacy/fallback, called from direct highlightWord messages).
   * Uses span-based approach if available, falls back to CSS Highlight API.
   */
  highlightWord(paragraphIndex: number, wordIndex: number, timestamp?: number): void {
    // FR-002: Validate timestamp and measure latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      if (latency > WORD_LATENCY_THRESHOLD_MS) {
        log.warn(
          `Proso: Word highlight latency ${latency}ms exceeds 100ms sync threshold (FR-002)`,
        );
      }
    }

    if (!this.state.currentWordTimeline || this.state.currentWordTimeline.length === 0) {
      return;
    }

    // FR-004: Validate paragraph index matches current timeline
    if (paragraphIndex !== this.state.currentParagraphForWords) {
      log.warn(
        `Proso: Paragraph mismatch (expected ${this.state.currentParagraphForWords}, got ${paragraphIndex}), ignoring highlightWord`,
      );
      return;
    }

    if (wordIndex < 0 || wordIndex >= this.state.currentWordTimeline.length) {
      return;
    }

    // Use span-based sliding window if spans are available
    if (this.state.wordSpans.length > 0) {
      const entry = this.state.currentWordTimeline[wordIndex];
      if (entry) {
        this.syncWordAtTime((entry.startTimeMs ?? 0) + 1);
      }
      return;
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
          log.warn('Proso: Range creation failed', { error: e });
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

    // Remove CSS classes from all word spans
    for (const span of this.state.wordSpans) {
      if (span) {
        span.classList.remove(...HighlightManager.WORD_CLASSES);
      }
    }
  }

  /**
   * Clear word highlight fully (visual + data + spans)
   */
  clearWordHighlightFull(): void {
    this.stopWordSyncLoop();
    this.clearWordHighlightVisual();
    this.unwrapWordSpans();
    this.state.currentWordTimeline = null;
    this.state.currentParagraphForWords = -1;
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

  // Three more announcements used to sit here — 'reportDrift',
  // 'TIMELINE_READY' and 'reportScrollState'. None of the three names was ever
  // registered with a handler, so all three resolved to an unknown-message
  // response, and the one class that would have consumed the timeline
  // acknowledgment (PlaybackSyncState) is never constructed anywhere in the
  // extension. Drift is still reported where it is measured, as a warning in
  // this tab's own log.
}

/**
 * Singleton instance for content script usage
 */
export const highlightManager = new HighlightManager();
