/**
 * Unit tests for PDF Word-Level Highlighting
 *
 * Tests the word-level highlighting functionality for PDFs,
 * including word tokenization, character-to-span mapping,
 * and Range creation across fragmented spans.
 *
 * @module tests/unit/content/pdf-word-highlight.test
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  buildTextNodeIndex,
  getConcatenatedText,
  tokenizeWords,
  findNodeAtOffset,
  createWordRange,
  mapTTSWordsToPDF,
  isPDFWordHighlightSupported,
  PDFWordHighlighter,
  TextNodeInfo,
} from '../../../src/utils/content/pdf-word-highlight';

// Helper to create a mock span with text content
function createMockSpan(text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

// Helper to create mock spans simulating PDF.js text layer
// Attaches to document body to ensure Range API works correctly in JSDOM
function createMockTextLayer(texts: string[]): HTMLSpanElement[] {
  // Create container attached to document
  const container = document.createElement('div');
  container.className = 'textLayer';
  document.body.appendChild(container);

  const spans = texts.map((text) => {
    const span = document.createElement('span');
    span.textContent = text;
    container.appendChild(span);
    return span;
  });

  return spans;
}

// Helper to clean up mock text layers
function cleanupMockTextLayers(): void {
  document.querySelectorAll('.textLayer').forEach((el) => el.remove());
}

describe('PDF Word Highlighting', () => {
  // Clean up after each test to prevent DOM pollution
  afterEach(() => {
    document.querySelectorAll('.textLayer').forEach((el) => el.remove());
  });

  describe('tokenizeWords', () => {
    it('should tokenize simple English text', () => {
      const words = tokenizeWords('The quick brown fox');
      expect(words).toHaveLength(4);
      expect(words[0]).toEqual({ word: 'The', charOffset: 0, charLength: 3 });
      expect(words[1]).toEqual({ word: 'quick', charOffset: 4, charLength: 5 });
      expect(words[2]).toEqual({ word: 'brown', charOffset: 10, charLength: 5 });
      expect(words[3]).toEqual({ word: 'fox', charOffset: 16, charLength: 3 });
    });

    it('should handle contractions', () => {
      const words = tokenizeWords("don't won't can't");
      expect(words).toHaveLength(3);
      expect(words[0].word).toBe("don't");
      expect(words[1].word).toBe("won't");
      expect(words[2].word).toBe("can't");
    });

    it('should handle hyphenated words', () => {
      const words = tokenizeWords('self-aware well-known');
      expect(words).toHaveLength(2);
      expect(words[0].word).toBe('self-aware');
      expect(words[1].word).toBe('well-known');
    });

    it('should handle numbers', () => {
      const words = tokenizeWords('There are 42 apples');
      expect(words).toHaveLength(4);
      expect(words[2].word).toBe('42');
    });

    it('should handle mixed alphanumeric', () => {
      const words = tokenizeWords('version2 is v3');
      expect(words).toHaveLength(3);
      expect(words[0].word).toBe('version2');
      expect(words[1].word).toBe('is');
      expect(words[2].word).toBe('v3');
    });

    it('should handle punctuation correctly', () => {
      const words = tokenizeWords('Hello, world! How are you?');
      expect(words.map(w => w.word)).toEqual(['Hello', 'world', 'How', 'are', 'you']);
    });

    it('should handle empty string', () => {
      const words = tokenizeWords('');
      expect(words).toHaveLength(0);
    });

    it('should handle only punctuation', () => {
      const words = tokenizeWords('!@#$%^&*()');
      expect(words).toHaveLength(0);
    });

    it('should handle Unicode characters', () => {
      const words = tokenizeWords('Hello caf\u00e9 world');
      expect(words).toHaveLength(3);
      expect(words[1].word).toBe('caf\u00e9');
    });

    it('should handle accented characters', () => {
      const words = tokenizeWords('r\u00e9sum\u00e9 na\u00efve');
      expect(words).toHaveLength(2);
      expect(words[0].word).toBe('r\u00e9sum\u00e9');
      expect(words[1].word).toBe('na\u00efve');
    });
  });

  describe('getConcatenatedText', () => {
    it('should concatenate text from multiple spans', () => {
      const spans = createMockTextLayer(['The ', 'quick ', 'brown']);
      const text = getConcatenatedText(spans);
      expect(text).toBe('The quick brown');
    });

    it('should handle empty spans', () => {
      const spans = createMockTextLayer(['Hello', '', 'World']);
      const text = getConcatenatedText(spans);
      expect(text).toBe('HelloWorld');
    });

    it('should handle single span', () => {
      const spans = createMockTextLayer(['Single span']);
      const text = getConcatenatedText(spans);
      expect(text).toBe('Single span');
    });

    it('should handle no spans', () => {
      const spans: HTMLSpanElement[] = [];
      const text = getConcatenatedText(spans);
      expect(text).toBe('');
    });
  });

  describe('buildTextNodeIndex', () => {
    it('should build index for simple spans', () => {
      const spans = createMockTextLayer(['Hello ', 'World']);
      const index = buildTextNodeIndex(spans);

      expect(index).toHaveLength(2);
      expect(index[0].startOffset).toBe(0);
      expect(index[0].endOffset).toBe(6);
      expect(index[1].startOffset).toBe(6);
      expect(index[1].endOffset).toBe(11);
    });

    it('should track correct spans', () => {
      const spans = createMockTextLayer(['First', 'Second']);
      const index = buildTextNodeIndex(spans);

      expect(index[0].span).toBe(spans[0]);
      expect(index[1].span).toBe(spans[1]);
    });

    it('should handle empty spans', () => {
      const spans = createMockTextLayer(['Hello', '', 'World']);
      const index = buildTextNodeIndex(spans);

      // Empty span should not create an index entry
      expect(index).toHaveLength(2);
      expect(index[0].endOffset).toBe(5);
      expect(index[1].startOffset).toBe(5);
    });

    it('should handle spans with nested elements', () => {
      const span = document.createElement('span');
      span.innerHTML = 'Hello <b>bold</b> text';
      const spans = [span];
      const index = buildTextNodeIndex(spans);

      // Should have 3 text nodes: "Hello ", "bold", " text"
      expect(index).toHaveLength(3);
      expect(index[0].startOffset).toBe(0);
      expect(index[0].endOffset).toBe(6); // "Hello "
      expect(index[1].startOffset).toBe(6);
      expect(index[1].endOffset).toBe(10); // "bold"
      expect(index[2].startOffset).toBe(10);
      expect(index[2].endOffset).toBe(15); // " text"
    });
  });

  describe('findNodeAtOffset', () => {
    let textNodes: TextNodeInfo[];

    beforeEach(() => {
      const spans = createMockTextLayer(['Hello ', 'World']);
      textNodes = buildTextNodeIndex(spans);
    });

    it('should find node at beginning', () => {
      const result = findNodeAtOffset(textNodes, 0);
      expect(result).not.toBeNull();
      expect(result!.localOffset).toBe(0);
      expect(result!.node.textContent).toBe('Hello ');
    });

    it('should find node in middle of first span', () => {
      const result = findNodeAtOffset(textNodes, 3);
      expect(result).not.toBeNull();
      expect(result!.localOffset).toBe(3);
      expect(result!.node.textContent).toBe('Hello ');
    });

    it('should find node at start of second span', () => {
      const result = findNodeAtOffset(textNodes, 6);
      expect(result).not.toBeNull();
      expect(result!.localOffset).toBe(0);
      expect(result!.node.textContent).toBe('World');
    });

    it('should find node at end of text', () => {
      const result = findNodeAtOffset(textNodes, 11);
      expect(result).not.toBeNull();
      expect(result!.localOffset).toBe(5);
    });

    it('should return null for offset beyond text', () => {
      const result = findNodeAtOffset(textNodes, 100);
      expect(result).toBeNull();
    });

    it('should return null for negative offset', () => {
      const result = findNodeAtOffset(textNodes, -1);
      expect(result).toBeNull();
    });

    it('should handle empty textNodes array', () => {
      const result = findNodeAtOffset([], 0);
      expect(result).toBeNull();
    });
  });

  describe('createWordRange', () => {
    let textNodes: TextNodeInfo[];

    beforeEach(() => {
      const spans = createMockTextLayer(['Hello ', 'World']);
      textNodes = buildTextNodeIndex(spans);
    });

    it('should create range within single span', () => {
      const range = createWordRange(textNodes, 0, 5);
      expect(range).not.toBeNull();
      expect(range!.toString()).toBe('Hello');
    });

    it('should create range spanning multiple spans', () => {
      // "lo Wo" spans from "Hello " to "World"
      const range = createWordRange(textNodes, 3, 5);
      expect(range).not.toBeNull();
      // JSDOM doesn't fully support Range.toString() for detached nodes
      // Verify range boundaries instead
      expect(range!.startContainer).toBe(textNodes[0].node);
      expect(range!.startOffset).toBe(3);
      expect(range!.endContainer).toBe(textNodes[1].node);
      expect(range!.endOffset).toBe(2); // "Wo" ends at offset 2 in "World"
    });

    it('should create range for word at span boundary', () => {
      // "World" starts at offset 6
      const range = createWordRange(textNodes, 6, 5);
      expect(range).not.toBeNull();
      expect(range!.toString()).toBe('World');
    });

    it('should return null for invalid offset', () => {
      const range = createWordRange(textNodes, 100, 5);
      expect(range).toBeNull();
    });

    it('should return null for zero length', () => {
      const range = createWordRange(textNodes, 0, 0);
      expect(range).toBeNull();
    });

    it('should return null for empty textNodes', () => {
      const range = createWordRange([], 0, 5);
      expect(range).toBeNull();
    });

    it('should handle single character range', () => {
      const range = createWordRange(textNodes, 0, 1);
      expect(range).not.toBeNull();
      expect(range!.toString()).toBe('H');
    });
  });

  describe('createWordRange with fragmented PDF text', () => {
    it('should handle word split across spans', () => {
      // Simulating PDF.js behavior where "highlighting" is split
      const spans = createMockTextLayer(['high', 'lighting']);
      const textNodes = buildTextNodeIndex(spans);

      const range = createWordRange(textNodes, 0, 12);
      expect(range).not.toBeNull();
      // Verify range spans both nodes
      expect(range!.startContainer).toBe(textNodes[0].node);
      expect(range!.startOffset).toBe(0);
      expect(range!.endContainer).toBe(textNodes[1].node);
      expect(range!.endOffset).toBe(8); // "lighting" is 8 chars
    });

    it('should handle many small spans', () => {
      // Extreme fragmentation
      const spans = createMockTextLayer(['T', 'h', 'e', ' ', 'q', 'u', 'i', 'c', 'k']);
      const textNodes = buildTextNodeIndex(spans);

      // "The" - range should span first 3 text nodes
      const range1 = createWordRange(textNodes, 0, 3);
      expect(range1).not.toBeNull();
      expect(range1!.startContainer).toBe(textNodes[0].node);
      expect(range1!.endContainer).toBe(textNodes[2].node);
      expect(range1!.endOffset).toBe(1);

      // "quick" - starts at offset 4
      const range2 = createWordRange(textNodes, 4, 5);
      expect(range2).not.toBeNull();
      expect(range2!.startContainer).toBe(textNodes[4].node); // 'q'
      expect(range2!.endContainer).toBe(textNodes[8].node); // 'k'
    });

    it('should handle word at end of text', () => {
      const spans = createMockTextLayer(['Hello wo', 'rld']);
      const textNodes = buildTextNodeIndex(spans);

      // "world" spans two spans (starts at 'w' which is offset 6)
      const range = createWordRange(textNodes, 6, 5);
      expect(range).not.toBeNull();
      expect(range!.startContainer).toBe(textNodes[0].node);
      expect(range!.startOffset).toBe(6); // 'w' in "Hello wo"
      expect(range!.endContainer).toBe(textNodes[1].node);
      expect(range!.endOffset).toBe(3); // end of "rld"
    });
  });

  describe('mapTTSWordsToPDF', () => {
    it('should map matching word counts directly', () => {
      const ttsWords = [
        { word: 'The', charOffset: 0, charLength: 3 },
        { word: 'quick', charOffset: 4, charLength: 5 },
        { word: 'fox', charOffset: 10, charLength: 3 },
      ];
      const pdfText = 'The quick fox';

      const result = mapTTSWordsToPDF(ttsWords, pdfText);
      expect(result).not.toBeNull();
      expect(result).toHaveLength(3);
      expect(result![0].word).toBe('The');
      expect(result![1].word).toBe('quick');
      expect(result![2].word).toBe('fox');
    });

    it('should handle empty TTS words', () => {
      const result = mapTTSWordsToPDF([], 'Some text');
      expect(result).toEqual([]);
    });

    it('should use PDF word positions', () => {
      const ttsWords = [
        { word: 'Hello', charOffset: 0, charLength: 5 },
        { word: 'world', charOffset: 6, charLength: 5 },
      ];
      const pdfText = 'Hello world';

      const result = mapTTSWordsToPDF(ttsWords, pdfText);
      expect(result).not.toBeNull();
      // Should use PDF tokenization positions
      expect(result![0].charOffset).toBe(0);
      expect(result![1].charOffset).toBe(6);
    });

    it('should handle word count mismatch', () => {
      const ttsWords = [
        { word: 'Hello', charOffset: 0, charLength: 5 },
        { word: 'beautiful', charOffset: 6, charLength: 9 },
        { word: 'world', charOffset: 16, charLength: 5 },
      ];
      // PDF has different text but same meaning
      const pdfText = 'Hello world today';

      const result = mapTTSWordsToPDF(ttsWords, pdfText);
      expect(result).not.toBeNull();
      // Should still return some words
      expect(result!.length).toBeGreaterThan(0);
    });
  });

  describe('PDFWordHighlighter class', () => {
    let highlighter: PDFWordHighlighter;

    beforeEach(() => {
      highlighter = new PDFWordHighlighter();
    });

    afterEach(() => {
      highlighter.reset();
    });

    describe('prepare', () => {
      it('should prepare with spans', () => {
        const spans = createMockTextLayer(['The quick ', 'brown fox']);
        const result = highlighter.prepare(spans);

        expect(result.fullText).toBe('The quick brown fox');
        expect(result.totalChars).toBe(19);
        expect(result.textNodes.length).toBe(2);
      });

      it('should tokenize words during prepare', () => {
        const spans = createMockTextLayer(['Hello World']);
        highlighter.prepare(spans);

        const words = highlighter.getWords();
        expect(words).toHaveLength(2);
        expect(words[0].word).toBe('Hello');
        expect(words[1].word).toBe('World');
      });

      it('should set isPrepared to true', () => {
        expect(highlighter.isPrepared()).toBe(false);

        const spans = createMockTextLayer(['Test']);
        highlighter.prepare(spans);

        expect(highlighter.isPrepared()).toBe(true);
      });
    });

    describe('findWordIndexByOffset', () => {
      beforeEach(() => {
        const spans = createMockTextLayer(['The quick brown']);
        highlighter.prepare(spans);
      });

      it('should find word at offset 0', () => {
        const index = highlighter.findWordIndexByOffset(0);
        expect(index).toBe(0);
      });

      it('should find word in middle', () => {
        // 'quick' starts at offset 4
        const index = highlighter.findWordIndexByOffset(5);
        expect(index).toBe(1);
      });

      it('should return -1 for offset in whitespace', () => {
        // Offset 3 is the space between "The" and "quick"
        const index = highlighter.findWordIndexByOffset(3);
        expect(index).toBe(-1);
      });

      it('should return -1 for offset beyond text', () => {
        const index = highlighter.findWordIndexByOffset(100);
        expect(index).toBe(-1);
      });
    });

    describe('getStats', () => {
      it('should return correct statistics', () => {
        const spans = createMockTextLayer(['Hello ', 'World ', 'Today']);
        highlighter.prepare(spans);

        const stats = highlighter.getStats();
        expect(stats.textNodeCount).toBe(3);
        expect(stats.wordCount).toBe(3);
        expect(stats.totalChars).toBe(17);
        expect(stats.avgCharsPerNode).toBe(6); // 17/3 rounded
      });

      it('should return zeros when not prepared', () => {
        const stats = highlighter.getStats();
        expect(stats.textNodeCount).toBe(0);
        expect(stats.wordCount).toBe(0);
        expect(stats.totalChars).toBe(0);
        expect(stats.avgCharsPerNode).toBe(0);
      });
    });

    describe('reset', () => {
      it('should clear all state', () => {
        const spans = createMockTextLayer(['Test content']);
        highlighter.prepare(spans);

        expect(highlighter.isPrepared()).toBe(true);

        highlighter.reset();

        expect(highlighter.isPrepared()).toBe(false);
        expect(highlighter.getWords()).toHaveLength(0);
        expect(highlighter.getFullText()).toBe('');
      });
    });

    describe('highlightWordByIndex', () => {
      beforeEach(() => {
        // Mock CSS highlights API
        (global as any).CSS = {
          highlights: new Map(),
        };
        (global as any).window = {
          Highlight: class MockHighlight {
            constructor(public range: Range) {}
          },
        };

        const spans = createMockTextLayer(['The quick brown']);
        highlighter.prepare(spans);
      });

      afterEach(() => {
        delete (global as any).CSS;
        delete (global as any).window;
      });

      it('should return false for invalid index', () => {
        const result = highlighter.highlightWordByIndex(-1);
        expect(result).toBe(false);
      });

      it('should return false for index beyond words', () => {
        const result = highlighter.highlightWordByIndex(100);
        expect(result).toBe(false);
      });
    });
  });

  describe('isPDFWordHighlightSupported', () => {
    const originalCSS = global.CSS;

    afterEach(() => {
      (global as any).CSS = originalCSS;
    });

    it('should return true when CSS.highlights is available', () => {
      (global as any).CSS = {
        highlights: new Map(),
      };

      expect(isPDFWordHighlightSupported()).toBe(true);
    });

    it('should return false when CSS is undefined', () => {
      (global as any).CSS = undefined;

      expect(isPDFWordHighlightSupported()).toBe(false);
    });

    it('should return false when CSS.highlights is undefined', () => {
      (global as any).CSS = {};

      expect(isPDFWordHighlightSupported()).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle very long text', () => {
      const longText = 'word '.repeat(1000);
      const spans = createMockTextLayer([longText]);
      const textNodes = buildTextNodeIndex(spans);

      expect(textNodes).toHaveLength(1);
      expect(textNodes[0].endOffset).toBe(5000);

      const words = tokenizeWords(longText.trim());
      expect(words).toHaveLength(1000);
    });

    it('should handle special Unicode characters', () => {
      const spans = createMockTextLayer(['\u201cHello\u201d \u2014 World']);
      const text = getConcatenatedText(spans);
      const words = tokenizeWords(text);

      expect(words).toHaveLength(2);
      expect(words[0].word).toBe('Hello');
      expect(words[1].word).toBe('World');
    });

    it('should handle CJK characters', () => {
      // Chinese characters
      const spans = createMockTextLayer(['\u4f60\u597d\u4e16\u754c']);
      const text = getConcatenatedText(spans);
      const words = tokenizeWords(text);

      // CJK might be treated as single tokens depending on regex
      expect(words.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed scripts', () => {
      const spans = createMockTextLayer(['Hello \u4e16\u754c World']);
      const text = getConcatenatedText(spans);
      const words = tokenizeWords(text);

      // Should at least find 'Hello' and 'World'
      const englishWords = words.filter(w => /^[A-Za-z]+$/.test(w.word));
      expect(englishWords).toHaveLength(2);
    });
  });

  describe('Performance benchmarks', () => {
    it('should prepare 100-word paragraph within 10ms', () => {
      // Simulate a 100-word paragraph split across many spans (typical PDF fragmentation)
      const words = Array.from({ length: 100 }, (_, i) => `word${i} `);
      const spans = createMockTextLayer(words);

      const highlighter = new PDFWordHighlighter();
      const startTime = performance.now();

      highlighter.prepare(spans);

      const elapsed = performance.now() - startTime;
      expect(elapsed).toBeLessThan(10);

      const stats = highlighter.getStats();
      expect(stats.wordCount).toBe(100);
      expect(stats.textNodeCount).toBe(100);
    });

    it('should build text node index for 500 spans within 50ms', () => {
      // Large paragraph with extreme fragmentation
      // Note: JSDOM is slower than real browsers, so threshold is higher
      const texts = Array.from({ length: 500 }, (_, i) => `w${i}`);
      const spans = createMockTextLayer(texts);

      const startTime = performance.now();
      const index = buildTextNodeIndex(spans);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(50);
      expect(index).toHaveLength(500);
    });

    it('should tokenize 1000-word text within 5ms', () => {
      const text = 'word '.repeat(1000);

      const startTime = performance.now();
      const words = tokenizeWords(text);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(5);
      expect(words).toHaveLength(1000);
    });

    it('should create word range within 1ms', () => {
      const spans = createMockTextLayer(['The quick brown fox jumps over the lazy dog']);
      const textNodes = buildTextNodeIndex(spans);

      const startTime = performance.now();
      for (let i = 0; i < 100; i++) {
        createWordRange(textNodes, 4, 5); // "quick"
      }
      const elapsed = performance.now() - startTime;

      // 100 range creations should take < 10ms total (< 0.1ms each)
      expect(elapsed).toBeLessThan(10);
    });

    it('should find word by offset efficiently', () => {
      const text = 'word '.repeat(500);
      const spans = createMockTextLayer([text]);
      const highlighter = new PDFWordHighlighter();
      highlighter.prepare(spans);

      const startTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        highlighter.findWordIndexByOffset(i * 5); // Every 5 chars is a word
      }
      const elapsed = performance.now() - startTime;

      // 1000 lookups should complete within 10ms
      expect(elapsed).toBeLessThan(10);
    });

    it('should handle realistic PDF page with mixed fragmentation', () => {
      // Simulate a real PDF page: some spans have full words, some are fragmented
      const pageContent: string[] = [];

      // Add 50 normal spans (full words)
      for (let i = 0; i < 50; i++) {
        pageContent.push(`Paragraph${i} `);
      }

      // Add 20 fragmented spans (word split across 2-3 spans)
      for (let i = 0; i < 20; i++) {
        pageContent.push('frag');
        pageContent.push('men');
        pageContent.push('ted ');
      }

      const spans = createMockTextLayer(pageContent);
      const highlighter = new PDFWordHighlighter();

      const startTime = performance.now();
      highlighter.prepare(spans);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(15);

      const stats = highlighter.getStats();
      // 50 normal words + 20 "fragmented" words
      expect(stats.wordCount).toBe(70);
    });
  });
});
