// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Article Zod Schemas
 *
 * Schemas for extracted article content from web pages.
 *
 * @module utils/schemas/article.schema
 */

import { z } from 'zod';

/**
 * Paragraph schema - Chunked content for TTS
 */
export const ParagraphSchema = z.object({
  /** 0-based position in article */
  index: z.number().int().nonnegative(),

  /** Paragraph text content */
  text: z.string().min(1),

  /** Character offset start in full content */
  startOffset: z.number().int().nonnegative(),

  /** Character offset end in full content */
  endOffset: z.number().int().nonnegative(),
});

export type Paragraph = z.infer<typeof ParagraphSchema>;

/**
 * Article schema - Extracted content from web page
 *
 * Content is transient (extracted on demand, not persisted).
 */
export const ArticleSchema = z.object({
  // Identity
  /** Canonical URL (without hash/query params) */
  url: z.string().url(),

  /** ISO 8601 extraction timestamp */
  extractedAt: z.string().datetime(),

  // Content
  /** Page title (from Readability or <title>) */
  title: z.string().min(1),

  /** Author info if available */
  byline: z.string().optional(),

  /** Site name if available */
  siteName: z.string().optional(),

  /** Full extracted text (HTML stripped) */
  content: z.string().min(1),

  /** Chunked paragraphs for TTS (at least 1) */
  paragraphs: z.array(ParagraphSchema).min(1),

  // Metadata
  /** Word count */
  length: z.number().int().nonnegative(),

  /** First ~150 chars excerpt */
  excerpt: z.string().optional(),

  /** Detected language code (e.g., 'en') */
  lang: z.string().min(2).max(5).optional(),
});

export type Article = z.infer<typeof ArticleSchema>;

/**
 * Estimate reading time for article
 *
 * @param wordCount - Number of words
 * @param wordsPerMinute - Reading speed (default 200 wpm)
 * @returns Estimated minutes
 */
export function estimateReadingTime(wordCount: number, wordsPerMinute = 200): number {
  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Split content into paragraphs
 *
 * @param content - Full text content
 * @returns Array of Paragraph objects
 */
export function splitIntoParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Split by double newlines or paragraph breaks
  const rawParagraphs = content.split(/\n\n+|\r\n\r\n+/).filter((p) => p.trim().length > 0);

  let offset = 0;
  for (let i = 0; i < rawParagraphs.length; i++) {
    const text = rawParagraphs[i].trim();

    // Find the actual position in the original content
    const startOffset = content.indexOf(text, offset);
    const endOffset = startOffset + text.length;

    paragraphs.push({
      index: i,
      text,
      startOffset,
      endOffset,
    });

    offset = endOffset;
  }

  return paragraphs;
}
