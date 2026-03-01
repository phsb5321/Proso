// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Article Entity and Paragraph Interface
 *
 * Core domain entities for extracted article content.
 * These are transient (extracted on demand, not persisted).
 *
 * @module core/article/article.entity
 */

import { ArticleSchema, ParagraphSchema, type Paragraph } from '../../utils/schemas/article.schema';

// Re-export Paragraph type for convenience
export type { Paragraph };

/**
 * Article entity - Extracted content from a web page
 *
 * Immutable value object representing the extracted article.
 * Created by ArticleExtractionService.
 */
export interface Article {
  /** Canonical URL (without hash/query params) */
  readonly url: string;

  /** ISO 8601 extraction timestamp */
  readonly extractedAt: string;

  /** Page title (from Readability or <title>) */
  readonly title: string;

  /** Author info if available */
  readonly byline?: string;

  /** Site name if available */
  readonly siteName?: string;

  /** Full extracted text (HTML stripped) */
  readonly content: string;

  /** Chunked paragraphs for TTS */
  readonly paragraphs: readonly Paragraph[];

  /** Word count */
  readonly length: number;

  /** First ~150 chars excerpt */
  readonly excerpt?: string;

  /** Detected language code (e.g., 'en') */
  readonly lang?: string;
}

/**
 * Create a validated Article from extraction results
 *
 * @param params - Article creation parameters
 * @returns Validated Article entity
 * @throws ZodError if validation fails
 */
export function createArticle(params: {
  url: string;
  title: string;
  content: string;
  paragraphs: Paragraph[];
  byline?: string;
  siteName?: string;
  excerpt?: string;
  lang?: string;
}): Article {
  const now = new Date().toISOString();

  // Calculate word count
  const length = params.content.split(/\s+/).filter((w) => w.length > 0).length;

  // Validate and create article
  const article = ArticleSchema.parse({
    url: params.url,
    extractedAt: now,
    title: params.title,
    content: params.content,
    paragraphs: params.paragraphs,
    length,
    byline: params.byline,
    siteName: params.siteName,
    excerpt: params.excerpt || params.content.slice(0, 150),
    lang: params.lang,
  });

  return article;
}

/**
 * Create a Paragraph entity
 *
 * @param index - 0-based position in article
 * @param text - Paragraph text content
 * @param startOffset - Character offset start in full content
 * @param endOffset - Character offset end in full content
 * @returns Validated Paragraph entity
 */
export function createParagraph(
  index: number,
  text: string,
  startOffset: number,
  endOffset: number,
): Paragraph {
  return ParagraphSchema.parse({
    index,
    text,
    startOffset,
    endOffset,
  });
}

/**
 * Get the total character count of an article
 */
export function getArticleCharacterCount(article: Article): number {
  return article.paragraphs.reduce((sum, p) => sum + p.text.length, 0);
}

/**
 * Get estimated reading time in minutes
 *
 * @param article - Article to calculate reading time for
 * @param wordsPerMinute - Reading speed (default 200 wpm)
 */
export function getEstimatedReadingTime(article: Article, wordsPerMinute = 200): number {
  return Math.ceil(article.length / wordsPerMinute);
}

/**
 * Get estimated TTS duration in seconds
 *
 * @param article - Article to calculate TTS duration for
 * @param wordsPerMinute - Speaking speed (default 150 wpm for TTS)
 */
export function getEstimatedTTSDuration(article: Article, wordsPerMinute = 150): number {
  return Math.ceil((article.length / wordsPerMinute) * 60);
}
