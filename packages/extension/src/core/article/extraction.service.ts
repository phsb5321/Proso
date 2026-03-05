// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Article Extraction Service
 *
 * Domain service for extracting readable content from web pages.
 * Uses IReader port for actual extraction (Readability adapter).
 * Implements FR-006 fallback extraction when Readability fails.
 *
 * @module core/article/extraction.service
 */

import type { IReader, ReaderError } from '../../ports/reader.port';
import type { Result } from '../shared/result';
import { Err, Ok, isErr } from '../shared/result';
import type { Article } from './article.entity';
import { createArticle } from './article.entity';

/**
 * Extraction error types
 */
export type ArticleExtractionError =
  | { type: 'NO_CONTENT'; message: string }
  | { type: 'EXTRACTION_FAILED'; message: string }
  | { type: 'PERMISSION_DENIED'; message: string };

/**
 * Service dependencies
 */
export interface ArticleExtractionServiceDeps {
  /** Reader port implementation (e.g., ReadabilityAdapter) */
  reader: IReader;
}

/**
 * Extraction options
 */
export interface ExtractionOptions {
  /** Minimum paragraph length to include */
  minParagraphLength?: number;
  /** Maximum number of paragraphs */
  maxParagraphs?: number;
  /** Force fallback extraction (skip Readability) */
  forceFallback?: boolean;
}

/**
 * Default extraction options
 */
const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  minParagraphLength: 20,
  maxParagraphs: 500,
  forceFallback: false,
};

/**
 * ArticleExtractionService
 *
 * Orchestrates article extraction from web pages.
 * Tries Readability first, falls back to visible text extraction (FR-006).
 */
export class ArticleExtractionService {
  private readonly reader: IReader;

  constructor(deps: ArticleExtractionServiceDeps) {
    this.reader = deps.reader;
  }

  /**
   * Extract article content from a document.
   *
   * @param document - DOM Document to extract from
   * @param url - Page URL for canonical reference
   * @param options - Extraction options
   * @returns Result with Article or error
   */
  async extract(
    document: Document,
    url: string,
    options: ExtractionOptions = {},
  ): Promise<Result<Article, ArticleExtractionError>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Try primary extraction (Readability) unless forced to fallback
    if (!opts.forceFallback) {
      const primaryResult = await this.reader.extractArticle(document, url, {
        minParagraphLength: opts.minParagraphLength,
        maxParagraphs: opts.maxParagraphs,
      });

      if (!isErr(primaryResult)) {
        return Ok(primaryResult.value);
      }

      // Log the primary extraction failure for debugging
      console.log(
        '[ArticleExtractionService] Primary extraction failed, trying fallback:',
        primaryResult.error,
      );
    }

    // FR-006: Fallback to visible text extraction
    return this.extractFallback(document, url, opts);
  }

  /**
   * FR-006: Fallback extraction using visible text when Readability fails.
   *
   * This method extracts visible text directly from the DOM,
   * filtering out navigation, ads, and other non-content elements.
   *
   * @param document - DOM Document
   * @param url - Page URL
   * @param options - Extraction options
   */
  private async extractFallback(
    document: Document,
    url: string,
    options: Required<ExtractionOptions>,
  ): Promise<Result<Article, ArticleExtractionError>> {
    try {
      // Use reader's fallback extraction
      const fallbackResult = await this.reader.extractVisibleText(document, url);

      if (isErr(fallbackResult)) {
        return Err(this.mapReaderError(fallbackResult.error));
      }

      const paragraphs = fallbackResult.value;

      if (paragraphs.length === 0) {
        return Err({
          type: 'NO_CONTENT',
          message: 'No readable content found on page',
        });
      }

      // Filter paragraphs by minimum length
      const filteredParagraphs = paragraphs.filter(
        (p) => p.text.length >= options.minParagraphLength,
      );

      // Limit to max paragraphs
      const limitedParagraphs = filteredParagraphs.slice(0, options.maxParagraphs);

      if (limitedParagraphs.length === 0) {
        return Err({
          type: 'NO_CONTENT',
          message: 'No paragraphs meet minimum length requirement',
        });
      }

      // Build full content from paragraphs
      const content = limitedParagraphs.map((p) => p.text).join('\n\n');

      // Get page title
      const title = document.title || 'Untitled Page';

      // Detect language
      const lang = this.reader.detectLanguage(document) || undefined;

      // Create article entity
      const article = createArticle({
        url: this.canonicalizeUrl(url),
        title,
        content,
        paragraphs: limitedParagraphs,
        lang,
      });

      return Ok(article);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err({
        type: 'EXTRACTION_FAILED',
        message: `Fallback extraction failed: ${message}`,
      });
    }
  }

  /**
   * Check if the page is likely to have article content.
   *
   * @param document - DOM Document to analyze
   */
  isArticlePage(document: Document): boolean {
    return this.reader.isArticlePage(document);
  }

  /**
   * Get detected language for the page.
   *
   * @param document - DOM Document
   * @returns BCP-47 language code or null
   */
  getPageLanguage(document: Document): string | null {
    return this.reader.detectLanguage(document);
  }

  /**
   * Map ReaderError to ArticleExtractionError
   */
  private mapReaderError(error: ReaderError): ArticleExtractionError {
    switch (error.type) {
      case 'NO_CONTENT':
        return { type: 'NO_CONTENT', message: error.message };
      case 'PERMISSION_DENIED':
        return { type: 'PERMISSION_DENIED', message: error.message };
      case 'EXTRACTION_FAILED':
      case 'INVALID_URL':
      default:
        return { type: 'EXTRACTION_FAILED', message: error.message };
    }
  }

  /**
   * Canonicalize URL by removing hash and normalizing
   */
  private canonicalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      urlObj.hash = '';
      return urlObj.toString();
    } catch {
      return url;
    }
  }
}

/**
 * Factory function to create ArticleExtractionService
 */
export function createArticleExtractionService(
  deps: ArticleExtractionServiceDeps,
): ArticleExtractionService {
  return new ArticleExtractionService(deps);
}
