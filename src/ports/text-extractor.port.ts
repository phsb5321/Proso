/**
 * Text Extractor Port Interface
 *
 * Defines the contract for text extraction strategies.
 * Adapters: Readability (HTML), PDF (future)
 *
 * @module ports/text-extractor
 */

import type { ContentExtractionError, ExtractionMode } from '../core/shared/errors';
import type { Result } from '../core/shared/result';

/**
 * Extracted paragraph with metadata.
 */
export interface Paragraph {
  readonly text: string;
  readonly index: number;
  readonly type: 'paragraph' | 'heading' | 'list';
  readonly characterCount: number;
}

/**
 * Result of content extraction.
 */
export interface ExtractedContent {
  readonly paragraphs: readonly Paragraph[];
  readonly totalCharacters: number;
  readonly extractionTimeMs: number;
  readonly sourceUrl: string;
  readonly title: string | null;
}

/**
 * Port interface for text extraction strategies.
 *
 * Implementations:
 * - ReadabilityExtractorAdapter - Mozilla Readability
 * - PDFExtractorAdapter - pdfjs-dist (future)
 */
export interface ITextExtractor {
  /**
   * Extract readable text from document/selection.
   * @param mode - Extraction mode (selection, article, full)
   * @param document - Document object or HTML string
   * @returns Result with extracted content or error
   */
  extract(
    mode: ExtractionMode,
    document: Document | string,
  ): Promise<Result<ExtractedContent, ContentExtractionError>>;

  /**
   * Check if this extractor can handle the content type.
   * @param contentType - MIME type
   * @param url - Optional URL for additional detection
   */
  canHandle(contentType: string, url?: string): boolean;

  /**
   * Extractor identifier.
   */
  readonly extractorId: string;
}
