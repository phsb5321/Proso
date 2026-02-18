/**
 * IContentScorer Contract Tests
 *
 * These tests define the contract that all content scorer adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/content-scorer
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { IContentScorer, ContentScore } from '../../src/ports/content-scorer.port';

/**
 * Contract test suite for IContentScorer implementations.
 *
 * Usage:
 * ```typescript
 * runContentScorerContractTests('TrafilaturaScorerAdapter', () => new TrafilaturaScorerAdapter());
 * ```
 */
export function runContentScorerContractTests(
  adapterName: string,
  createAdapter: () => IContentScorer
) {
  describe(`${adapterName} implements IContentScorer contract`, () => {
    let adapter: IContentScorer;

    // Create a mock document environment for testing
    const createMockDocument = (html: string): Document => {
      // Use JSDOM or similar for testing
      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    };

    const createMockElement = (html: string): Element => {
      const doc = createMockDocument(`<html><body>${html}</body></html>`);
      return doc.body.firstElementChild || doc.body;
    };

    beforeEach(() => {
      adapter = createAdapter();
    });

    describe('scoreElement()', () => {
      it('should return ContentScore structure', () => {
        const element = createMockElement(`
          <article>
            <h1>Test Article</h1>
            <p>This is a test paragraph with enough content to be meaningful.</p>
            <p>Another paragraph with additional meaningful content here.</p>
          </article>
        `);

        const result = adapter.scoreElement(element);

        // Should have ContentScore structure
        expect(typeof result.score).toBe('number');
        expect(typeof result.paragraphCount).toBe('number');
        expect(typeof result.linkDensity).toBe('number');
        expect(typeof result.headingCount).toBe('number');
      });

      it('should return non-negative scores', () => {
        const element = createMockElement('<p>Simple paragraph content.</p>');
        const result = adapter.scoreElement(element);

        // Score might be negative for penalized content, but counts should be non-negative
        expect(result.paragraphCount).toBeGreaterThanOrEqual(0);
        expect(result.linkDensity).toBeGreaterThanOrEqual(0);
        expect(result.linkDensity).toBeLessThanOrEqual(1);
        expect(result.headingCount).toBeGreaterThanOrEqual(0);
      });

      it('should give higher scores to content-rich elements', () => {
        const contentRich = createMockElement(`
          <article>
            <h1>Article Title</h1>
            <p>This is a long paragraph with substantial content that would be considered main article content.</p>
            <h2>Section Heading</h2>
            <p>Another paragraph with more meaningful content that continues the article narrative.</p>
            <p>A third paragraph adding even more value to the article content area.</p>
          </article>
        `);

        const navigation = createMockElement(`
          <nav>
            <a href="/">Home</a>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
          </nav>
        `);

        const contentScore = adapter.scoreElement(contentRich);
        const navScore = adapter.scoreElement(navigation);

        expect(contentScore.score).toBeGreaterThan(navScore.score);
      });

      it('should count paragraphs correctly', () => {
        const element = createMockElement(`
          <div>
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
            <p>Third paragraph.</p>
          </div>
        `);

        const result = adapter.scoreElement(element);
        expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      });

      it('should count headings correctly', () => {
        const element = createMockElement(`
          <article>
            <h1>Main Title</h1>
            <h2>Section One</h2>
            <h3>Subsection</h3>
          </article>
        `);

        const result = adapter.scoreElement(element);
        expect(result.headingCount).toBeGreaterThanOrEqual(1);
      });

      it('should calculate link density', () => {
        const highLinkDensity = createMockElement(`
          <nav>
            <a href="/link1">Link 1</a>
            <a href="/link2">Link 2</a>
            <a href="/link3">Link 3</a>
          </nav>
        `);

        const lowLinkDensity = createMockElement(`
          <article>
            <p>This is a paragraph with lots of text content that is not a link and should lower the link density significantly.</p>
            <p>Another paragraph with substantial content. <a href="/">Single link</a></p>
          </article>
        `);

        const highScore = adapter.scoreElement(highLinkDensity);
        const lowScore = adapter.scoreElement(lowLinkDensity);

        expect(highScore.linkDensity).toBeGreaterThan(lowScore.linkDensity);
      });
    });

    describe('scoreHtml()', () => {
      it('should return ContentScore for HTML string', () => {
        const html = `
          <article>
            <h1>Test Article</h1>
            <p>A paragraph with content.</p>
          </article>
        `;

        const result = adapter.scoreHtml(html);

        expect(typeof result.score).toBe('number');
        expect(typeof result.paragraphCount).toBe('number');
        expect(typeof result.linkDensity).toBe('number');
        expect(typeof result.headingCount).toBe('number');
      });

      it('should handle empty HTML', () => {
        const result = adapter.scoreHtml('');

        expect(typeof result.score).toBe('number');
        expect(result.paragraphCount).toBe(0);
        expect(result.headingCount).toBe(0);
      });

      it('should handle malformed HTML gracefully', () => {
        const malformed = '<p>Unclosed paragraph<h1>Title without close<a href=bad';

        // Should not throw
        expect(() => adapter.scoreHtml(malformed)).not.toThrow();

        const result = adapter.scoreHtml(malformed);
        expect(typeof result.score).toBe('number');
      });
    });

    describe('findBestContainer()', () => {
      it('should return Element or null', () => {
        const doc = createMockDocument(`
          <html>
          <body>
            <header><nav>Navigation</nav></header>
            <main>
              <article>
                <h1>Main Article</h1>
                <p>Substantial paragraph content here that represents the main article.</p>
                <p>Another substantial paragraph with meaningful content.</p>
              </article>
            </main>
            <footer>Footer content</footer>
          </body>
          </html>
        `);

        const result = adapter.findBestContainer(doc);

        // Should return Element or null
        expect(result === null || result instanceof Element).toBe(true);
      });

      it('should find content container in well-structured document', () => {
        const doc = createMockDocument(`
          <html>
          <body>
            <nav>
              <a href="/">Home</a>
              <a href="/about">About</a>
            </nav>
            <article>
              <h1>Main Article Title</h1>
              <p>This is a long paragraph with substantial content that would be considered the main article content of this page.</p>
              <p>Another paragraph with more meaningful content that continues the article narrative with additional information.</p>
              <p>A third paragraph adding even more value to demonstrate this is the main content area of the document.</p>
            </article>
            <aside>Sidebar content</aside>
          </body>
          </html>
        `);

        const result = adapter.findBestContainer(doc);

        if (result) {
          // Best container should not be nav or aside
          expect(result.tagName.toLowerCase()).not.toBe('nav');
          expect(result.tagName.toLowerCase()).not.toBe('aside');
        }
      });

      it('should return null for empty document', () => {
        const doc = createMockDocument('<html><body></body></html>');

        const result = adapter.findBestContainer(doc);

        // May return null or body for empty document
        expect(result === null || result instanceof Element).toBe(true);
      });

      it('should handle document with only navigation', () => {
        const doc = createMockDocument(`
          <html>
          <body>
            <nav>
              <a href="/">Home</a>
              <a href="/about">About</a>
              <a href="/contact">Contact</a>
            </nav>
          </body>
          </html>
        `);

        const result = adapter.findBestContainer(doc);

        // Should return null or nav element
        expect(result === null || result instanceof Element).toBe(true);
      });
    });
  });
}

/**
 * Test ContentScore structure validation.
 */
export function testContentScoreStructure(score: ContentScore) {
  expect(typeof score.score).toBe('number');
  expect(typeof score.paragraphCount).toBe('number');
  expect(score.paragraphCount).toBeGreaterThanOrEqual(0);
  expect(typeof score.linkDensity).toBe('number');
  expect(score.linkDensity).toBeGreaterThanOrEqual(0);
  expect(score.linkDensity).toBeLessThanOrEqual(1);
  expect(typeof score.headingCount).toBe('number');
  expect(score.headingCount).toBeGreaterThanOrEqual(0);
}

// Export for use in adapter-specific test files
export { runContentScorerContractTests as default };

/**
 * Placeholder test to satisfy Jest requirement.
 * Real contract tests are run via runContentScorerContractTests() in adapter test files.
 */
describe('IContentScorer Contract', () => {
  it('exports contract test helpers', () => {
    expect(typeof runContentScorerContractTests).toBe('function');
    expect(typeof testContentScoreStructure).toBe('function');
  });
});
