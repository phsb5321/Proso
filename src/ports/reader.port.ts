// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Reader Port Interface
 *
 * Defines the contract for extracting readable content from web pages.
 * Primary adapter: ReadabilityAdapter (Mozilla Readability)
 *
 * @module ports/reader
 */

import type { Result } from '../core/shared/result';
import type { Article, Paragraph } from '../utils/schemas/article.schema';

/**
 * Content extraction error types
 */
export type ReaderError =
  | { type: 'EXTRACTION_FAILED'; message: string }
  | { type: 'NO_CONTENT'; message: string }
  | { type: 'INVALID_URL'; message: string }
  | { type: 'PERMISSION_DENIED'; message: string };

/**
 * Options for content extraction
 */
export interface ExtractionOptions {
  /** Include images in extraction (default: false) */
  includeImages?: boolean;

  /** Minimum paragraph length to include (default: 20) */
  minParagraphLength?: number;

  /** Maximum number of paragraphs (default: unlimited) */
  maxParagraphs?: number;
}

/**
 * Port interface for reading web page content.
 *
 * Implementation:
 * - ReadabilityAdapter - Mozilla Readability-based extraction
 */
export interface IReader {
  /**
   * Extract article content from the current page.
   *
   * @param document - DOM document to extract from
   * @param url - Page URL for canonical reference
   * @param options - Extraction options
   * @returns Result with Article or error
   */
  extractArticle(
    document: Document,
    url: string,
    options?: ExtractionOptions,
  ): Promise<Result<Article, ReaderError>>;

  /**
   * Extract only visible text (fallback when Readability fails).
   *
   * @param document - DOM document
   * @param url - Page URL
   * @returns Result with paragraphs or error
   */
  extractVisibleText(
    document: Document,
    url: string,
  ): Promise<Result<Paragraph[], ReaderError>>;

  /**
   * Check if the page is likely to have readable article content.
   *
   * @param document - DOM document to analyze
   * @returns True if page appears to have article content
   */
  isArticlePage(document: Document): boolean;

  /**
   * Get the detected language of the page.
   *
   * @param document - DOM document
   * @returns BCP-47 language code or null
   */
  detectLanguage(document: Document): string | null;
}
