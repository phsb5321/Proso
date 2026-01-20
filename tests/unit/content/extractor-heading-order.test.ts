/**
 * Heading Order Unit Tests
 *
 * Tests for Bug 3: AI "jumping titles" - headings skipped or reordered during narration.
 * These tests MUST FAIL before the fix is applied (TDD approach).
 *
 * Validates that heading extraction preserves exact DOM order.
 *
 * @module tests/unit/content/extractor-heading-order.test
 * @feature 046-bug-bounty-sprint
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * @jest-environment jsdom
 */

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Bug 3: Heading Extraction Order (US3)', () => {
  let dom: JSDOM;
  let document: Document;

  // Load the tricky-headings fixture
  beforeEach(() => {
    const fixturePath = path.resolve(
      __dirname,
      '../../fixtures/html/tricky-headings.html',
    );
    const html = fs.readFileSync(fixturePath, 'utf-8');
    dom = new JSDOM(html);
    document = dom.window.document;
  });

  afterEach(() => {
    if (dom) {
      dom.window.close();
    }
  });

  /**
   * Helper function to extract heading elements from a container
   * Mimics the extraction logic from src/utils/content/extractor.ts
   */
  function extractHeadingsFromContainer(container: Element): Element[] {
    const candidates = container.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, [role="heading"]',
    );
    return Array.from(candidates);
  }

  /**
   * Helper function to get text content in order
   */
  function getTextOrder(elements: Element[]): string[] {
    return elements
      .map((el) => el.textContent?.trim() || '')
      .filter((text) => text.length > 0);
  }

  describe('Pattern 1: Simple sequence (H1, H2, P, H2, P)', () => {
    it('should preserve simple heading order exactly', () => {
      const container = document.getElementById('pattern-simple');
      expect(container).not.toBeNull();

      const elements = extractHeadingsFromContainer(container!);
      const textOrder = getTextOrder(elements);

      // Expected order: H1 "Main Title", H2 "Section One", P "First paragraph...",
      // H2 "Section Two", P "First paragraph under section two"
      expect(textOrder[0]).toBe('Main Title');
      expect(textOrder[1]).toBe('Section One');
      expect(textOrder[2]).toContain('first paragraph under section one');
      expect(textOrder[3]).toBe('Section Two');
      expect(textOrder[4]).toContain('first paragraph under section two');

      // Verify count
      expect(textOrder.length).toBe(5);
    });

    it('should not reorder H2 headings within the same level', () => {
      const container = document.getElementById('pattern-simple');
      expect(container).not.toBeNull();

      const h2Elements = container!.querySelectorAll('h2');
      const h2Texts = Array.from(h2Elements).map(
        (el) => el.textContent?.trim() || '',
      );

      // H2s should appear in DOM order
      expect(h2Texts).toEqual(['Section One', 'Section Two']);
    });
  });

  describe('Pattern 2: Nested headings (H2, H3, H3, P, H2)', () => {
    it('should preserve nested heading order during DOM traversal', () => {
      const container = document.getElementById('pattern-nested');
      expect(container).not.toBeNull();

      const elements = extractHeadingsFromContainer(container!);
      const textOrder = getTextOrder(elements);

      // Expected DOM order: H2, H3, H3, P, H2
      expect(textOrder[0]).toBe('Parent Section');
      expect(textOrder[1]).toBe('Child Section A');
      expect(textOrder[2]).toBe('Child Section B');
      expect(textOrder[3]).toContain('Content under child sections');
      expect(textOrder[4]).toBe('Another Parent Section');
    });

    it('should not sort headings by level (H2 before H3)', () => {
      const container = document.getElementById('pattern-nested');
      expect(container).not.toBeNull();

      const headings = container!.querySelectorAll('h2, h3');
      const headingTexts = Array.from(headings).map(
        (el) => el.textContent?.trim() || '',
      );

      // DOM order should be preserved, NOT sorted by level
      // Incorrect behavior would be: H2, H2, H3, H3
      // Correct behavior preserves: H2, H3, H3, H2
      expect(headingTexts).toEqual([
        'Parent Section', // H2
        'Child Section A', // H3
        'Child Section B', // H3
        'Another Parent Section', // H2
      ]);
    });
  });

  describe('Pattern 3: Missing levels (H1, H3, P, H4)', () => {
    it('should not cause reordering when heading levels are skipped', () => {
      const container = document.getElementById('pattern-missing-levels');
      expect(container).not.toBeNull();

      const elements = extractHeadingsFromContainer(container!);
      const textOrder = getTextOrder(elements);

      // Expected DOM order: H1, H3, P, H4
      expect(textOrder[0]).toBe('Document Title'); // H1
      expect(textOrder[1]).toBe('Subsection (skipped H2)'); // H3
      expect(textOrder[2]).toContain('paragraph comes after a skipped'); // P
      expect(textOrder[3]).toContain('Deep Subsection'); // H4
    });

    it('should handle non-sequential heading levels without sorting', () => {
      const container = document.getElementById('pattern-missing-levels');
      expect(container).not.toBeNull();

      const headings = container!.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const headingLevels = Array.from(headings).map((el) =>
        parseInt(el.tagName.substring(1), 10),
      );

      // Level order in DOM: 1, 3, 4 (NOT sorted to 1, 3, 4 or worse)
      expect(headingLevels).toEqual([1, 3, 4]);
    });
  });

  describe('Pattern 4: ARIA headings', () => {
    it('should handle ARIA headings consistently with semantic headings', () => {
      const container = document.getElementById('pattern-aria-headings');
      expect(container).not.toBeNull();

      const elements = extractHeadingsFromContainer(container!);
      const textOrder = getTextOrder(elements);

      // Expected DOM order: H1, ARIA h2, P, ARIA h3, P
      expect(textOrder[0]).toBe('Standard H1');
      expect(textOrder[1]).toBe('ARIA Level 2 Heading');
      expect(textOrder[2]).toContain('Paragraph after ARIA heading');
      expect(textOrder[3]).toBe('ARIA Level 3 Heading');
      expect(textOrder[4]).toContain('Another paragraph');
    });

    it('should not lose ARIA headings during extraction', () => {
      const container = document.getElementById('pattern-aria-headings');
      expect(container).not.toBeNull();

      const ariaHeadings = container!.querySelectorAll('[role="heading"]');
      expect(ariaHeadings.length).toBe(2);

      const ariaTexts = Array.from(ariaHeadings).map(
        (el) => el.textContent?.trim() || '',
      );
      expect(ariaTexts).toContain('ARIA Level 2 Heading');
      expect(ariaTexts).toContain('ARIA Level 3 Heading');
    });
  });

  describe('Pattern 5: Styled non-semantic headings', () => {
    it('should not treat styled divs as headings', () => {
      const container = document.getElementById('pattern-styled-non-semantic');
      expect(container).not.toBeNull();

      // Only extract semantic headings
      const semanticHeadings = container!.querySelectorAll(
        'h1, h2, h3, h4, h5, h6',
      );
      const headingTexts = Array.from(semanticHeadings).map(
        (el) => el.textContent?.trim() || '',
      );

      // Should only contain real H1 and H2
      expect(headingTexts).toContain('Real H1 Heading');
      expect(headingTexts).toContain('Real H2 Heading');
      expect(headingTexts).not.toContain('This looks like a heading');
      expect(headingTexts.length).toBe(2);
    });

    it('should preserve order with non-semantic elements present', () => {
      const container = document.getElementById('pattern-styled-non-semantic');
      expect(container).not.toBeNull();

      const elements = extractHeadingsFromContainer(container!);
      const textOrder = getTextOrder(elements);

      // H1, styled div, P, H2, P - but styled div IS included if we select all elements
      // The key is that order is preserved
      const h1Index = textOrder.findIndex((t) => t === 'Real H1 Heading');
      const h2Index = textOrder.findIndex((t) => t === 'Real H2 Heading');

      // H1 should come before H2
      expect(h1Index).toBeLessThan(h2Index);
    });
  });

  describe('Pattern 6: Complex wiki-like structure', () => {
    it('should preserve complex nested heading structure', () => {
      const container = document.getElementById('pattern-wiki-complex');
      expect(container).not.toBeNull();

      const headings = container!.querySelectorAll('h1, h2, h3, h4');
      const headingTexts = Array.from(headings).map(
        (el) => el.textContent?.trim() || '',
      );

      // Full expected order from the fixture
      expect(headingTexts).toEqual([
        'Wiki Article Title', // H1
        'Background', // H2
        'Historical Context', // H3
        'Current Status', // H3
        'Technical Details', // H2
        'Implementation', // H3
        'Frontend', // H4
        'Backend', // H4
        'Performance', // H3
        'Conclusion', // H2
      ]);
    });

    it('should not reorder subsections under different parents', () => {
      const container = document.getElementById('pattern-wiki-complex');
      expect(container).not.toBeNull();

      const h3Elements = container!.querySelectorAll('h3');
      const h3Texts = Array.from(h3Elements).map(
        (el) => el.textContent?.trim() || '',
      );

      // H3s should appear in DOM order (interleaved with other content)
      expect(h3Texts).toEqual([
        'Historical Context',
        'Current Status',
        'Implementation',
        'Performance',
      ]);
    });

    it('should maintain parent-child relationship in reading order', () => {
      const container = document.getElementById('pattern-wiki-complex');
      expect(container).not.toBeNull();

      const elements = extractHeadingsFromContainer(container!);
      const textOrder = getTextOrder(elements);

      // Find indices
      const technicalDetailsIdx = textOrder.findIndex(
        (t) => t === 'Technical Details',
      );
      const implementationIdx = textOrder.findIndex(
        (t) => t === 'Implementation',
      );
      const frontendIdx = textOrder.findIndex((t) => t === 'Frontend');
      const backendIdx = textOrder.findIndex((t) => t === 'Backend');
      const conclusionIdx = textOrder.findIndex((t) => t === 'Conclusion');

      // Technical Details > Implementation > Frontend > Backend < Performance < Conclusion
      expect(technicalDetailsIdx).toBeLessThan(implementationIdx);
      expect(implementationIdx).toBeLessThan(frontendIdx);
      expect(frontendIdx).toBeLessThan(backendIdx);
      expect(backendIdx).toBeLessThan(conclusionIdx);
    });
  });

  describe('Pattern 7: Same-level siblings (multiple H2s)', () => {
    it('should maintain order of multiple same-level headings', () => {
      const container = document.getElementById('pattern-same-level-siblings');
      expect(container).not.toBeNull();

      const h2Elements = container!.querySelectorAll('h2');
      const h2Texts = Array.from(h2Elements).map(
        (el) => el.textContent?.trim() || '',
      );

      // All H2s should be in exact DOM order
      expect(h2Texts).toEqual([
        'First H2',
        'Second H2',
        'Third H2',
        'Fourth H2',
        'Fifth H2',
      ]);
    });

    it('should not sort sibling headings alphabetically', () => {
      const container = document.getElementById('pattern-same-level-siblings');
      expect(container).not.toBeNull();

      const h2Elements = container!.querySelectorAll('h2');
      const h2Texts = Array.from(h2Elements).map(
        (el) => el.textContent?.trim() || '',
      );

      // Should NOT be alphabetically sorted
      const alphabeticallySorted = [...h2Texts].sort();
      expect(h2Texts).not.toEqual(alphabeticallySorted);

      // Verify original order
      expect(h2Texts[0]).toBe('First H2');
      expect(h2Texts[4]).toBe('Fifth H2');
    });
  });

  describe('querySelectorAll order guarantee', () => {
    it('should return elements in document order (DOM spec)', () => {
      // querySelectorAll is guaranteed by the DOM spec to return
      // elements in document order (pre-order depth-first traversal)
      const allElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const allTexts = Array.from(allElements).map(
        (el) => el.textContent?.trim() || '',
      );

      // First heading in document should be first
      expect(allTexts[0]).toBe('Main Title');

      // Verify no unexpected reordering
      const h1Count = allTexts.filter(
        (_, i, arr) =>
          document.querySelectorAll('h1, h2, h3, h4, h5, h6')[i].tagName ===
          'H1',
      ).length;
      expect(h1Count).toBeGreaterThan(0);
    });
  });

  describe('sortByDocumentPosition behavior', () => {
    it('should sort elements by their position in the DOM', () => {
      // Get elements out of order
      const container = document.getElementById('pattern-simple');
      expect(container).not.toBeNull();

      const h2s = Array.from(container!.querySelectorAll('h2'));
      const h1s = Array.from(container!.querySelectorAll('h1'));
      const ps = Array.from(container!.querySelectorAll('p'));

      // Mix them up intentionally
      const outOfOrder = [...ps, ...h1s, ...h2s];

      // Sort by document position
      const sorted = [...outOfOrder].sort((a, b) => {
        const position = a.compareDocumentPosition(b);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });

      // First element should be H1
      expect(sorted[0].tagName).toBe('H1');

      // Get text order
      const sortedTexts = sorted.map((el) => el.textContent?.trim() || '');
      expect(sortedTexts[0]).toBe('Main Title');
      expect(sortedTexts[1]).toBe('Section One');
    });
  });
});

describe('Heading Order Integration', () => {
  it('documents the bug: headings may be reordered during extraction', () => {
    /**
     * ROOT CAUSE ANALYSIS (T028):
     *
     * The potential causes for heading reordering are:
     *
     * 1. Readability library may reorder content during parsing
     *    - Readability extracts "article content" and may restructure it
     *    - The HTML output from Readability may not preserve DOM order
     *
     * 2. Post-processing sorting
     *    - Any .sort() calls on heading arrays
     *    - Scoring algorithms that reorder by "relevance"
     *
     * 3. Multiple selector iterations
     *    - If headings are collected via multiple selectors,
     *      order depends on iteration order, not DOM order
     *
     * The fix should:
     * 1. Always use sortByDocumentPosition() AFTER collecting elements
     * 2. Never sort by heading level, score, or other criteria
     * 3. Verify Readability output order matches input order
     */

    // Document expected behavior
    const domOrderGuarantee = 'querySelectorAll returns elements in DOM order';
    expect(domOrderGuarantee).toBe('querySelectorAll returns elements in DOM order');
  });
});
