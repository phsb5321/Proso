/**
 * Highlight Manager
 * Manages paragraph and word highlighting for TTS playback.
 * Uses CSS Custom Highlight API for word-level highlighting.
 *
 * @module content/highlight-manager
 */

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
 * @param {number} index - Paragraph index (fallback)
 * @param {string} [text] - Text content to match
 * @param {number} [timestamp] - Timestamp for sync verification
 */
function highlightParagraph(index, text, timestamp) {
  const extractor = getExtractor();
  const extractedParagraphs = extractor.getExtractedParagraphs?.() || [];
  console.log('VoxPage: highlightParagraph called', { index, text: text?.substring(0, 50), extractedParagraphsCount: extractedParagraphs.length });

  clearParagraphHighlights();

  if (timestamp) {
    const latency = Date.now() - timestamp;
    if (latency > 200) {
      console.warn(`VoxPage: Highlight latency ${latency}ms exceeds 200ms sync threshold`);
    }
  }

  let element = null;

  if (text && text.length > 10) {
    element = extractor.findElementByText?.(text);
    if (element) {
      console.log('VoxPage: Found element by text match');
    }
  }

  if (!element && index >= 0 && index < extractedParagraphs.length) {
    element = extractedParagraphs[index];
    console.log('VoxPage: Using index-based fallback');
  }

  if (element && element.nodeType === Node.ELEMENT_NODE) {
    element.classList.add('voxpage-highlight');
    element.dataset.voxpageIndex = index;
    highlightElements.push(element);
    currentHighlightedElement = element;
    console.log('VoxPage: Highlight applied successfully');

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  } else {
    console.warn('VoxPage: Could not find element to highlight', { index, text: text?.substring(0, 30) });
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

  if (!wordHighlightSupported) {
    console.log('VoxPage: CSS Highlight API not supported, falling back to paragraph-only highlighting');
  }
}

/**
 * Highlight a specific word using CSS Custom Highlight API
 * @param {number} paragraphIndex - Paragraph index
 * @param {number} wordIndex - Word index
 * @param {number} [timestamp] - Timestamp for sync verification
 */
function highlightWord(paragraphIndex, wordIndex, timestamp) {
  if (timestamp) {
    const latency = Date.now() - timestamp;
    if (latency > 100) {
      console.warn(`VoxPage: Word highlight latency ${latency}ms exceeds 100ms sync threshold`);
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
  filterValidHighlightElements
};
