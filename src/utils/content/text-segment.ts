/**
 * VoxPage Text Segment Module
 * Maps extracted text to DOM elements for highlighting
 * Supports both paragraph-level and word-level highlighting
 *
 * @module utils/content/text-segment
 */

import { z } from 'zod';

/**
 * Word boundary data within a text segment
 */
export const wordBoundarySchema = z.object({
  word: z.string(),
  charOffset: z.number().int().nonnegative(),
  charLength: z.number().int().positive(),
});

export type WordBoundary = z.infer<typeof wordBoundarySchema>;

/**
 * Segment type enum
 */
export const SEGMENT_TYPES = ['paragraph', 'heading', 'listItem'] as const;
export type SegmentType = typeof SEGMENT_TYPES[number];

/**
 * Text segment configuration
 */
export interface TextSegmentConfig {
  id: string;
  text: string;
  element: Element;
  charStart: number;
  charEnd: number;
  type?: SegmentType;
}

/**
 * Text node with offset information
 */
export interface TextNodeWithOffset {
  node: Text;
  startOffset: number;
  endOffset: number;
}

/**
 * TextSegment maps source text to DOM elements for highlighting.
 * Supports both paragraph-level and word-level highlighting.
 */
export class TextSegment {
  readonly id: string;
  readonly text: string;
  readonly element: Element;
  readonly charRange: { start: number; end: number };
  readonly type: SegmentType;
  readonly words: WordBoundary[];

  /**
   * Create a new TextSegment
   * @param config - Segment configuration
   */
  constructor(config: TextSegmentConfig) {
    this.id = config.id;
    this.text = config.text;
    this.element = config.element;
    this.charRange = { start: config.charStart, end: config.charEnd };
    this.type = config.type || 'paragraph';
    this.words = this.findWordBoundaries(config.text);
  }

  /**
   * Parse text into word boundaries with character offsets
   * Matches word characters including unicode letters, numbers, contractions, and hyphenated words
   *
   * @param text - The text to parse
   * @returns Array of word boundaries
   */
  private findWordBoundaries(text: string): WordBoundary[] {
    const words: WordBoundary[] = [];
    // Match word characters, including unicode letters and numbers
    // Also handles contractions like "don't" and hyphenated words
    const wordRegex = /[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu;
    let match: RegExpExecArray | null;

    while ((match = wordRegex.exec(text)) !== null) {
      words.push({
        word: match[0],
        charOffset: match.index,
        charLength: match[0].length,
      });
    }

    return words;
  }

  /**
   * Get word at a specific index
   * @param index - Word index
   * @returns Word boundary or null if invalid index
   */
  getWord(index: number): WordBoundary | null {
    if (index >= 0 && index < this.words.length) {
      return this.words[index];
    }
    return null;
  }

  /**
   * Get word count
   */
  get wordCount(): number {
    return this.words.length;
  }

  /**
   * Find word index at a character offset
   * @param charOffset - Character offset within segment
   * @returns Word index, or -1 if not found
   */
  findWordAtOffset(charOffset: number): number {
    for (let i = 0; i < this.words.length; i++) {
      const word = this.words[i];
      if (charOffset >= word.charOffset && charOffset < word.charOffset + word.charLength) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Create a Range object for a specific word
   * Used for CSS Custom Highlight API integration
   *
   * @param wordIndex - Word index
   * @returns DOM Range for the word, or null if invalid
   */
  createWordRange(wordIndex: number): Range | null {
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
   * Traverses the DOM tree to locate the text node containing the target offset
   *
   * @param element - Root element to search
   * @param charOffset - Start character offset
   * @param charLength - Character length
   * @returns Text node with offsets, or null if not found
   */
  private findTextNode(
    element: Element,
    charOffset: number,
    charLength: number
  ): TextNodeWithOffset | null {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

    let currentOffset = 0;
    let node: Node | null;

    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const nodeLength = textNode.textContent?.length || 0;

      if (currentOffset + nodeLength > charOffset) {
        // Found the starting node
        const startOffset = charOffset - currentOffset;
        const endOffset = Math.min(startOffset + charLength, nodeLength);

        return {
          node: textNode,
          startOffset,
          endOffset,
        };
      }

      currentOffset += nodeLength;
    }

    return null;
  }

  /**
   * Check if this segment contains a character offset
   * @param offset - Character offset in full text
   * @returns True if offset is within this segment
   */
  containsOffset(offset: number): boolean {
    return offset >= this.charRange.start && offset < this.charRange.end;
  }

  /**
   * Convert global character offset to local offset within this segment
   * @param globalOffset - Character offset in full text
   * @returns Local offset within segment, or -1 if not in segment
   */
  toLocalOffset(globalOffset: number): number {
    if (!this.containsOffset(globalOffset)) return -1;
    return globalOffset - this.charRange.start;
  }

  /**
   * Convert local offset to global character offset
   * @param localOffset - Character offset within segment
   * @returns Global offset in full text
   */
  toGlobalOffset(localOffset: number): number {
    return this.charRange.start + localOffset;
  }
}

/**
 * TextSegmentMap manages a collection of text segments for a page
 * Provides efficient lookup by index, ID, or character offset
 */
export class TextSegmentMap {
  private segments: Map<string, TextSegment> = new Map();
  private orderedSegments: TextSegment[] = [];

  /**
   * Build segment map from extracted paragraphs
   * @param paragraphElements - Array of paragraph DOM elements
   * @returns This instance for chaining
   */
  buildFromElements(paragraphElements: Element[]): this {
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
        type: this.detectSegmentType(element),
      });

      this.segments.set(id, segment);
      this.orderedSegments.push(segment);

      // Add separator for next segment (paragraph break)
      currentCharOffset += text.length + 2; // +2 for \n\n
    }

    return this;
  }

  /**
   * Detect segment type from element tag name
   * @param element - Element to analyze
   * @returns Segment type
   */
  private detectSegmentType(element: Element): SegmentType {
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
   * @param index - Segment index
   * @returns Segment or null if invalid index
   */
  getByIndex(index: number): TextSegment | null {
    if (index >= 0 && index < this.orderedSegments.length) {
      return this.orderedSegments[index];
    }
    return null;
  }

  /**
   * Get segment by ID
   * @param id - Segment ID
   * @returns Segment or undefined if not found
   */
  getById(id: string): TextSegment | undefined {
    return this.segments.get(id);
  }

  /**
   * Find segment containing a global character offset
   * @param globalOffset - Character offset in full text
   * @returns Segment or null if not found
   */
  findByOffset(globalOffset: number): TextSegment | null {
    for (const segment of this.orderedSegments) {
      if (segment.containsOffset(globalOffset)) {
        return segment;
      }
    }
    return null;
  }

  /**
   * Get total segment count
   */
  get count(): number {
    return this.orderedSegments.length;
  }

  /**
   * Clear all segments
   */
  clear(): void {
    this.segments.clear();
    this.orderedSegments = [];
  }

  /**
   * Iterate over segments
   * @param callback - Called with (segment, index)
   */
  forEach(callback: (segment: TextSegment, index: number) => void): void {
    this.orderedSegments.forEach(callback);
  }

  /**
   * Get all segments as array
   */
  toArray(): TextSegment[] {
    return [...this.orderedSegments];
  }
}

/**
 * Singleton instance for content script usage
 */
export const textSegmentMap = new TextSegmentMap();
