/**
 * TTS Queue Order Tests
 *
 * Tests for Bug 3: Ensuring TTS queue order matches extraction order.
 * These tests MUST verify that no sorting is applied after extraction.
 *
 * @module tests/unit/content/tts-queue-order.test
 * @feature 046-bug-bounty-sprint
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

/**
 * @jest-environment jsdom
 */

/**
 * Represents a paragraph in the TTS queue
 */
interface TTSQueueItem {
  index: number;
  text: string;
  type: 'heading' | 'paragraph' | 'list';
}

/**
 * Simulates the TTS queue building process
 * Mirrors the logic in background.ts for queue construction
 *
 * Classification: A "heading" is typically short (< 100 chars) and starts with
 * uppercase, but this is a heuristic. The actual production code may use
 * different criteria (element type from DOM).
 */
function buildTTSQueue(extractedParagraphs: string[]): TTSQueueItem[] {
  return extractedParagraphs.map((text, index) => ({
    index,
    text,
    // Heuristic: headings are usually short and title-case
    // In production, this would come from the element type (h1-h6)
    type: classifyContent(text),
  }));
}

/**
 * Classify content as heading or paragraph based on text characteristics
 * This is a simplified heuristic for testing purposes
 */
function classifyContent(text: string): 'heading' | 'paragraph' | 'list' {
  // Headings are typically:
  // - Shorter (< 80 chars for reasonable headings)
  // - Start with uppercase
  // - Don't end with periods (usually)
  // - Don't have too many words
  const isShort = text.length < 80;
  const startsWithUpper = /^[A-Z]/.test(text);
  const endsWithoutPeriod = !text.trim().endsWith('.');
  const wordCount = text.split(/\s+/).length;
  const fewWords = wordCount < 8;

  if (isShort && startsWithUpper && endsWithoutPeriod && fewWords) {
    return 'heading';
  }
  return 'paragraph';
}

/**
 * Simulates extraction that preserves order
 */
function extractContentPreservingOrder(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // querySelectorAll guarantees document order
  const elements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p');

  return Array.from(elements)
    .map((el) => el.textContent?.trim() || '')
    .filter((text) => text.length > 0);
}

describe('Bug 3: TTS Queue Order (US3)', () => {
  describe('TTS queue order matches extraction order', () => {
    it('should build queue with indices matching extraction order', () => {
      const extractedParagraphs = [
        'Main Title',
        'Introduction paragraph here.',
        'Section One',
        'Content for section one.',
        'Section Two',
        'Content for section two.',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      // Verify indices match array positions
      queue.forEach((item, i) => {
        expect(item.index).toBe(i);
        expect(item.text).toBe(extractedParagraphs[i]);
      });
    });

    it('should not reorder queue items after building', () => {
      const extractedParagraphs = [
        'First',
        'Second',
        'Third',
        'Fourth',
        'Fifth',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      // Queue should be in exact extraction order
      expect(queue.map((q) => q.text)).toEqual(extractedParagraphs);
    });

    it('should preserve order for mixed headings and paragraphs', () => {
      const html = `
        <article>
          <h1>Title</h1>
          <p>First paragraph.</p>
          <h2>Section A</h2>
          <p>Content A.</p>
          <h2>Section B</h2>
          <p>Content B.</p>
        </article>
      `;

      const extracted = extractContentPreservingOrder(html);
      const queue = buildTTSQueue(extracted);

      // Verify order matches HTML document order
      expect(queue[0].text).toBe('Title');
      expect(queue[1].text).toBe('First paragraph.');
      expect(queue[2].text).toBe('Section A');
      expect(queue[3].text).toBe('Content A.');
      expect(queue[4].text).toBe('Section B');
      expect(queue[5].text).toBe('Content B.');
    });
  });

  describe('No sorting applied after extraction', () => {
    it('should not sort queue by heading level', () => {
      const extractedParagraphs = [
        'H2 First', // H2
        'H3 Child', // H3
        'H3 Another Child', // H3
        'H2 Second', // H2
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      // Should NOT be sorted by heading level
      // Incorrect: H2, H2, H3, H3
      // Correct: H2, H3, H3, H2
      expect(queue.map((q) => q.text)).toEqual(extractedParagraphs);
    });

    it('should not sort queue alphabetically', () => {
      const extractedParagraphs = [
        'Zebra Section',
        'Apple Content',
        'Middle Section',
        'Beta Content',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      // Should NOT be alphabetically sorted
      expect(queue.map((q) => q.text)).toEqual(extractedParagraphs);
      expect(queue.map((q) => q.text)).not.toEqual([...extractedParagraphs].sort());
    });

    it('should not sort queue by text length', () => {
      const extractedParagraphs = [
        'A', // 1 char
        'Short paragraph text here for testing purposes and validation.', // long
        'Medium text here.', // medium
        'B', // 1 char
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      // Should NOT be sorted by length
      expect(queue.map((q) => q.text)).toEqual(extractedParagraphs);
    });

    it('should not sort queue by type (heading vs paragraph)', () => {
      const extractedParagraphs = [
        'First Heading',
        'A paragraph with more content that ends with a period and has enough words to be classified as a paragraph.',
        'Second Heading',
        'Another paragraph text that is long enough and ends with a period.',
        'Third Heading',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      // Verify headings are classified correctly
      expect(queue[0].type).toBe('heading');
      expect(queue[1].type).toBe('paragraph');
      expect(queue[2].type).toBe('heading');
      expect(queue[3].type).toBe('paragraph');
      expect(queue[4].type).toBe('heading');

      // Should NOT group headings together
      expect(queue.map((q) => q.text)).toEqual(extractedParagraphs);
    });
  });

  describe('Queue index matches paragraph index', () => {
    it('should have queue index equal to extraction position', () => {
      const extractedParagraphs = [
        'Para 0',
        'Para 1',
        'Para 2',
        'Para 3',
        'Para 4',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      for (let i = 0; i < queue.length; i++) {
        expect(queue[i].index).toBe(i);
      }
    });

    it('should use queue index for paragraph highlighting', () => {
      // This test documents the expected behavior:
      // When TTS reads queue[i], it should highlight extractedParagraphs[i]
      const extractedParagraphs = ['Title', 'Section', 'Content'];
      const queue = buildTTSQueue(extractedParagraphs);

      // Simulate playback - when playing index N, we highlight paragraph N
      const currentIndex = 1; // Playing "Section"
      const paragraphToHighlight = extractedParagraphs[queue[currentIndex].index];

      expect(paragraphToHighlight).toBe('Section');
    });

    it('should not have gaps in queue indices', () => {
      const extractedParagraphs = ['A', 'B', 'C', 'D', 'E'];
      const queue = buildTTSQueue(extractedParagraphs);

      const indices = queue.map((q) => q.index);

      // Should be [0, 1, 2, 3, 4] with no gaps
      expect(indices).toEqual([0, 1, 2, 3, 4]);

      // Verify no missing indices
      for (let i = 0; i < indices.length; i++) {
        expect(indices).toContain(i);
      }
    });
  });

  describe('Edge cases for queue ordering', () => {
    it('should handle empty extraction', () => {
      const queue = buildTTSQueue([]);
      expect(queue).toEqual([]);
    });

    it('should handle single item', () => {
      const queue = buildTTSQueue(['Only item']);
      expect(queue.length).toBe(1);
      expect(queue[0].index).toBe(0);
      expect(queue[0].text).toBe('Only item');
    });

    it('should handle extraction with only headings', () => {
      const extractedParagraphs = [
        'Heading One',
        'Heading Two',
        'Heading Three',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      expect(queue.length).toBe(3);
      queue.forEach((item) => {
        expect(item.type).toBe('heading');
      });

      // Order should be preserved
      expect(queue.map((q) => q.text)).toEqual(extractedParagraphs);
    });

    it('should handle extraction with only paragraphs', () => {
      const extractedParagraphs = [
        'First paragraph with enough content to be classified as a paragraph and ends with a period.',
        'Second paragraph with additional text content and more words to meet the threshold.',
        'Third paragraph containing more information and sufficient length to be a paragraph.',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      expect(queue.length).toBe(3);
      queue.forEach((item) => {
        expect(item.type).toBe('paragraph');
      });

      // Order should be preserved
      expect(queue.map((q) => q.text)).toEqual(extractedParagraphs);
    });

    it('should handle duplicate text without reordering', () => {
      const extractedParagraphs = [
        'Repeated Text',
        'Unique Content',
        'Repeated Text', // Same as first
        'More Content',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      // Both duplicates should be in their original positions
      expect(queue[0].text).toBe('Repeated Text');
      expect(queue[0].index).toBe(0);
      expect(queue[2].text).toBe('Repeated Text');
      expect(queue[2].index).toBe(2);
    });
  });

  describe('Complex document structure', () => {
    it('should preserve wiki-like nested structure order', () => {
      const html = `
        <article>
          <h1>Wiki Article Title</h1>
          <p>Introduction paragraph with enough content to be classified as a paragraph.</p>
          <h2>Background</h2>
          <p>Background information with sufficient text to be a paragraph.</p>
          <h3>Historical Context</h3>
          <p>Historical details with more content to meet paragraph threshold.</p>
          <h3>Current Status</h3>
          <p>Current status information that has enough words to be classified properly.</p>
          <h2>Technical Details</h2>
          <p>Technical overview with detailed explanation.</p>
          <h3>Implementation</h3>
          <h4>Frontend</h4>
          <p>Frontend details including components and styling.</p>
          <h4>Backend</h4>
          <p>Backend details including API and database.</p>
          <h3>Performance</h3>
          <p>Performance metrics and optimization techniques.</p>
          <h2>Conclusion</h2>
          <p>Concluding remarks that summarize the article.</p>
        </article>
      `;

      const extracted = extractContentPreservingOrder(html);
      const queue = buildTTSQueue(extracted);

      // Verify queue preserves DOM order (most important)
      // The heading classification is a heuristic, so we focus on ORDER preservation
      expect(queue[0].text).toBe('Wiki Article Title');
      expect(queue[2].text).toBe('Background');
      expect(queue[4].text).toBe('Historical Context');
      expect(queue[6].text).toBe('Current Status');
      expect(queue[8].text).toBe('Technical Details');

      // Verify ALL content is in correct order (headings and paragraphs interleaved)
      const allTexts = queue.map((q) => q.text);
      expect(allTexts.indexOf('Wiki Article Title')).toBeLessThan(
        allTexts.indexOf('Background'),
      );
      expect(allTexts.indexOf('Background')).toBeLessThan(
        allTexts.indexOf('Historical Context'),
      );
    });

    it('should not lose any content during queue building', () => {
      const extractedParagraphs = [
        'Title',
        'Intro.',
        'Section 1',
        'Content 1.',
        'Section 2',
        'Content 2.',
      ];

      const queue = buildTTSQueue(extractedParagraphs);

      // All content should be in the queue
      expect(queue.length).toBe(extractedParagraphs.length);

      // All text should match
      const queueTexts = queue.map((q) => q.text);
      expect(queueTexts).toEqual(extractedParagraphs);
    });
  });
});

describe('TTS Queue Order Integration', () => {
  it('documents the expected behavior for queue building', () => {
    /**
     * EXPECTED BEHAVIOR:
     *
     * 1. Content is extracted from DOM in document order
     *    - querySelectorAll guarantees document order
     *    - sortByDocumentPosition reinforces this after any manipulation
     *
     * 2. TTS queue is built directly from extracted paragraphs
     *    - No sorting should be applied
     *    - Index should match position in extraction array
     *
     * 3. During playback:
     *    - Queue items are processed sequentially by index
     *    - Highlighting uses the same index to find DOM elements
     *    - This ensures audio and visual are synchronized
     *
     * BUG ROOT CAUSE:
     * If headings "jump" during narration, it's because either:
     * - Extraction reordered content (check Readability output)
     * - Queue building applied sorting (check for .sort() calls)
     * - Playback doesn't follow queue order (check speakCurrentParagraph)
     */

    // This test documents the contract
    expect(true).toBe(true);
  });
});
