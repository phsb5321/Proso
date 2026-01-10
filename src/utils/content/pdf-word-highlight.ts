// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * PDF Word-Level Highlighting
 *
 * Handles word-level highlighting within PDF.js text layers for TTS synchronization.
 * This module solves the key challenge of PDF.js span fragmentation:
 * - PDF.js creates spans per text item, NOT per word
 * - A single word may be split across multiple spans
 * - This module builds a character-to-span mapping and creates Range objects
 *   that can span multiple spans
 *
 * Uses CSS Custom Highlight API for efficient visual highlighting.
 *
 * @module utils/content/pdf-word-highlight
 */

import { normalizeText } from './pdf-highlight';

/**
 * Information about a text node within the span structure
 */
export interface TextNodeInfo {
  /** The text node */
  node: Text;
  /** Parent span element */
  span: HTMLSpanElement;
  /** Starting character offset in the concatenated text */
  startOffset: number;
  /** Ending character offset (exclusive) */
  endOffset: number;
}

/**
 * Word position within the PDF text
 */
export interface WordPosition {
  /** The word text */
  word: string;
  /** Character offset in the concatenated paragraph text */
  charOffset: number;
  /** Character length */
  charLength: number;
}

/**
 * Result of preparing word highlights
 */
export interface WordHighlightPrepareResult {
  /** The concatenated full text from all spans */
  fullText: string;
  /** Array of text node info for character-to-node mapping */
  textNodes: TextNodeInfo[];
  /** Total character count */
  totalChars: number;
  /** Whether CSS Custom Highlight API is supported */
  highlightSupported: boolean;
}

/**
 * CSS Custom Highlight API name for PDF word highlights
 */
const PDF_WORD_HIGHLIGHT_NAME = 'voxpage-pdf-word';

/**
 * Check if CSS Custom Highlight API is supported
 */
export function isPDFWordHighlightSupported(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    typeof (CSS as unknown as { highlights?: unknown }).highlights !== 'undefined'
  );
}

/**
 * Build a text node index from an array of spans
 *
 * This creates a mapping of character offsets to text nodes,
 * enabling us to create Range objects that span multiple spans.
 *
 * @param spans - Array of span elements from the PDF text layer
 * @returns TextNodeInfo array for character-to-node mapping
 */
export function buildTextNodeIndex(spans: HTMLSpanElement[]): TextNodeInfo[] {
  const textNodes: TextNodeInfo[] = [];
  let offset = 0;

  for (const span of spans) {
    // Get all text nodes within this span
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT, null);
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || '';
      const length = text.length;

      if (length > 0) {
        textNodes.push({
          node,
          span,
          startOffset: offset,
          endOffset: offset + length,
        });
        offset += length;
      }
    }
  }

  return textNodes;
}

/**
 * Get the concatenated text from all spans
 *
 * @param spans - Array of span elements
 * @returns Concatenated text content
 */
export function getConcatenatedText(spans: HTMLSpanElement[]): string {
  return spans.map((span) => span.textContent || '').join('');
}

/**
 * Tokenize text into words with their positions
 *
 * Uses a simple word boundary regex that handles most common cases.
 * Words are separated by whitespace and punctuation.
 *
 * @param text - Text to tokenize
 * @returns Array of word positions
 */
export function tokenizeWords(text: string): WordPosition[] {
  const words: WordPosition[] = [];

  // Match sequences of word characters (including accented characters)
  // This regex handles most languages with Latin-based scripts
  const wordRegex = /[\p{L}\p{N}]+(?:[''\-][\p{L}\p{N}]+)*/gu;

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
 * Find the text node and local offset for a global character offset
 *
 * @param textNodes - Text node index from buildTextNodeIndex
 * @param globalOffset - Character offset in the concatenated text
 * @returns Object with node and local offset, or null if not found
 */
export function findNodeAtOffset(
  textNodes: TextNodeInfo[],
  globalOffset: number,
): { node: Text; localOffset: number; info: TextNodeInfo } | null {
  for (const info of textNodes) {
    if (globalOffset >= info.startOffset && globalOffset < info.endOffset) {
      return {
        node: info.node,
        localOffset: globalOffset - info.startOffset,
        info,
      };
    }
  }

  // Check if offset is exactly at the end of the last node
  if (textNodes.length > 0) {
    const lastInfo = textNodes[textNodes.length - 1];
    if (globalOffset === lastInfo.endOffset) {
      return {
        node: lastInfo.node,
        localOffset: lastInfo.endOffset - lastInfo.startOffset,
        info: lastInfo,
      };
    }
  }

  return null;
}

/**
 * Create a Range object for a word that may span multiple text nodes/spans
 *
 * This is the core function that handles PDF.js span fragmentation.
 * It creates a Range that starts in one text node and may end in another.
 *
 * @param textNodes - Text node index from buildTextNodeIndex
 * @param charOffset - Starting character offset in concatenated text
 * @param charLength - Number of characters to include
 * @returns Range object or null if creation failed
 */
export function createWordRange(
  textNodes: TextNodeInfo[],
  charOffset: number,
  charLength: number,
): Range | null {
  if (textNodes.length === 0 || charLength <= 0) {
    return null;
  }

  const startResult = findNodeAtOffset(textNodes, charOffset);
  if (!startResult) {
    return null;
  }

  const endOffset = charOffset + charLength;
  const endResult = findNodeAtOffset(textNodes, endOffset - 1); // -1 because endOffset is exclusive
  if (!endResult) {
    return null;
  }

  try {
    const range = document.createRange();

    // Set start position
    range.setStart(startResult.node, startResult.localOffset);

    // Set end position
    // If start and end are in the same node, calculate end offset directly
    if (startResult.node === endResult.node) {
      const localEndOffset = startResult.localOffset + charLength;
      const nodeLength = startResult.node.textContent?.length || 0;
      range.setEnd(startResult.node, Math.min(localEndOffset, nodeLength));
    } else {
      // End is in a different node
      // Calculate the local end offset within the end node
      const localEndOffset = endOffset - endResult.info.startOffset;
      const nodeLength = endResult.node.textContent?.length || 0;
      range.setEnd(endResult.node, Math.min(localEndOffset, nodeLength));
    }

    return range;
  } catch (e) {
    console.warn('[VoxPage:PDFWord] Failed to create range:', e);
    return null;
  }
}

/**
 * PDFWordHighlighter class for managing word-level highlighting in PDFs
 *
 * Usage:
 * 1. Call prepare() with the paragraph spans after paragraph highlighting
 * 2. Call highlightWord() during TTS playback with character offsets
 * 3. Call clearHighlight() when moving to next paragraph or stopping
 */
export class PDFWordHighlighter {
  private textNodes: TextNodeInfo[] = [];
  private fullText = '';
  private words: WordPosition[] = [];
  private highlightSupported: boolean;

  constructor() {
    this.highlightSupported = isPDFWordHighlightSupported();
  }

  /**
   * Check if word highlighting is supported
   */
  isSupported(): boolean {
    return this.highlightSupported;
  }

  /**
   * Prepare for word highlighting by building the text node index
   *
   * Call this after paragraph highlighting succeeds, before TTS playback.
   *
   * @param spans - Array of highlighted span elements
   * @returns Preparation result with text info
   */
  prepare(spans: HTMLSpanElement[]): WordHighlightPrepareResult {
    this.textNodes = buildTextNodeIndex(spans);
    this.fullText = getConcatenatedText(spans);
    this.words = tokenizeWords(this.fullText);

    return {
      fullText: this.fullText,
      textNodes: this.textNodes,
      totalChars: this.fullText.length,
      highlightSupported: this.highlightSupported,
    };
  }

  /**
   * Get the tokenized words for the prepared paragraph
   */
  getWords(): WordPosition[] {
    return this.words;
  }

  /**
   * Get the full concatenated text
   */
  getFullText(): string {
    return this.fullText;
  }

  /**
   * Find word index by character offset
   *
   * @param charOffset - Character offset to find
   * @returns Word index or -1 if not found
   */
  findWordIndexByOffset(charOffset: number): number {
    for (let i = 0; i < this.words.length; i++) {
      const word = this.words[i];
      if (charOffset >= word.charOffset && charOffset < word.charOffset + word.charLength) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Highlight a word by character offset and length
   *
   * This is the main method called during TTS playback.
   *
   * @param charOffset - Starting character offset in the paragraph text
   * @param charLength - Number of characters to highlight
   * @returns true if highlight was applied, false otherwise
   */
  highlightWord(charOffset: number, charLength: number): boolean {
    if (!this.highlightSupported) {
      return false;
    }

    if (this.textNodes.length === 0) {
      console.warn('[VoxPage:PDFWord] No text nodes prepared, call prepare() first');
      return false;
    }

    // Clear previous highlight
    this.clearHighlight();

    // Create range for this word
    const range = createWordRange(this.textNodes, charOffset, charLength);
    if (!range) {
      console.warn(
        `[VoxPage:PDFWord] Failed to create range for offset ${charOffset}, length ${charLength}`,
      );
      return false;
    }

    // Apply highlight using CSS Custom Highlight API
    try {
      const highlight = new (
        window as unknown as { Highlight: new (range: Range) => unknown }
      ).Highlight(range);
      const cssHighlights = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
      cssHighlights.set(PDF_WORD_HIGHLIGHT_NAME, highlight);
      return true;
    } catch (e) {
      console.warn('[VoxPage:PDFWord] Failed to apply highlight:', e);
      return false;
    }
  }

  /**
   * Highlight a word by word index
   *
   * Convenience method when you have word index instead of character offset.
   *
   * @param wordIndex - Index of the word in the tokenized words array
   * @returns true if highlight was applied, false otherwise
   */
  highlightWordByIndex(wordIndex: number): boolean {
    if (wordIndex < 0 || wordIndex >= this.words.length) {
      return false;
    }

    const word = this.words[wordIndex];
    return this.highlightWord(word.charOffset, word.charLength);
  }

  /**
   * Clear the current word highlight
   */
  clearHighlight(): void {
    if (!this.highlightSupported) {
      return;
    }

    try {
      const cssHighlights = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
      cssHighlights.delete(PDF_WORD_HIGHLIGHT_NAME);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  /**
   * Reset all state
   *
   * Call this when moving to a new paragraph or stopping playback.
   */
  reset(): void {
    this.clearHighlight();
    this.textNodes = [];
    this.fullText = '';
    this.words = [];
  }

  /**
   * Check if prepared and ready for word highlighting
   */
  isPrepared(): boolean {
    return this.textNodes.length > 0;
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    textNodeCount: number;
    wordCount: number;
    totalChars: number;
    avgCharsPerNode: number;
  } {
    return {
      textNodeCount: this.textNodes.length,
      wordCount: this.words.length,
      totalChars: this.fullText.length,
      avgCharsPerNode:
        this.textNodes.length > 0 ? Math.round(this.fullText.length / this.textNodes.length) : 0,
    };
  }
}

/**
 * Singleton instance for content script usage
 */
export const pdfWordHighlighter = new PDFWordHighlighter();

/**
 * CSS styles for PDF word highlighting
 *
 * These styles are injected into the page when the module is used.
 * The ::highlight pseudo-element is used by CSS Custom Highlight API.
 */
export const PDF_WORD_HIGHLIGHT_STYLES = `
::highlight(${PDF_WORD_HIGHLIGHT_NAME}) {
  background-color: var(--voxpage-word-highlight-color, #90caf9);
  color: inherit;
}

/* Reduced motion preference - no animation */
@media (prefers-reduced-motion: reduce) {
  ::highlight(${PDF_WORD_HIGHLIGHT_NAME}) {
    transition: none;
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  ::highlight(${PDF_WORD_HIGHLIGHT_NAME}) {
    background-color: var(--voxpage-word-highlight-color-dark, #1565c0);
  }
}
`;

/**
 * Inject PDF word highlight styles into the page
 *
 * Call this once when the content script initializes.
 */
export function injectPDFWordHighlightStyles(): void {
  const styleId = 'voxpage-pdf-word-highlight-styles';

  // Don't inject twice
  if (document.getElementById(styleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = PDF_WORD_HIGHLIGHT_STYLES;
  document.head.appendChild(style);
}

/**
 * Match word positions from TTS word timings to PDF text
 *
 * TTS providers give us word timings based on the text they received.
 * We need to map these back to character positions in the PDF text,
 * which may have slightly different whitespace or normalization.
 *
 * @param ttsWords - Words from TTS provider (with charOffset/charLength)
 * @param pdfText - The actual PDF text (from getConcatenatedText)
 * @returns Mapped word positions, or null if mapping failed
 */
export function mapTTSWordsToPDF(
  ttsWords: Array<{ word: string; charOffset: number; charLength: number }>,
  pdfText: string,
): WordPosition[] | null {
  if (ttsWords.length === 0) {
    return [];
  }

  // Tokenize PDF text for comparison
  const pdfWords = tokenizeWords(pdfText);

  // If word counts are close, try direct mapping
  if (Math.abs(ttsWords.length - pdfWords.length) <= ttsWords.length * 0.1) {
    // Within 10% - likely a good match
    // Use PDF word positions but verify with TTS words
    const result: WordPosition[] = [];

    for (let i = 0; i < ttsWords.length && i < pdfWords.length; i++) {
      const ttsWord = normalizeText(ttsWords[i].word);
      const pdfWord = normalizeText(pdfWords[i].word);

      // Check if words match (allowing for minor differences)
      if (ttsWord === pdfWord || ttsWord.includes(pdfWord) || pdfWord.includes(ttsWord)) {
        result.push(pdfWords[i]);
      } else {
        // Words don't match - try to find the TTS word in remaining PDF words
        let found = false;
        for (let j = i; j < Math.min(i + 3, pdfWords.length); j++) {
          if (normalizeText(pdfWords[j].word) === ttsWord) {
            result.push(pdfWords[j]);
            found = true;
            break;
          }
        }
        if (!found) {
          // Fall back to TTS positions (may not highlight correctly)
          result.push({
            word: ttsWords[i].word,
            charOffset: ttsWords[i].charOffset,
            charLength: ttsWords[i].charLength,
          });
        }
      }
    }

    return result;
  }

  // Word counts differ significantly - fall back to fuzzy matching
  // This is more expensive but handles OCR and formatting differences
  console.warn(
    `[VoxPage:PDFWord] Word count mismatch: TTS=${ttsWords.length}, PDF=${pdfWords.length}`,
  );

  // For now, return PDF words if available, otherwise TTS words
  return pdfWords.length > 0 ? pdfWords : ttsWords;
}
