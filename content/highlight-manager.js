/**
 * Highlight Manager
 * Manages paragraph and word highlighting for TTS playback.
 * Uses CSS Custom Highlight API for word-level highlighting.
 *
 * @module content/highlight-manager
 */

// Wrap in IIFE to avoid variable name collisions with other content scripts
(function() {
  'use strict';

  // Initialize VoxPage namespace
  window.VoxPage = window.VoxPage || {};

  // Get extractor functions from namespace
  const getExtractor = () => window.VoxPage.contentExtractor || {};

  // Highlight state
  let highlightElements = [];
  let currentHighlightedElement = null;

  // Word-level highlighting state
  let currentWordTimeline = null;
  let currentParagraphForWords = -1;
  let wordHighlightSupported = typeof CSS !== 'undefined' && CSS.highlights !== undefined;

  // Auto-scroll state (011-highlight-playback-fix)
  let autoScrollEnabled = true;
  let userScrollTimestamp = 0;
  const SCROLL_DEBOUNCE_MS = 2000; // Pause auto-scroll for 2s after user scroll
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Get the currently highlighted element
   * @returns {Element|null}
   */
  function getCurrentHighlightedElement() {
    return currentHighlightedElement;
  }

  /**
   * Check if word highlighting is supported
   * @returns {boolean}
   */
  function isWordHighlightSupported() {
    return wordHighlightSupported;
  }

  /**
   * Highlight the current paragraph being read
   * Implements FR-001: Paragraph highlight within 200ms
   * @param {number} index - Paragraph index (fallback)
   * @param {string} [text] - Text content to match
   * @param {number} [timestamp] - Timestamp for sync verification
   */
  function highlightParagraph(index, text, timestamp) {
    const syncStart = performance.now();
    const extractor = getExtractor();
    const extractedParagraphs = extractor.getExtractedParagraphs?.() || [];

    console.log(`VoxPage: highlightParagraph called - index: ${index}, paragraphs available: ${extractedParagraphs.length}`);

    clearParagraphHighlights();
    clearWordHighlight(); // 020-code-quality-fix: Clear word highlight on paragraph change

    // FR-001: Validate timestamp and measure latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      if (latency > 200) {
        console.warn(`VoxPage: Highlight latency ${latency}ms exceeds 200ms sync threshold (FR-001)`);
        // Notify background for drift correction tracking
        try {
          browser.runtime.sendMessage({
            action: 'reportDrift',
            latencyMs: latency,
            paragraphIndex: index
          }).catch(() => {});
        } catch (e) { /* ignore */ }
      }
    }

    let element = null;

    if (text && text.length > 10) {
      element = extractor.findElementByText?.(text);
    }

    if (!element && index >= 0 && index < extractedParagraphs.length) {
      element = extractedParagraphs[index];
    }

    if (element && element.nodeType === Node.ELEMENT_NODE) {
      console.log(`VoxPage: Highlighting element at index ${index}:`, element.tagName, element.textContent?.substring(0, 50));
      element.classList.add('voxpage-highlight');
      element.dataset.voxpageIndex = index;
      highlightElements.push(element);
      currentHighlightedElement = element;

      // T023: Call scrollToHighlight instead of direct scrollIntoView
      scrollToHighlight(element);
    } else {
      console.warn(`VoxPage: No element found for highlight at index ${index}, text lookup: ${text ? 'yes' : 'no'}`);
      currentHighlightedElement = null;
    }
  }

  /**
   * Set word timeline for the current paragraph
   * @param {Array} wordTimeline - Array of word timing data
   * @param {number} paragraphIndex - Paragraph index
   */
  function setWordTimeline(wordTimeline, paragraphIndex) {
    currentWordTimeline = wordTimeline;
    currentParagraphForWords = paragraphIndex;
  }

  /**
   * Highlight a specific word using CSS Custom Highlight API
   * Implements FR-002: Word highlight within 100ms
   * @param {number} paragraphIndex - Paragraph index
   * @param {number} wordIndex - Word index
   * @param {number} [timestamp] - Timestamp for sync verification
   */
  function highlightWord(paragraphIndex, wordIndex, timestamp) {
    // FR-002: Validate timestamp and measure latency
    if (timestamp) {
      const latency = Date.now() - timestamp;
      if (latency > 100) {
        console.warn(`VoxPage: Word highlight latency ${latency}ms exceeds 100ms sync threshold (FR-002)`);
        // Log for performance monitoring but don't block
      }
    }

    if (!wordHighlightSupported) {
      return;
    }

    if (!currentWordTimeline || currentWordTimeline.length === 0) {
      return;
    }

    if (wordIndex < 0 || wordIndex >= currentWordTimeline.length) {
      return;
    }

    const wordData = currentWordTimeline[wordIndex];
    const element = currentHighlightedElement;

    if (!element || !wordData) {
      return;
    }

    try {
      const charOffset = wordData.charOffset ?? 0;
      const charLength = wordData.charLength ?? wordData.word?.length ?? 5;

      const range = createWordRange(element, charOffset, charLength);

      if (range) {
        const highlight = new Highlight(range);
        CSS.highlights.set('voxpage-word', highlight);
      }
    } catch (e) {
      console.warn('VoxPage: Failed to create word highlight:', e);
    }
  }

  /**
   * Create a Range object for a word within an element
   * @param {Element} element - Container element
   * @param {number} charOffset - Character offset
   * @param {number} charLength - Character length
   * @returns {Range|null}
   */
  function createWordRange(element, charOffset, charLength) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentOffset = 0;
    let node;

    while ((node = walker.nextNode())) {
      const nodeLength = node.textContent.length;

      if (currentOffset + nodeLength > charOffset) {
        const startOffset = charOffset - currentOffset;
        const endOffset = Math.min(startOffset + charLength, nodeLength);

        try {
          const range = document.createRange();
          range.setStart(node, startOffset);

          if (startOffset + charLength <= nodeLength) {
            range.setEnd(node, endOffset);
          } else {
            let remainingLength = charLength - (nodeLength - startOffset);
            let endNode = node;

            while ((endNode = walker.nextNode()) && remainingLength > 0) {
              const endNodeLength = endNode.textContent.length;
              if (endNodeLength >= remainingLength) {
                range.setEnd(endNode, remainingLength);
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
   * @param {Element} element - Element to scroll to
   */
  function scrollToHighlight(element) {
    if (!element) return;

    // FR-010: Check if auto-scroll is temporarily paused after user scroll
    if (!autoScrollEnabled) {
      const timeSinceUserScroll = Date.now() - userScrollTimestamp;
      if (timeSinceUserScroll < SCROLL_DEBOUNCE_MS) {
        // Still in debounce period, skip auto-scroll
        return;
      }
      // Debounce expired, re-enable auto-scroll
      autoScrollEnabled = true;
    }

    // FR-008: Respect prefers-reduced-motion
    const scrollBehavior = prefersReducedMotion ? 'instant' : 'smooth';

    // FR-006, FR-007: Scroll to center with smooth behavior (or instant if reduced-motion)
    // FR-009: scroll-margin-top in CSS handles fixed headers
    try {
      element.scrollIntoView({
        behavior: scrollBehavior,
        block: 'center'
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
  function onUserScroll() {
    userScrollTimestamp = Date.now();
    autoScrollEnabled = false;

    // Notify background of scroll state (for coordination)
    try {
      browser.runtime.sendMessage({
        action: 'reportScrollState',
        userScrolledAt: userScrollTimestamp
      }).catch(() => {});
    } catch (e) { /* ignore */ }
  }

  /**
   * Enable auto-scroll
   */
  function enableAutoScroll() {
    autoScrollEnabled = true;
  }

  /**
   * Disable auto-scroll
   */
  function disableAutoScroll() {
    autoScrollEnabled = false;
  }

  /**
   * Check if auto-scroll is currently enabled
   * @returns {boolean}
   */
  function isAutoScrollEnabled() {
    if (!autoScrollEnabled) {
      const timeSinceUserScroll = Date.now() - userScrollTimestamp;
      return timeSinceUserScroll >= SCROLL_DEBOUNCE_MS;
    }
    return true;
  }

  /**
   * Clear paragraph highlights only
   */
  function clearParagraphHighlights() {
    highlightElements.forEach(el => {
      el.classList.remove('voxpage-highlight');
    });
    highlightElements = [];

    document.querySelectorAll('.voxpage-highlight').forEach(el => {
      el.classList.remove('voxpage-highlight');
    });
  }

  /**
   * Clear word highlight
   */
  function clearWordHighlight() {
    if (wordHighlightSupported && CSS.highlights) {
      CSS.highlights.delete('voxpage-word');
    }
    currentWordTimeline = null;
    currentParagraphForWords = -1;
  }

  /**
   * Clear all highlights
   */
  function clearHighlights() {
    clearParagraphHighlights();
    clearWordHighlight();
  }

  /**
   * Get highlight elements array
   * @returns {Element[]}
   */
  function getHighlightElements() {
    return highlightElements;
  }

  /**
   * Filter highlight elements to only those still in DOM
   */
  function filterValidHighlightElements() {
    highlightElements = highlightElements.filter(el => document.body.contains(el));
  }

  // Export to VoxPage namespace
  window.VoxPage.highlightManager = {
    highlightParagraph,
    highlightWord,
    setWordTimeline,
    clearHighlights,
    clearParagraphHighlights,
    clearWordHighlight,
    createWordRange,
    getCurrentHighlightedElement,
    isWordHighlightSupported,
    getHighlightElements,
    filterValidHighlightElements,
    // Auto-scroll functions (011-highlight-playback-fix)
    scrollToHighlight,
    onUserScroll,
    enableAutoScroll,
    disableAutoScroll,
    isAutoScrollEnabled
  };

  console.log('VoxPage: highlight-manager.js loaded');
})();
