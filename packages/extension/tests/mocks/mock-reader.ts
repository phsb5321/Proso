/**
 * Mock Reader Implementation
 *
 * Mock implementation of IReader port for testing ArticleExtractionService.
 *
 * @module tests/mocks/mock-reader
 */

import type { IReader, ReaderError, ExtractionOptions } from '../../src/ports/reader.port';
import type { Article, Paragraph } from '../../src/utils/schemas/article.schema';
import type { Result } from '../../src/core/shared/result';
import { Ok, Err } from '../../src/core/shared/result';

/**
 * Configuration for MockReader behavior
 */
export interface MockReaderConfig {
  /** Article to return from extractArticle */
  mockArticle?: Article | null;
  /** Error to return from extractArticle (when shouldFail is true) */
  extractError?: ReaderError;
  /** Whether extractArticle should fail */
  shouldFailExtract?: boolean;
  /** Paragraphs to return from extractVisibleText */
  mockVisibleTextParagraphs?: Paragraph[];
  /** Error to return from extractVisibleText */
  visibleTextError?: ReaderError;
  /** Whether extractVisibleText should fail */
  shouldFailVisibleText?: boolean;
  /** Whether isArticlePage should return true */
  isArticle?: boolean;
  /** Language to return from detectLanguage */
  detectedLanguage?: string | null;
}

/**
 * Mock Reader for testing
 */
export class MockReader implements IReader {
  // Call tracking
  public extractArticleCalls: Array<{ document: Document; url: string; options?: ExtractionOptions }> = [];
  public extractVisibleTextCalls: Array<{ document: Document; url: string }> = [];
  public isArticlePageCalls: Document[] = [];
  public detectLanguageCalls: Document[] = [];

  // Configuration
  private config: MockReaderConfig;

  constructor(config: MockReaderConfig = {}) {
    this.config = {
      shouldFailExtract: false,
      shouldFailVisibleText: false,
      isArticle: true,
      detectedLanguage: 'en',
      mockVisibleTextParagraphs: [],
      ...config,
    };
  }

  async extractArticle(
    document: Document,
    url: string,
    options?: ExtractionOptions,
  ): Promise<Result<Article, ReaderError>> {
    this.extractArticleCalls.push({ document, url, options });

    if (this.config.shouldFailExtract) {
      return Err(
        this.config.extractError || {
          type: 'EXTRACTION_FAILED',
          message: 'Mock extraction failed',
        },
      );
    }

    if (this.config.mockArticle) {
      return Ok(this.config.mockArticle);
    }

    // Create default article (using schema type directly)
    const content = 'Test content paragraph.\n\nAnother paragraph.';
    const defaultArticle: Article = {
      url,
      extractedAt: new Date().toISOString(),
      title: document.title || 'Test Article',
      content,
      paragraphs: [
        { index: 0, text: 'Test content paragraph.', startOffset: 0, endOffset: 23 },
        { index: 1, text: 'Another paragraph.', startOffset: 25, endOffset: 43 },
      ],
      length: content.split(/\s+/).filter((w) => w.length > 0).length,
      excerpt: content.slice(0, 150),
      lang: this.config.detectedLanguage ?? undefined,
    };

    return Ok(defaultArticle);
  }

  async extractVisibleText(document: Document, url: string): Promise<Result<Paragraph[], ReaderError>> {
    this.extractVisibleTextCalls.push({ document, url });

    if (this.config.shouldFailVisibleText) {
      return Err(
        this.config.visibleTextError || {
          type: 'EXTRACTION_FAILED',
          message: 'Mock visible text extraction failed',
        },
      );
    }

    return Ok(this.config.mockVisibleTextParagraphs || []);
  }

  isArticlePage(document: Document): boolean {
    this.isArticlePageCalls.push(document);
    return this.config.isArticle ?? true;
  }

  detectLanguage(document: Document): string | null {
    this.detectLanguageCalls.push(document);
    // Return configured value - null is a valid value meaning "no language detected"
    return 'detectedLanguage' in this.config ? this.config.detectedLanguage ?? null : 'en';
  }

  // Test helpers
  reset(): void {
    this.extractArticleCalls = [];
    this.extractVisibleTextCalls = [];
    this.isArticlePageCalls = [];
    this.detectLanguageCalls = [];
  }

  setConfig(config: Partial<MockReaderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Factory function to create MockReader
 */
export function createMockReader(config: MockReaderConfig = {}): MockReader {
  return new MockReader(config);
}

/**
 * Helper to create test paragraphs
 */
export function createTestParagraphsForArticle(count: number, minLength = 50): Paragraph[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    text: `This is test paragraph ${i + 1}. `.repeat(Math.ceil(minLength / 25)),
    startOffset: i * 100,
    endOffset: i * 100 + minLength,
  }));
}
