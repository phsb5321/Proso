/**
 * VoxPage Text Segment Module
 * Maps extracted text to DOM elements for highlighting
 */

/**
 * Word boundary data within a text segment
 * @typedef {Object} WordBoundary
 * @property {string} word - The word text
 * @property {number} charOffset - Character offset within the segment
 * @property {number} charLength - Character length
 */

/**
 * TextSegment maps source text to DOM elements for highlighting.
 * Supports both paragraph-level and word-level highlighting.
 */
export class TextSegment {
  /**
   * Create a new TextSegment
   * @param {Object} options
   * @param {string} options.id - Unique identifier
   * @param {string} options.text - The text content
   * @param {Element} options.element - DOM element reference
   * @param {number} options.charStart - Start character offset in full text
   * @param {number} options.charEnd - End character offset in full text
   * @param {string} [options.type='paragraph'] - Segment type
   */
  constructor({ id, text, element, charStart, charEnd, type = 'paragraph' }) {
    /** @type {string} */
    this.id = id;

    /** @type {string} */
    this.text = text;

    /** @type {Element} */
    this.element = element;

    /** @type {{start: number, end: number}} */
    this.charRange = { start: charStart, end: charEnd };

    /** @type {'paragraph'|'heading'|'listItem'} */
    this.type = type;

    /** @type {WordBoundary[]} */
    this.words = this.findWordBoundaries(text);
  }

  /**
   * Parse text into word boundaries with character offsets
   * @param {string} text - The text to parse
   * @returns {WordBoundary[]} Array of word boundaries
   */
  findWordBoundaries(text) {
    const words = [];
    // Match word characters, including unicode letters and numbers
    // Also handles contractions like "don't" and hyphenated words
    const wordRegex = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu;
    let match;

    while ((match = wordRegex.exec(text)) !== null) {
      words.push({
        word: match[0],
        charOffset: match.index,
        charLength: match[0].length
      });
    }

    return words;
  }

  /**
   * Get word at a specific index
   * @param {number} index - Word index
   * @returns {WordBoundary|null}
   */
  getWord(index) {
    if (index >= 0 && index < this.words.length) {
      return this.words[index];
    }
    return null;
  }

  /**
   * Get word count
   * @returns {number}
   */
  get wordCount() {
    return this.words.length;
  }

  /**
   * Find word index at a character offset
   * @param {number} charOffset - Character offset within segment
   * @returns {number} Word index, or -1 if not found
   */
  findWordAtOffset(charOffset) {
    for (let i = 0; i < this.words.length; i++) {
      const word = this.words[i];
      if (charOffset >= word.charOffset &&
          charOffset < word.charOffset + word.charLength) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Create a Range object for a specific word
   * @param {number} wordIndex - Word index
   * @returns {Range|null} DOM Range for the word, or null if invalid
   */
  createWordRange(wordIndex) {
    const word = this.getWord(wordIndex);
    if (!word || !this.element) return null;

    try {
      const range = document.createRange();
      const textNode = this.findTextNode(this.element, word.charOffset, word.charLength);

      if (textNode) {
        range.setStart(textNode.node, textNode.startOffset);
        range.setEnd(textNode.node, textNode.endOffset);
        return range;
      }
    } catch (e) {
      console.warn('VoxPage: Failed to create word range:', e);
    }

    return null;
  }

  /**
   * Find the text node and offsets for a character range
   * @private
   * @param {Element} element - Root element to search
   * @param {number} charOffset - Start character offset
   * @param {number} charLength - Character length
   * @returns {{node: Text, startOffset: number, endOffset: number}|null}
   */
  findTextNode(element, charOffset, charLength) {
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
        // Found the starting node
        const startOffset = charOffset - currentOffset;
        const endOffset = Math.min(startOffset + charLength, nodeLength);

        return {
          node: node,
          startOffset: startOffset,
          endOffset: endOffset
        };
      }

      currentOffset += nodeLength;
    }

    return null;
  }

  /**
   * Check if this segment contains a character offset
   * @param {number} offset - Character offset in full text
   * @returns {boolean}
   */
  containsOffset(offset) {
    return offset >= this.charRange.start && offset < this.charRange.end;
  }

  /**
   * Convert global character offset to local offset within this segment
   * @param {number} globalOffset - Character offset in full text
   * @returns {number} Local offset within segment, or -1 if not in segment
   */
  toLocalOffset(globalOffset) {
    if (!this.containsOffset(globalOffset)) return -1;
    return globalOffset - this.charRange.start;
  }

  /**
   * Convert local offset to global character offset
   * @param {number} localOffset - Character offset within segment
   * @returns {number} Global offset in full text
   */
  toGlobalOffset(localOffset) {
    return this.charRange.start + localOffset;
  }
}

/**
 * TextSegmentMap manages a collection of text segments for a page
 */
export class TextSegmentMap {
  constructor() {
    /** @type {Map<string, TextSegment>} */
    this.segments = new Map();

    /** @type {TextSegment[]} */
    this.orderedSegments = [];
  }

  /**
   * Build segment map from extracted paragraphs
   * @param {Element[]} paragraphElements - Array of paragraph DOM elements
   * @returns {TextSegmentMap} This instance for chaining
   */
  buildFromElements(paragraphElements) {
    this.clear();
    let currentCharOffset = 0;

    for (let i = 0; i < paragraphElements.length; i++) {
      const element = paragraphElements[i];
      const text = element.textContent || '';
      const id = `segment-${i}`;

      const segment = new TextSegment({
        id,
        text,
        element,
        charStart: currentCharOffset,
        charEnd: currentCharOffset + text.length,
        type: this.detectSegmentType(element)
      });

      this.segments.set(id, segment);
      this.orderedSegments.push(segment);

      // Add separator for next segment (paragraph break)
      currentCharOffset += text.length + 2; // +2 for \n\n
    }

    return this;
  }

  /**
   * Detect segment type from element
   * @private
   * @param {Element} element
   * @returns {'paragraph'|'heading'|'listItem'}
   */
  detectSegmentType(element) {
    const tagName = element.tagName.toUpperCase();

    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName)) {
      return 'heading';
    }
    if (tagName === 'LI') {
      return 'listItem';
    }
    return 'paragraph';
  }

  /**
   * Get segment by index
   * @param {number} index
   * @returns {TextSegment|null}
   */
  getByIndex(index) {
    if (index >= 0 && index < this.orderedSegments.length) {
      return this.orderedSegments[index];
    }
    return null;
  }

  /**
   * Get segment by ID
   * @param {string} id
   * @returns {TextSegment|undefined}
   */
  getById(id) {
    return this.segments.get(id);
  }

  /**
   * Find segment containing a global character offset
   * @param {number} globalOffset
   * @returns {TextSegment|null}
   */
  findByOffset(globalOffset) {
    for (const segment of this.orderedSegments) {
      if (segment.containsOffset(globalOffset)) {
        return segment;
      }
    }
    return null;
  }

  /**
   * Get total segment count
   * @returns {number}
   */
  get count() {
    return this.orderedSegments.length;
  }

  /**
   * Clear all segments
   */
  clear() {
    this.segments.clear();
    this.orderedSegments = [];
  }

  /**
   * Iterate over segments
   * @param {Function} callback - Called with (segment, index)
   */
  forEach(callback) {
    this.orderedSegments.forEach(callback);
  }
}

// Export singleton instance for content script
export const textSegmentMap = new TextSegmentMap();
