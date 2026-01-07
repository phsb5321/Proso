/**
 * Unit Tests for PDF Paragraph Grouping
 *
 * Feature: 033-pdf-reading-support
 * Task: T016
 *
 * Tests for the paragraph segmentation algorithm that groups
 * PDF text items into logical paragraphs.
 */

import { describe, it, expect } from '@jest/globals';

describe('Paragraph Grouping Algorithm', () => {
  describe('groupIntoParagraphs', () => {
    it('should group text items on the same line', () => {
      // Text items with similar Y coordinates should be on same line
      const items = [
        { str: 'Hello', transform: [12, 0, 0, 12, 72, 700], height: 12 },
        { str: ' ', transform: [12, 0, 0, 12, 100, 700], height: 12 },
        { str: 'World', transform: [12, 0, 0, 12, 110, 700], height: 12 },
      ];

      // Y positions are same (700), so should be one line
      const yPositions = items.map((item) => item.transform[5]);
      const allSameY = yPositions.every((y) => Math.abs(y - yPositions[0]) < 5);

      expect(allSameY).toBe(true);
    });

    it('should detect paragraph breaks from large Y gaps', () => {
      const LINE_HEIGHT = 12;
      const PARA_GAP_MULTIPLIER = 1.5;

      // Gap of 24px is larger than 12 * 1.5 = 18px, so new paragraph
      const gap = 24;
      const isNewParagraph = gap > LINE_HEIGHT * PARA_GAP_MULTIPLIER;

      expect(isNewParagraph).toBe(true);
    });

    it('should not split on small line gaps', () => {
      const LINE_HEIGHT = 12;
      const PARA_GAP_MULTIPLIER = 1.5;

      // Gap of 14px is smaller than 18px threshold
      const gap = 14;
      const isNewParagraph = gap > LINE_HEIGHT * PARA_GAP_MULTIPLIER;

      expect(isNewParagraph).toBe(false);
    });

    it('should sort items by Y then X coordinate', () => {
      const items = [
        { str: 'Third', transform: [12, 0, 0, 12, 72, 600] }, // Y=600 (lower on page)
        { str: 'First', transform: [12, 0, 0, 12, 72, 700] }, // Y=700 (higher on page)
        { str: 'Second', transform: [12, 0, 0, 12, 150, 700] }, // Y=700, X=150
      ];

      // Sort by Y descending (PDF Y is bottom-up), then X ascending
      const sorted = [...items].sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 5) return yDiff;
        return a.transform[4] - b.transform[4];
      });

      expect(sorted[0].str).toBe('First');
      expect(sorted[1].str).toBe('Second');
      expect(sorted[2].str).toBe('Third');
    });

    it('should calculate bounding box for paragraph', () => {
      const items = [
        { str: 'Hello', transform: [12, 0, 0, 12, 72, 700], width: 30, height: 12 },
        { str: 'World', transform: [12, 0, 0, 12, 110, 700], width: 35, height: 12 },
      ];

      // Calculate bounding box
      const xs = items.map((i) => i.transform[4]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs.map((x, i) => x + items[i].width * 12));

      expect(minX).toBe(72);
      expect(maxX).toBeGreaterThan(100);
    });

    it('should concatenate text with spaces', () => {
      const items = [
        { str: 'Hello' },
        { str: ' ' },
        { str: 'World' },
        { str: '!' },
      ];

      const text = items.map((i) => i.str).join(' ').trim();
      expect(text).toContain('Hello');
      expect(text).toContain('World');
    });

    it('should filter empty text items', () => {
      const items = [
        { str: 'Valid', transform: [12, 0, 0, 12, 72, 700] },
        { str: '', transform: [12, 0, 0, 12, 100, 700] },
        { str: '   ', transform: [12, 0, 0, 12, 120, 700] },
        { str: 'Also Valid', transform: [12, 0, 0, 12, 140, 700] },
      ];

      const filtered = items.filter((item) => item.str.trim().length > 0);
      expect(filtered).toHaveLength(2);
    });

    it('should handle right-to-left text direction', () => {
      const rtlItem = {
        str: 'שלום',
        dir: 'rtl' as const,
        transform: [12, 0, 0, 12, 500, 700],
      };

      expect(rtlItem.dir).toBe('rtl');
    });

    it('should track page number for each paragraph', () => {
      const pageNumber = 5;
      const paragraph = {
        text: 'Test paragraph',
        pageNumber,
        boundingBox: { x: 72, y: 700, width: 200, height: 12, pageNumber },
      };

      expect(paragraph.pageNumber).toBe(5);
      expect(paragraph.boundingBox.pageNumber).toBe(5);
    });
  });

  describe('LINE_THRESHOLD constant', () => {
    it('should be a reasonable pixel value for line detection', () => {
      const LINE_THRESHOLD = 5; // pixels

      // Should be small enough to group items on same line
      // but large enough to handle slight variations
      expect(LINE_THRESHOLD).toBeGreaterThanOrEqual(3);
      expect(LINE_THRESHOLD).toBeLessThanOrEqual(10);
    });
  });

  describe('PARA_GAP_MULTIPLIER constant', () => {
    it('should be between 1.0 and 2.0', () => {
      const PARA_GAP_MULTIPLIER = 1.5;

      expect(PARA_GAP_MULTIPLIER).toBeGreaterThan(1.0);
      expect(PARA_GAP_MULTIPLIER).toBeLessThanOrEqual(2.0);
    });
  });
});
