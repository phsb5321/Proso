/**
 * Mock Text Extractor
 *
 * Mock implementation of ITextExtractor for testing.
 * Allows configurable extraction results for unit tests.
 *
 * @module tests/mocks/mock-text-extractor
 */

import type { ITextExtractor, ExtractedContent, Paragraph } from '../../src/ports/text-extractor.port';
import type { Result } from '../../src/core/shared/result';
import type { ContentExtractionError, ExtractionMode } from '../../src/core/shared/errors';
import { Ok, Err } from '../../src/core/shared/result';

/**
 * Configuration for MockTextExtractor behavior.
 */
export interface MockTextExtractorConfig {
  /** Default content to return on extract() */
  defaultContent?: ExtractedContent;

  /** Content to return for specific modes */
  contentByMode?: Partial<Record<ExtractionMode, ExtractedContent>>;

  /** Force specific error on extract() */
  forceError?: ContentExtractionError;

  /** Delay before returning (simulates processing time) */
  extractionDelayMs?: number;

  /** Content types this extractor can handle */
  supportedContentTypes?: string[];

  /** Custom extractor ID */
  extractorId?: string;
}

/**
 * Default content for testing.
 */
const DEFAULT_CONTENT: ExtractedContent = {
  paragraphs: [
    { text: 'First test paragraph with meaningful content.', index: 0, type: 'paragraph', characterCount: 45 },
    { text: 'Second test paragraph with more content.', index: 1, type: 'paragraph', characterCount: 41 },
    { text: 'Third test paragraph.', index: 2, type: 'paragraph', characterCount: 21 },
  ],
  totalCharacters: 107,
  extractionTimeMs: 5,
  sourceUrl: 'https://example.com/test',
  title: 'Test Article',
};

/**
 * Mock implementation of ITextExtractor for testing.
 */
export class MockTextExtractor implements ITextExtractor {
  public readonly extractorId: string;
  private config: MockTextExtractorConfig;

  // Tracking for assertions
  public extractCalls: Array<{ mode: ExtractionMode; document: Document | string }> = [];
  public canHandleCalls: Array<{ contentType: string; url?: string }> = [];

  constructor(config: MockTextExtractorConfig = {}) {
    this.config = config;
    this.extractorId = config.extractorId || 'mock';
  }

  /**
   * Configure mock behavior.
   */
  configure(config: Partial<MockTextExtractorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset call tracking.
   */
  reset(): void {
    this.extractCalls = [];
    this.canHandleCalls = [];
  }

  /**
   * Set content to return for next extract() call.
   */
  setContent(content: ExtractedContent): void {
    this.config.defaultContent = content;
  }

  /**
   * Set error to return for next extract() call.
   */
  setError(error: ContentExtractionError): void {
    this.config.forceError = error;
  }

  /**
   * Clear any forced error.
   */
  clearError(): void {
    this.config.forceError = undefined;
  }

  async extract(
    mode: ExtractionMode,
    document: Document | string
  ): Promise<Result<ExtractedContent, ContentExtractionError>> {
    // Track call
    this.extractCalls.push({ mode, document });

    // Simulate processing delay if configured
    if (this.config.extractionDelayMs) {
      await new Promise(resolve => setTimeout(resolve, this.config.extractionDelayMs));
    }

    // Return error if configured
    if (this.config.forceError) {
      return Err(this.config.forceError);
    }

    // Return mode-specific content if available
    if (this.config.contentByMode?.[mode]) {
      return Ok(this.config.contentByMode[mode]);
    }

    // Return default content
    const content = this.config.defaultContent || DEFAULT_CONTENT;

    // Update extraction time
    const startTime = performance.now();
    const result: ExtractedContent = {
      ...content,
      extractionTimeMs: performance.now() - startTime,
    };

    return Ok(result);
  }

  canHandle(contentType: string, url?: string): boolean {
    // Track call
    this.canHandleCalls.push({ contentType, url });

    // Use configured content types or default to text/html
    const supportedTypes = this.config.supportedContentTypes || ['text/html'];
    return supportedTypes.includes(contentType);
  }
}

/**
 * Create a mock text extractor with default configuration.
 */
export function createMockTextExtractor(
  config?: MockTextExtractorConfig
): MockTextExtractor {
  return new MockTextExtractor(config);
}

/**
 * Create test paragraphs with sequential indices.
 */
export function createTestParagraphs(texts: string[]): Paragraph[] {
  return texts.map((text, index) => ({
    text,
    index,
    type: 'paragraph' as const,
    characterCount: text.length,
  }));
}

/**
 * Create a test ExtractedContent object.
 */
export function createTestExtractedContent(
  paragraphs: Paragraph[],
  sourceUrl = 'https://example.com/test',
  title: string | null = 'Test Article'
): ExtractedContent {
  return {
    paragraphs,
    totalCharacters: paragraphs.reduce((sum, p) => sum + p.characterCount, 0),
    extractionTimeMs: 5,
    sourceUrl,
    title,
  };
}
