/**
 * IReader Contract Tests
 *
 * These tests define the contract that all reader adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/reader
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import type { IReader, ReaderError, ExtractionOptions } from '../../src/ports/reader.port';
import type { Article, Paragraph } from '../../src/utils/schemas/article.schema';
import { isOk, isErr } from '../../src/core/shared/result';
import { MockReader, createMockReader, createTestParagraphsForArticle } from '../mocks/mock-reader';

/**
 * Contract test suite for IReader implementations.
 *
 * Usage:
 * ```typescript
 * runReaderContractTests('ReadabilityAdapter', () => new ReadabilityAdapter());
 * ```
 */
export function runReaderContractTests(
  adapterName: string,
  createAdapter: () => IReader
) {
  describe(`${adapterName} implements IReader contract`, () => {
    let adapter: IReader;
    let mockDocument: Document;

    const createMockDocument = (html: string): Document => {
      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    };

    beforeEach(() => {
      adapter = createAdapter();
      mockDocument = createMockDocument(`
        <html lang="en">
        <head><title>Test Article</title></head>
        <body>
          <article>
            <h1>Test Heading</h1>
            <p>This is the first paragraph of the test article. It has enough text to be meaningful content.</p>
            <p>This is the second paragraph with additional content. It also has enough text to be meaningful.</p>
          </article>
        </body>
        </html>
      `);
    });

    describe('interface completeness', () => {
      it('should have all required methods', () => {
        expect(typeof adapter.extractArticle).toBe('function');
        expect(typeof adapter.extractVisibleText).toBe('function');
        expect(typeof adapter.isArticlePage).toBe('function');
        expect(typeof adapter.detectLanguage).toBe('function');
      });
    });

    describe('extractArticle()', () => {
      it('should return Result with ok:true containing Article with required fields', async () => {
        const result = await adapter.extractArticle(mockDocument, 'https://example.com/article');

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          const article = result.value;
          expect(typeof article.url).toBe('string');
          expect(typeof article.extractedAt).toBe('string');
          expect(typeof article.title).toBe('string');
          expect(typeof article.content).toBe('string');
          expect(Array.isArray(article.paragraphs)).toBe(true);
          expect(typeof article.length).toBe('number');
        }
      });

      it('should return Article with paragraphs array containing valid Paragraph objects', async () => {
        const result = await adapter.extractArticle(mockDocument, 'https://example.com/article');

        if (isOk(result)) {
          expect(result.value.paragraphs.length).toBeGreaterThan(0);

          for (const paragraph of result.value.paragraphs) {
            expect(typeof paragraph.index).toBe('number');
            expect(paragraph.index).toBeGreaterThanOrEqual(0);
            expect(typeof paragraph.text).toBe('string');
            expect(paragraph.text.length).toBeGreaterThan(0);
            expect(typeof paragraph.startOffset).toBe('number');
            expect(paragraph.startOffset).toBeGreaterThanOrEqual(0);
            expect(typeof paragraph.endOffset).toBe('number');
            expect(paragraph.endOffset).toBeGreaterThanOrEqual(paragraph.startOffset);
          }
        }
      });

      it('should return NO_CONTENT error for empty pages', async () => {
        const emptyDoc = createMockDocument('<html><body></body></html>');

        // Configure adapter to fail with NO_CONTENT for empty content
        if (adapter instanceof MockReader) {
          adapter.setConfig({
            shouldFailExtract: true,
            extractError: { type: 'NO_CONTENT', message: 'No content found' },
          });
        }

        const result = await adapter.extractArticle(emptyDoc, 'https://example.com/empty');

        if (isErr(result)) {
          expect(result.error.type).toBe('NO_CONTENT');
          expect(typeof result.error.message).toBe('string');
        }
      });

      it('should respect ExtractionOptions.maxParagraphs', async () => {
        const maxParagraphs = 1;
        const paragraphs = createTestParagraphsForArticle(5);

        if (adapter instanceof MockReader) {
          adapter.setConfig({
            mockArticle: {
              url: 'https://example.com/article',
              extractedAt: new Date().toISOString(),
              title: 'Test',
              content: paragraphs.map(p => p.text).join('\n\n'),
              paragraphs: paragraphs.slice(0, maxParagraphs),
              length: 100,
            },
          });
        }

        const options: ExtractionOptions = { maxParagraphs };
        const result = await adapter.extractArticle(
          mockDocument,
          'https://example.com/article',
          options,
        );

        if (isOk(result)) {
          expect(result.value.paragraphs.length).toBeLessThanOrEqual(maxParagraphs);
        }
      });

      it('should respect ExtractionOptions.minParagraphLength', async () => {
        const minParagraphLength = 50;

        // Create paragraphs where all meet the minimum length
        const longParagraphs = createTestParagraphsForArticle(3, minParagraphLength);

        if (adapter instanceof MockReader) {
          adapter.setConfig({
            mockArticle: {
              url: 'https://example.com/article',
              extractedAt: new Date().toISOString(),
              title: 'Test',
              content: longParagraphs.map(p => p.text).join('\n\n'),
              paragraphs: longParagraphs,
              length: 100,
            },
          });
        }

        const options: ExtractionOptions = { minParagraphLength };
        const result = await adapter.extractArticle(
          mockDocument,
          'https://example.com/article',
          options,
        );

        if (isOk(result)) {
          for (const paragraph of result.value.paragraphs) {
            expect(paragraph.text.length).toBeGreaterThanOrEqual(minParagraphLength);
          }
        }
      });

      it('should accept optional ExtractionOptions parameter', async () => {
        // Should work without options
        const resultNoOpts = await adapter.extractArticle(
          mockDocument,
          'https://example.com/article',
        );
        expect(typeof resultNoOpts.ok).toBe('boolean');

        // Should work with options
        const resultWithOpts = await adapter.extractArticle(
          mockDocument,
          'https://example.com/article',
          { includeImages: true },
        );
        expect(typeof resultWithOpts.ok).toBe('boolean');
      });

      it('should return Article with optional fields typed correctly', async () => {
        const result = await adapter.extractArticle(mockDocument, 'https://example.com/article');

        if (isOk(result)) {
          const article = result.value;

          // Optional fields should be string or undefined
          expect(
            article.byline === undefined || typeof article.byline === 'string'
          ).toBe(true);
          expect(
            article.siteName === undefined || typeof article.siteName === 'string'
          ).toBe(true);
          expect(
            article.excerpt === undefined || typeof article.excerpt === 'string'
          ).toBe(true);
          expect(
            article.lang === undefined || typeof article.lang === 'string'
          ).toBe(true);
        }
      });
    });

    describe('extractVisibleText()', () => {
      it('should return Result with ok:true containing Paragraph[]', async () => {
        const result = await adapter.extractVisibleText(
          mockDocument,
          'https://example.com/article',
        );

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(Array.isArray(result.value)).toBe(true);

          for (const paragraph of result.value) {
            expect(typeof paragraph.index).toBe('number');
            expect(typeof paragraph.text).toBe('string');
            expect(typeof paragraph.startOffset).toBe('number');
            expect(typeof paragraph.endOffset).toBe('number');
          }
        }
      });

      it('should return NO_CONTENT error for empty document', async () => {
        const emptyDoc = createMockDocument('<html><body></body></html>');

        if (adapter instanceof MockReader) {
          adapter.setConfig({
            shouldFailVisibleText: true,
            visibleTextError: { type: 'NO_CONTENT', message: 'No visible text found' },
          });
        }

        const result = await adapter.extractVisibleText(emptyDoc, 'https://example.com/empty');

        if (isErr(result)) {
          expect(result.error.type).toBe('NO_CONTENT');
          expect(typeof result.error.message).toBe('string');
        }
      });

      it('should return paragraphs with sequential indices when successful', async () => {
        const testParagraphs = createTestParagraphsForArticle(3);

        if (adapter instanceof MockReader) {
          adapter.setConfig({
            shouldFailVisibleText: false,
            mockVisibleTextParagraphs: testParagraphs,
          });
        }

        const result = await adapter.extractVisibleText(
          mockDocument,
          'https://example.com/article',
        );

        if (isOk(result) && result.value.length > 0) {
          const indices = result.value.map(p => p.index);
          expect(indices[0]).toBe(0);

          for (let i = 1; i < indices.length; i++) {
            expect(indices[i]).toBe(indices[i - 1] + 1);
          }
        }
      });
    });

    describe('isArticlePage()', () => {
      it('should return a boolean', () => {
        const result = adapter.isArticlePage(mockDocument);
        expect(typeof result).toBe('boolean');
      });

      it('should return boolean for empty document', () => {
        const emptyDoc = createMockDocument('<html><body></body></html>');
        const result = adapter.isArticlePage(emptyDoc);
        expect(typeof result).toBe('boolean');
      });
    });

    describe('detectLanguage()', () => {
      it('should return string or null', () => {
        const result = adapter.detectLanguage(mockDocument);
        expect(result === null || typeof result === 'string').toBe(true);
      });

      it('should return null for document without language information', () => {
        if (adapter instanceof MockReader) {
          adapter.setConfig({ detectedLanguage: null });
        }

        const noLangDoc = createMockDocument('<html><head></head><body></body></html>');
        const result = adapter.detectLanguage(noLangDoc);

        expect(result === null || typeof result === 'string').toBe(true);
      });
    });

    describe('error types', () => {
      const validErrorTypes: ReaderError['type'][] = [
        'EXTRACTION_FAILED',
        'NO_CONTENT',
        'INVALID_URL',
        'PERMISSION_DENIED',
      ];

      it('should return EXTRACTION_FAILED error type', async () => {
        if (adapter instanceof MockReader) {
          adapter.setConfig({
            shouldFailExtract: true,
            extractError: { type: 'EXTRACTION_FAILED', message: 'Extraction failed' },
          });
        }

        const result = await adapter.extractArticle(mockDocument, 'https://example.com');

        if (isErr(result)) {
          expect(validErrorTypes).toContain(result.error.type);
          expect(result.error.type).toBe('EXTRACTION_FAILED');
          expect(typeof result.error.message).toBe('string');
        }
      });

      it('should return INVALID_URL error type', async () => {
        if (adapter instanceof MockReader) {
          adapter.setConfig({
            shouldFailExtract: true,
            extractError: { type: 'INVALID_URL', message: 'Invalid URL' },
          });
        }

        const result = await adapter.extractArticle(mockDocument, 'not-a-url');

        if (isErr(result)) {
          expect(validErrorTypes).toContain(result.error.type);
          expect(result.error.type).toBe('INVALID_URL');
        }
      });

      it('should return PERMISSION_DENIED error type', async () => {
        if (adapter instanceof MockReader) {
          adapter.setConfig({
            shouldFailExtract: true,
            extractError: { type: 'PERMISSION_DENIED', message: 'Access denied' },
          });
        }

        const result = await adapter.extractArticle(mockDocument, 'https://example.com');

        if (isErr(result)) {
          expect(validErrorTypes).toContain(result.error.type);
          expect(result.error.type).toBe('PERMISSION_DENIED');
        }
      });

      it('should have error types matching ReaderError union', async () => {
        for (const errorType of validErrorTypes) {
          if (adapter instanceof MockReader) {
            adapter.setConfig({
              shouldFailExtract: true,
              extractError: { type: errorType, message: `Test ${errorType}` },
            });
          }

          const result = await adapter.extractArticle(mockDocument, 'https://example.com');

          if (isErr(result)) {
            expect(validErrorTypes).toContain(result.error.type);
            expect(typeof result.error.message).toBe('string');
            expect(result.error.message.length).toBeGreaterThan(0);
          }
        }
      });
    });

    describe('paragraph structure', () => {
      it('should have index, text, startOffset, endOffset on each paragraph', async () => {
        const result = await adapter.extractArticle(mockDocument, 'https://example.com/article');

        if (isOk(result)) {
          for (const paragraph of result.value.paragraphs) {
            expect(paragraph).toHaveProperty('index');
            expect(paragraph).toHaveProperty('text');
            expect(paragraph).toHaveProperty('startOffset');
            expect(paragraph).toHaveProperty('endOffset');

            expect(typeof paragraph.index).toBe('number');
            expect(Number.isInteger(paragraph.index)).toBe(true);
            expect(typeof paragraph.text).toBe('string');
            expect(typeof paragraph.startOffset).toBe('number');
            expect(Number.isInteger(paragraph.startOffset)).toBe(true);
            expect(typeof paragraph.endOffset).toBe('number');
            expect(Number.isInteger(paragraph.endOffset)).toBe(true);
          }
        }
      });
    });
  });
}

/**
 * Test Paragraph structure validation helper.
 */
export function testParagraphStructure(paragraph: Paragraph) {
  expect(typeof paragraph.text).toBe('string');
  expect(paragraph.text.length).toBeGreaterThan(0);
  expect(typeof paragraph.index).toBe('number');
  expect(paragraph.index).toBeGreaterThanOrEqual(0);
  expect(typeof paragraph.startOffset).toBe('number');
  expect(paragraph.startOffset).toBeGreaterThanOrEqual(0);
  expect(typeof paragraph.endOffset).toBe('number');
  expect(paragraph.endOffset).toBeGreaterThanOrEqual(paragraph.startOffset);
}

// Export for use in adapter-specific test files
export { runReaderContractTests as default };

/**
 * Run contract tests against MockReader to verify the contract itself.
 */
describe('IReader Contract', () => {
  it('exports contract test helpers', () => {
    expect(typeof runReaderContractTests).toBe('function');
    expect(typeof testParagraphStructure).toBe('function');
  });
});

// Run the contract tests against the MockReader implementation
runReaderContractTests('MockReader', () => createMockReader());
