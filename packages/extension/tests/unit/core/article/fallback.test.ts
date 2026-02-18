/**
 * Fallback Extraction Unit Tests (FR-006)
 *
 * Comprehensive tests for the fallback extraction mechanism when
 * Readability fails to extract content. Tests edge cases and
 * complex DOM structures.
 *
 * @module tests/unit/core/article/fallback
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { JSDOM } from 'jsdom';
import {
  ArticleExtractionService,
  createArticleExtractionService,
} from '../../../../src/core/article/extraction.service';
import { createMockReader, type MockReader } from '../../../mocks';
import { isOk, isErr } from '../../../../src/core/shared/result';
import type { Paragraph } from '../../../../src/utils/schemas/article.schema';

describe('Fallback Extraction (FR-006)', () => {
  let service: ArticleExtractionService;
  let mockReader: MockReader;
  let testDocument: Document;

  const testUrl = 'https://example.com/article';

  /**
   * Helper to create a DOM document from HTML string
   */
  function createDocument(html: string): Document {
    const dom = new JSDOM(html);
    return dom.window.document;
  }

  /**
   * Helper to create paragraphs with varying content
   */
  function makeParagraphs(texts: string[]): Paragraph[] {
    let offset = 0;
    return texts.map((text, index) => {
      const para: Paragraph = {
        index,
        text,
        startOffset: offset,
        endOffset: offset + text.length,
      };
      offset += text.length + 2; // Account for paragraph breaks
      return para;
    });
  }

  beforeEach(() => {
    mockReader = createMockReader({
      shouldFailExtract: true, // Always fallback
      extractError: { type: 'EXTRACTION_FAILED', message: 'Primary extraction failed' },
    });
    service = createArticleExtractionService({ reader: mockReader });

    testDocument = createDocument(`
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Test Page</title></head>
        <body><p>Test content</p></body>
      </html>
    `);
  });

  describe('basic fallback scenarios', () => {
    it('should extract visible text when Readability fails', async () => {
      const paragraphs = makeParagraphs([
        'This is the first paragraph with enough content to pass minimum length.',
        'This is the second paragraph with additional content for extraction.',
      ]);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      expect(mockReader.extractArticleCalls).toHaveLength(1);
      expect(mockReader.extractVisibleTextCalls).toHaveLength(1);
    });

    it('should build article content from concatenated paragraphs', async () => {
      const paragraphs = makeParagraphs([
        'First paragraph text.',
        'Second paragraph text.',
        'Third paragraph text.',
      ]);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(testDocument, testUrl, { minParagraphLength: 10 });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.content).toContain('First paragraph text.');
        expect(result.value.content).toContain('Second paragraph text.');
        expect(result.value.content).toContain('Third paragraph text.');
        expect(result.value.paragraphs).toHaveLength(3);
      }
    });

    it('should use document title for article title', async () => {
      const docWithTitle = createDocument(`
        <!DOCTYPE html>
        <html><head><title>Custom Page Title</title></head><body><p>Content</p></body></html>
      `);
      const paragraphs = makeParagraphs(['Long enough paragraph content for extraction.']);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(docWithTitle, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.title).toBe('Custom Page Title');
      }
    });

    it('should use "Untitled Page" when document has no title', async () => {
      const docNoTitle = createDocument(`
        <!DOCTYPE html>
        <html><head></head><body><p>Content</p></body></html>
      `);
      const paragraphs = makeParagraphs(['Paragraph with sufficient length for extraction.']);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(docNoTitle, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.title).toBe('Untitled Page');
      }
    });
  });

  describe('paragraph filtering', () => {
    it('should filter paragraphs shorter than minParagraphLength', async () => {
      const paragraphs = makeParagraphs([
        'Too short', // 9 chars
        'This paragraph is long enough to meet the minimum length requirement.', // 69 chars
        'Short', // 5 chars
        'Another adequately long paragraph that should be included in output.', // 67 chars
      ]);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(testDocument, testUrl, { minParagraphLength: 30 });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paragraphs).toHaveLength(2);
        expect(result.value.paragraphs[0].text).toContain('long enough');
        expect(result.value.paragraphs[1].text).toContain('adequately long');
      }
    });

    it('should use default minParagraphLength of 20', async () => {
      const paragraphs = makeParagraphs([
        'Short text.', // 11 chars
        'Nineteen chars!!', // 16 chars
        'This is exactly 20 chars', // 24 chars
        'This paragraph exceeds twenty characters easily.', // 47 chars
      ]);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Only paragraphs >= 20 chars should be included
        expect(result.value.paragraphs).toHaveLength(2);
      }
    });

    it('should enforce maxParagraphs limit', async () => {
      const paragraphs = makeParagraphs(
        Array.from({ length: 100 }, (_, i) =>
          `This is paragraph number ${i + 1} with enough content to pass the filter.`
        )
      );
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(testDocument, testUrl, { maxParagraphs: 5 });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paragraphs).toHaveLength(5);
        expect(result.value.paragraphs[0].text).toContain('paragraph number 1');
        expect(result.value.paragraphs[4].text).toContain('paragraph number 5');
      }
    });

    it('should use default maxParagraphs of 500', async () => {
      const paragraphs = makeParagraphs(
        Array.from({ length: 600 }, (_, i) =>
          `Paragraph ${i + 1} with sufficient content.`
        )
      );
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paragraphs).toHaveLength(500);
      }
    });

    it('should filter first then limit', async () => {
      // 3 short + 10 long = 13 total, but only 10 pass filter
      const paragraphs = makeParagraphs([
        'Short 1', // Filtered
        'This is a long paragraph that passes the minimum length filter easily.', // 1
        'Short 2', // Filtered
        'Another sufficiently long paragraph for extraction purposes.', // 2
        'Short 3', // Filtered
        ...Array.from({ length: 8 }, (_, i) =>
          `Long paragraph number ${i + 3} passes filter.`
        ), // 3-10
      ]);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(testDocument, testUrl, {
        minParagraphLength: 30,
        maxParagraphs: 5,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paragraphs).toHaveLength(5);
        // First filtered paragraph should be the first long one
        expect(result.value.paragraphs[0].text).toContain('long paragraph that passes');
      }
    });
  });

  describe('error scenarios', () => {
    it('should return NO_CONTENT when no paragraphs extracted', async () => {
      mockReader.setConfig({ mockVisibleTextParagraphs: [] });

      const result = await service.extract(testDocument, testUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NO_CONTENT');
        expect(result.error.message).toContain('No readable content');
      }
    });

    it('should return NO_CONTENT when all paragraphs filtered by length', async () => {
      const shortParagraphs = makeParagraphs([
        'Short 1.',
        'Short 2.',
        'Short 3.',
      ]);
      mockReader.setConfig({ mockVisibleTextParagraphs: shortParagraphs });

      const result = await service.extract(testDocument, testUrl, { minParagraphLength: 100 });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NO_CONTENT');
        expect(result.error.message).toContain('minimum length');
      }
    });

    it('should handle visible text extraction failure', async () => {
      mockReader.setConfig({
        shouldFailVisibleText: true,
        visibleTextError: { type: 'EXTRACTION_FAILED', message: 'DOM access failed' },
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('EXTRACTION_FAILED');
      }
    });

    it('should propagate PERMISSION_DENIED from visible text extraction', async () => {
      mockReader.setConfig({
        shouldFailVisibleText: true,
        visibleTextError: { type: 'PERMISSION_DENIED', message: 'Access blocked' },
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('PERMISSION_DENIED');
      }
    });
  });

  describe('language detection', () => {
    it('should include detected language in extracted article', async () => {
      mockReader.setConfig({
        mockVisibleTextParagraphs: makeParagraphs(['Long paragraph for testing extraction.']),
        detectedLanguage: 'es',
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.lang).toBe('es');
      }
    });

    it('should handle multiple language codes', async () => {
      const languageCodes = ['en', 'fr', 'de', 'ja', 'zh', 'ar'];

      for (const lang of languageCodes) {
        mockReader.reset();
        mockReader.setConfig({
          shouldFailExtract: true,
          mockVisibleTextParagraphs: makeParagraphs(['Test paragraph content.']),
          detectedLanguage: lang,
        });

        const result = await service.extract(testDocument, testUrl);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.lang).toBe(lang);
        }
      }
    });

    it('should handle null language detection gracefully', async () => {
      mockReader.setConfig({
        mockVisibleTextParagraphs: makeParagraphs(['Paragraph with unknown language.']),
        detectedLanguage: null,
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.lang).toBeUndefined();
      }
    });
  });

  describe('URL handling', () => {
    it('should canonicalize URL by removing hash fragment', async () => {
      const paragraphs = makeParagraphs(['Test content for URL canonicalization.']);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const urlWithHash = 'https://example.com/page#section-1';
      const result = await service.extract(testDocument, urlWithHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.url).toBe('https://example.com/page');
        expect(result.value.url).not.toContain('#');
      }
    });

    it('should preserve query parameters in URL', async () => {
      const paragraphs = makeParagraphs(['Test content for URL handling.']);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const urlWithQuery = 'https://example.com/page?param=value';
      const result = await service.extract(testDocument, urlWithQuery);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.url).toBe('https://example.com/page?param=value');
      }
    });

    it('should handle malformed URLs by returning EXTRACTION_FAILED error', async () => {
      const paragraphs = makeParagraphs(['Test content with bad URL.']);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const badUrl = 'not-a-valid-url';
      const result = await service.extract(testDocument, badUrl);

      // Article creation validates URL with Zod, so malformed URLs fail
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('EXTRACTION_FAILED');
      }
    });
  });

  describe('forceFallback option', () => {
    it('should skip primary extraction when forceFallback is true', async () => {
      // Configure reader to succeed on primary extraction
      mockReader.setConfig({
        shouldFailExtract: false,
        mockVisibleTextParagraphs: makeParagraphs(['Fallback content paragraph.']),
      });

      const result = await service.extract(testDocument, testUrl, { forceFallback: true });

      expect(isOk(result)).toBe(true);
      // Primary extraction should NOT have been called
      expect(mockReader.extractArticleCalls).toHaveLength(0);
      // But fallback should have been called
      expect(mockReader.extractVisibleTextCalls).toHaveLength(1);
    });

    it('should still apply minParagraphLength with forceFallback', async () => {
      mockReader.setConfig({
        mockVisibleTextParagraphs: makeParagraphs([
          'Short.',
          'This paragraph is long enough to be included in the output.',
        ]),
      });

      const result = await service.extract(testDocument, testUrl, {
        forceFallback: true,
        minParagraphLength: 20,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paragraphs).toHaveLength(1);
        expect(result.value.paragraphs[0].text).toContain('long enough');
      }
    });
  });

  describe('article metadata', () => {
    it('should set extractedAt timestamp', async () => {
      const paragraphs = makeParagraphs(['Test paragraph content.']);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const before = new Date().toISOString();
      const result = await service.extract(testDocument, testUrl);
      const after = new Date().toISOString();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.extractedAt).toBeDefined();
        expect(result.value.extractedAt >= before).toBe(true);
        expect(result.value.extractedAt <= after).toBe(true);
      }
    });

    it('should calculate word count from content', async () => {
      const paragraphs = makeParagraphs([
        'One two three four five.', // 5 words
        'Six seven eight nine ten.', // 5 words
      ]);
      mockReader.setConfig({ mockVisibleTextParagraphs: paragraphs });

      const result = await service.extract(testDocument, testUrl, { minParagraphLength: 10 });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Word count should be approximately 10 (5 + 5)
        expect(result.value.length).toBeGreaterThanOrEqual(8);
        expect(result.value.length).toBeLessThanOrEqual(12);
      }
    });
  });
});
