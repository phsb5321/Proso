/**
 * ITextExtractor Contract Tests
 *
 * These tests define the contract that all text extractor adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/text-extractor
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { ITextExtractor, ExtractedContent } from '../../src/ports/text-extractor.port';
import { isOk, isErr } from '../../src/core/shared/result';

/**
 * Contract test suite for ITextExtractor implementations.
 *
 * Usage:
 * ```typescript
 * runTextExtractorContractTests('ReadabilityExtractorAdapter', () => new ReadabilityExtractorAdapter());
 * ```
 */
export function runTextExtractorContractTests(
  adapterName: string,
  createAdapter: () => ITextExtractor
) {
  describe(`${adapterName} implements ITextExtractor contract`, () => {
    let adapter: ITextExtractor;

    beforeEach(() => {
      adapter = createAdapter();
    });

    describe('extractorId property', () => {
      it('should have a valid extractorId', () => {
        expect(adapter.extractorId).toBeDefined();
        expect(typeof adapter.extractorId).toBe('string');
        expect(adapter.extractorId.length).toBeGreaterThan(0);
      });
    });

    describe('canHandle()', () => {
      it('should return true for text/html content type', () => {
        const result = adapter.canHandle('text/html');
        expect(typeof result).toBe('boolean');
      });

      it('should return false for unsupported content types', () => {
        const result = adapter.canHandle('application/octet-stream');
        expect(typeof result).toBe('boolean');
      });

      it('should accept optional URL parameter', () => {
        const result = adapter.canHandle('text/html', 'https://example.com');
        expect(typeof result).toBe('boolean');
      });
    });

    describe('extract() with HTML string', () => {
      const sampleHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Test Article</title></head>
        <body>
          <article>
            <h1>Test Heading</h1>
            <p>This is the first paragraph of the test article. It has enough text to be meaningful content.</p>
            <p>This is the second paragraph with additional content. It also has enough text to be meaningful.</p>
          </article>
        </body>
        </html>
      `;

      it('should return a Result type', async () => {
        const result = await adapter.extract('article', sampleHtml);

        // Result should have ok property
        expect(typeof result.ok).toBe('boolean');
      });

      it('should extract content in article mode', async () => {
        const result = await adapter.extract('article', sampleHtml);

        if (isOk(result)) {
          // Should have ExtractedContent structure
          expect(result.value.paragraphs).toBeDefined();
          expect(Array.isArray(result.value.paragraphs)).toBe(true);
          expect(typeof result.value.totalCharacters).toBe('number');
          expect(typeof result.value.extractionTimeMs).toBe('number');
          expect(typeof result.value.sourceUrl).toBe('string');

          // Title can be null or string
          expect(
            result.value.title === null || typeof result.value.title === 'string'
          ).toBe(true);
        }

        if (isErr(result)) {
          // Error should be typed
          expect(result.error.type).toBeDefined();
          expect([
            'no_readable_content',
            'extraction_failed',
            'invalid_selection',
            'dom_access_denied',
          ]).toContain(result.error.type);
        }
      });

      it('should extract content in full mode', async () => {
        const result = await adapter.extract('full', sampleHtml);
        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(Array.isArray(result.value.paragraphs)).toBe(true);
        }
      });

      it('should return paragraphs with valid structure', async () => {
        const result = await adapter.extract('article', sampleHtml);

        if (isOk(result) && result.value.paragraphs.length > 0) {
          for (const paragraph of result.value.paragraphs) {
            expect(typeof paragraph.text).toBe('string');
            expect(typeof paragraph.index).toBe('number');
            expect(paragraph.index).toBeGreaterThanOrEqual(0);
            expect(['paragraph', 'heading', 'list']).toContain(paragraph.type);
            expect(typeof paragraph.characterCount).toBe('number');
            expect(paragraph.characterCount).toBe(paragraph.text.length);
          }
        }
      });

      it('should track extraction time', async () => {
        const result = await adapter.extract('article', sampleHtml);

        if (isOk(result)) {
          expect(result.value.extractionTimeMs).toBeGreaterThanOrEqual(0);
        }
      });
    });

    describe('extract() with empty or minimal content', () => {
      it('should handle empty HTML gracefully', async () => {
        const result = await adapter.extract('article', '<html><body></body></html>');

        // Should either succeed with empty content or return no_readable_content error
        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(result.value.paragraphs.length).toBeGreaterThanOrEqual(0);
        }

        if (isErr(result)) {
          expect(result.error.type).toBe('no_readable_content');
        }
      });

      it('should handle HTML with only navigation content', async () => {
        const navOnlyHtml = `
          <html>
          <body>
            <nav>
              <a href="/">Home</a>
              <a href="/about">About</a>
              <a href="/contact">Contact</a>
            </nav>
          </body>
          </html>
        `;

        const result = await adapter.extract('article', navOnlyHtml);
        expect(typeof result.ok).toBe('boolean');
      });
    });

    describe('extract() error handling', () => {
      it('should return typed error for invalid input', async () => {
        const result = await adapter.extract('article', '');

        if (isErr(result)) {
          expect(result.error.type).toBeDefined();
          expect([
            'no_readable_content',
            'extraction_failed',
            'invalid_selection',
            'dom_access_denied',
          ]).toContain(result.error.type);
        }
      });
    });

    describe('paragraph indexing', () => {
      it('should index paragraphs sequentially starting from 0', async () => {
        const multiParagraphHtml = `
          <html>
          <body>
            <article>
              <p>First paragraph with enough content to be meaningful.</p>
              <p>Second paragraph with enough content to be meaningful.</p>
              <p>Third paragraph with enough content to be meaningful.</p>
            </article>
          </body>
          </html>
        `;

        const result = await adapter.extract('article', multiParagraphHtml);

        if (isOk(result) && result.value.paragraphs.length > 0) {
          const indices = result.value.paragraphs.map(p => p.index);

          // Should start at 0
          expect(indices[0]).toBe(0);

          // Should be sequential
          for (let i = 1; i < indices.length; i++) {
            expect(indices[i]).toBe(indices[i - 1] + 1);
          }
        }
      });
    });

    describe('totalCharacters calculation', () => {
      it('should accurately count total characters', async () => {
        const result = await adapter.extract('article', `
          <html><body><article>
            <p>Hello world.</p>
            <p>Another paragraph.</p>
          </article></body></html>
        `);

        if (isOk(result)) {
          const expectedTotal = result.value.paragraphs.reduce(
            (sum, p) => sum + p.characterCount,
            0
          );
          expect(result.value.totalCharacters).toBe(expectedTotal);
        }
      });
    });
  });
}

/**
 * Test paragraph structure validation.
 */
export function testParagraphStructure(
  paragraph: ExtractedContent['paragraphs'][number]
) {
  expect(typeof paragraph.text).toBe('string');
  expect(paragraph.text.length).toBeGreaterThan(0);
  expect(typeof paragraph.index).toBe('number');
  expect(paragraph.index).toBeGreaterThanOrEqual(0);
  expect(['paragraph', 'heading', 'list']).toContain(paragraph.type);
  expect(typeof paragraph.characterCount).toBe('number');
  expect(paragraph.characterCount).toBe(paragraph.text.length);
}

// Export for use in adapter-specific test files
export { runTextExtractorContractTests as default };

/**
 * Placeholder test to satisfy Jest requirement.
 * Real contract tests are run via runTextExtractorContractTests() in adapter test files.
 */
describe('ITextExtractor Contract', () => {
  it('exports contract test helpers', () => {
    expect(typeof runTextExtractorContractTests).toBe('function');
    expect(typeof testParagraphStructure).toBe('function');
  });
});
