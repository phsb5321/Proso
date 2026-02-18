/**
 * ArticleExtractionService Unit Tests
 *
 * Tests for the article extraction domain service.
 * Uses mock reader to test extraction logic in isolation.
 *
 * @module tests/unit/core/article/extraction.service
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { JSDOM } from 'jsdom';
import {
  ArticleExtractionService,
  createArticleExtractionService,
  type ArticleExtractionError,
} from '../../../../src/core/article/extraction.service';
import {
  createMockReader,
  createTestParagraphsForArticle,
  type MockReader,
} from '../../../mocks';
import type { Article } from '../../../../src/utils/schemas/article.schema';
import { isOk, isErr } from '../../../../src/core/shared/result';

describe('ArticleExtractionService', () => {
  let service: ArticleExtractionService;
  let mockReader: MockReader;
  let testDocument: Document;

  const testUrl = 'https://example.com/test-article';

  beforeEach(() => {
    // Create a fresh mock reader for each test
    mockReader = createMockReader();
    service = createArticleExtractionService({ reader: mockReader });

    // Create a test document using JSDOM
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html lang="en">
        <head><title>Test Article Title</title></head>
        <body>
          <article>
            <h1>Test Article Title</h1>
            <p>This is the first paragraph of the test article with enough content.</p>
            <p>This is the second paragraph with additional content for testing.</p>
          </article>
        </body>
      </html>
    `);
    testDocument = dom.window.document;
  });

  describe('extract()', () => {
    it('should successfully extract article using primary reader', async () => {
      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.title).toBe('Test Article Title');
        expect(result.value.url).toBe(testUrl);
        expect(result.value.paragraphs.length).toBeGreaterThan(0);
      }
    });

    it('should track reader calls', async () => {
      await service.extract(testDocument, testUrl);

      expect(mockReader.extractArticleCalls).toHaveLength(1);
      expect(mockReader.extractArticleCalls[0].url).toBe(testUrl);
    });

    it('should pass extraction options to reader', async () => {
      const options = {
        minParagraphLength: 30,
        maxParagraphs: 10,
      };

      await service.extract(testDocument, testUrl, options);

      expect(mockReader.extractArticleCalls[0].options).toEqual(options);
    });

    it('should use default options when not provided', async () => {
      await service.extract(testDocument, testUrl);

      const callOptions = mockReader.extractArticleCalls[0].options;
      expect(callOptions?.minParagraphLength).toBe(20);
      expect(callOptions?.maxParagraphs).toBe(500);
    });

    it('should return custom article from mock reader', async () => {
      const customArticle: Article = {
        url: testUrl,
        extractedAt: new Date().toISOString(),
        title: 'Custom Title',
        content: 'Custom content paragraph.',
        paragraphs: [{ index: 0, text: 'Custom content paragraph.', startOffset: 0, endOffset: 25 }],
        length: 3,
        excerpt: 'Custom content paragraph.',
        lang: 'es',
      };

      mockReader.setConfig({ mockArticle: customArticle });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.title).toBe('Custom Title');
        expect(result.value.lang).toBe('es');
      }
    });

    it('should canonicalize URL by removing hash', async () => {
      mockReader.setConfig({ shouldFailExtract: true });
      mockReader.setConfig({
        shouldFailExtract: false,
        mockVisibleTextParagraphs: createTestParagraphsForArticle(2),
      });

      // Reset to test fallback which creates article with canonical URL
      mockReader.setConfig({
        shouldFailExtract: true,
        mockVisibleTextParagraphs: createTestParagraphsForArticle(2),
      });

      const urlWithHash = 'https://example.com/article#section';
      const result = await service.extract(testDocument, urlWithHash);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.url).toBe('https://example.com/article');
      }
    });
  });

  describe('fallback extraction (FR-006)', () => {
    beforeEach(() => {
      // Configure reader to fail primary extraction
      mockReader.setConfig({
        shouldFailExtract: true,
        extractError: { type: 'EXTRACTION_FAILED', message: 'Readability failed' },
      });
    });

    it('should fallback to visible text when primary extraction fails', async () => {
      const fallbackParagraphs = createTestParagraphsForArticle(3);
      mockReader.setConfig({
        shouldFailExtract: true,
        mockVisibleTextParagraphs: fallbackParagraphs,
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      expect(mockReader.extractVisibleTextCalls).toHaveLength(1);
    });

    it('should use forceFallback option to skip primary extraction', async () => {
      const fallbackParagraphs = createTestParagraphsForArticle(2);
      mockReader.setConfig({
        shouldFailExtract: false, // Would succeed
        mockVisibleTextParagraphs: fallbackParagraphs,
      });

      await service.extract(testDocument, testUrl, { forceFallback: true });

      // Primary extraction should NOT be called
      expect(mockReader.extractArticleCalls).toHaveLength(0);
      // Fallback should be called
      expect(mockReader.extractVisibleTextCalls).toHaveLength(1);
    });

    it('should return NO_CONTENT error when fallback has no paragraphs', async () => {
      mockReader.setConfig({
        shouldFailExtract: true,
        mockVisibleTextParagraphs: [],
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NO_CONTENT');
      }
    });

    it('should filter paragraphs by minimum length', async () => {
      const mixedParagraphs = [
        { index: 0, text: 'Short.', startOffset: 0, endOffset: 6 }, // Too short
        { index: 1, text: 'This is a sufficiently long paragraph for testing extraction.', startOffset: 7, endOffset: 68 },
        { index: 2, text: 'Tiny', startOffset: 69, endOffset: 73 }, // Too short
      ];
      mockReader.setConfig({
        shouldFailExtract: true,
        mockVisibleTextParagraphs: mixedParagraphs,
      });

      const result = await service.extract(testDocument, testUrl, { minParagraphLength: 20 });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paragraphs.length).toBe(1);
        expect(result.value.paragraphs[0].text).toContain('sufficiently long');
      }
    });

    it('should limit paragraphs to maxParagraphs', async () => {
      const manyParagraphs = createTestParagraphsForArticle(10);
      mockReader.setConfig({
        shouldFailExtract: true,
        mockVisibleTextParagraphs: manyParagraphs,
      });

      const result = await service.extract(testDocument, testUrl, { maxParagraphs: 3 });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.paragraphs.length).toBe(3);
      }
    });

    it('should return NO_CONTENT when all paragraphs filtered by minLength', async () => {
      const shortParagraphs = [
        { index: 0, text: 'Short text.', startOffset: 0, endOffset: 11 },
        { index: 1, text: 'Also short.', startOffset: 12, endOffset: 23 },
      ];
      mockReader.setConfig({
        shouldFailExtract: true,
        mockVisibleTextParagraphs: shortParagraphs,
      });

      const result = await service.extract(testDocument, testUrl, { minParagraphLength: 100 });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NO_CONTENT');
        expect(result.error.message).toContain('minimum length');
      }
    });

    it('should detect language during fallback', async () => {
      const paragraphs = createTestParagraphsForArticle(2);
      mockReader.setConfig({
        shouldFailExtract: true,
        mockVisibleTextParagraphs: paragraphs,
        detectedLanguage: 'fr',
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.lang).toBe('fr');
      }
    });

    it('should handle null language detection', async () => {
      const paragraphs = createTestParagraphsForArticle(2);
      mockReader.setConfig({
        shouldFailExtract: true,
        mockVisibleTextParagraphs: paragraphs,
        detectedLanguage: null,
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.lang).toBeUndefined();
      }
    });
  });

  describe('error handling', () => {
    it('should map PERMISSION_DENIED error from reader', async () => {
      mockReader.setConfig({
        shouldFailExtract: true,
        extractError: { type: 'PERMISSION_DENIED', message: 'Access denied' },
        shouldFailVisibleText: true,
        visibleTextError: { type: 'PERMISSION_DENIED', message: 'Access denied' },
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('PERMISSION_DENIED');
      }
    });

    it('should map NO_CONTENT error from reader', async () => {
      mockReader.setConfig({
        shouldFailExtract: true,
        extractError: { type: 'NO_CONTENT', message: 'No content found' },
        shouldFailVisibleText: true,
        visibleTextError: { type: 'NO_CONTENT', message: 'No content found' },
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('NO_CONTENT');
      }
    });

    it('should map INVALID_URL error to EXTRACTION_FAILED', async () => {
      mockReader.setConfig({
        shouldFailExtract: true,
        extractError: { type: 'INVALID_URL', message: 'Bad URL' },
        shouldFailVisibleText: true,
        visibleTextError: { type: 'INVALID_URL', message: 'Bad URL' },
      });

      const result = await service.extract(testDocument, testUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('EXTRACTION_FAILED');
      }
    });
  });

  describe('isArticlePage()', () => {
    it('should delegate to reader', () => {
      mockReader.setConfig({ isArticle: true });

      const result = service.isArticlePage(testDocument);

      expect(result).toBe(true);
      expect(mockReader.isArticlePageCalls).toHaveLength(1);
    });

    it('should return false when reader says not article', () => {
      mockReader.setConfig({ isArticle: false });

      const result = service.isArticlePage(testDocument);

      expect(result).toBe(false);
    });
  });

  describe('getPageLanguage()', () => {
    it('should delegate to reader', () => {
      mockReader.setConfig({ detectedLanguage: 'de' });

      const result = service.getPageLanguage(testDocument);

      expect(result).toBe('de');
      expect(mockReader.detectLanguageCalls).toHaveLength(1);
    });

    it('should return null when reader returns null', () => {
      mockReader.setConfig({ detectedLanguage: null });

      const result = service.getPageLanguage(testDocument);

      expect(result).toBeNull();
    });
  });

  describe('factory function', () => {
    it('should create service instance', () => {
      const factoryService = createArticleExtractionService({ reader: mockReader });

      expect(factoryService).toBeInstanceOf(ArticleExtractionService);
    });
  });
});
