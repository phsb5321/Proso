// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Readability Adapter
 *
 * Implements IReader port using Mozilla Readability for article extraction.
 * Provides primary extraction via Readability and fallback via visible text.
 *
 * @module adapters/content/readability.adapter
 */

import type { Result } from '../../core/shared/result';
import { Ok, Err } from '../../core/shared/result';
import type { IReader, ReaderError, ExtractionOptions } from '../../ports/reader.port';
import type { Article } from '../../utils/schemas/article.schema';
import { ArticleSchema, splitIntoParagraphs, type Paragraph } from '../../utils/schemas/article.schema';

/**
 * Readability article result structure
 */
interface ReadabilityArticle {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline: string | null;
  dir: string | null;
  siteName: string | null;
  lang: string | null;
}

/**
 * Readability constructor options
 */
interface ReadabilityOptions {
  charThreshold?: number;
  keepClasses?: boolean;
}

/**
 * Global declarations for Readability library
 */
declare global {
  interface Window {
    Readability?: new (
      doc: Document,
      options?: ReadabilityOptions,
    ) => { parse: () => ReadabilityArticle | null };
    isProbablyReaderable?: (doc: Document) => boolean;
  }
}

/**
 * Minimum content length for valid extraction
 */
const MIN_CONTENT_LENGTH = 100;

/**
 * Default minimum paragraph length
 */
const DEFAULT_MIN_PARAGRAPH_LENGTH = 20;

/**
 * ReadabilityAdapter implements IReader port
 *
 * Uses Mozilla Readability for primary extraction.
 * Falls back to DOM-based visible text extraction.
 */
export class ReadabilityAdapter implements IReader {
  /**
   * Extract article content from the current page.
   *
   * @param document - DOM document to extract from
   * @param url - Page URL for canonical reference
   * @param options - Extraction options
   * @returns Result with Article or error
   */
  async extractArticle(
    document: Document,
    url: string,
    options?: ExtractionOptions,
  ): Promise<Result<Article, ReaderError>> {
    const minParagraphLength = options?.minParagraphLength ?? DEFAULT_MIN_PARAGRAPH_LENGTH;
    const maxParagraphs = options?.maxParagraphs;

    try {
      // Check if Readability is available
      if (typeof window === 'undefined' || !window.Readability) {
        return Err({
          type: 'EXTRACTION_FAILED',
          message: 'Readability library not available',
        });
      }

      // Clone document to avoid modifying original
      const docClone = document.cloneNode(true) as Document;

      // Remove unwanted elements
      this.removeUnwantedElements(docClone);

      // Create Readability instance and parse
      const reader = new window.Readability(docClone, {
        charThreshold: MIN_CONTENT_LENGTH,
        keepClasses: false,
      });

      const result = reader.parse();

      if (!result || !result.textContent || result.textContent.trim().length < MIN_CONTENT_LENGTH) {
        return Err({
          type: 'NO_CONTENT',
          message: 'Readability could not extract meaningful content',
        });
      }

      // Split content into paragraphs
      let paragraphs = splitIntoParagraphs(result.textContent);

      // Filter by minimum length
      paragraphs = paragraphs.filter((p) => p.text.length >= minParagraphLength);

      // Limit paragraphs if specified
      if (maxParagraphs && paragraphs.length > maxParagraphs) {
        paragraphs = paragraphs.slice(0, maxParagraphs);
      }

      if (paragraphs.length === 0) {
        return Err({
          type: 'NO_CONTENT',
          message: 'No paragraphs meet minimum length requirement',
        });
      }

      // Build content from filtered paragraphs
      const content = paragraphs.map((p) => p.text).join('\n\n');

      // Detect language
      const lang = this.detectLanguage(document) || undefined;

      // Create and validate article
      const article = ArticleSchema.parse({
        url: this.canonicalizeUrl(url),
        extractedAt: new Date().toISOString(),
        title: result.title || document.title || 'Untitled',
        content,
        paragraphs,
        length: content.split(/\s+/).filter((w) => w.length > 0).length,
        byline: result.byline || undefined,
        siteName: result.siteName || undefined,
        excerpt: result.excerpt || content.slice(0, 150),
        lang,
      });

      return Ok(article);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err({
        type: 'EXTRACTION_FAILED',
        message: `Readability extraction failed: ${message}`,
      });
    }
  }

  /**
   * Extract only visible text (fallback when Readability fails).
   *
   * @param document - DOM document
   * @param url - Page URL
   * @returns Result with paragraphs or error
   */
  async extractVisibleText(
    document: Document,
    _url: string,
  ): Promise<Result<Paragraph[], ReaderError>> {
    try {
      const body = document.body;
      if (!body) {
        return Err({
          type: 'NO_CONTENT',
          message: 'Document has no body element',
        });
      }

      // Find the best content container
      const container = this.findBestContentContainer(document) || body;

      // Extract paragraphs from container
      const paragraphs = this.extractParagraphsFromElement(container);

      if (paragraphs.length === 0) {
        return Err({
          type: 'NO_CONTENT',
          message: 'No visible text paragraphs found',
        });
      }

      return Ok(paragraphs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err({
        type: 'EXTRACTION_FAILED',
        message: `Visible text extraction failed: ${message}`,
      });
    }
  }

  /**
   * Check if the page is likely to have readable article content.
   *
   * @param document - DOM document to analyze
   * @returns True if page appears to have article content
   */
  isArticlePage(document: Document): boolean {
    // Use isProbablyReaderable if available
    if (typeof window !== 'undefined' && window.isProbablyReaderable) {
      return window.isProbablyReaderable(document);
    }

    // Fallback heuristic: check for article-like containers
    const articleSelectors = [
      'article',
      '[role="article"]',
      '.article',
      '.post',
      '.entry-content',
      '.post-content',
      'main',
      '#content',
      '.content',
    ];

    for (const selector of articleSelectors) {
      const el = document.querySelector(selector);
      if (el && (el.textContent?.length || 0) > MIN_CONTENT_LENGTH) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the detected language of the page.
   *
   * @param document - DOM document
   * @returns BCP-47 language code or null
   */
  detectLanguage(document: Document): string | null {
    // Try html lang attribute
    const htmlLang = document.documentElement?.lang;
    if (htmlLang) {
      return this.normalizeLanguageCode(htmlLang);
    }

    // Try meta tags
    const metaLang = document.querySelector('meta[http-equiv="content-language"]');
    if (metaLang) {
      const content = metaLang.getAttribute('content');
      if (content) {
        return this.normalizeLanguageCode(content);
      }
    }

    // Try og:locale
    const ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) {
      const content = ogLocale.getAttribute('content');
      if (content) {
        // og:locale uses underscore (en_US)
        return this.normalizeLanguageCode(content.replace('_', '-'));
      }
    }

    return null;
  }

  /**
   * Find the best content container in the document
   */
  private findBestContentContainer(document: Document): Element | null {
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.article-content',
      '.entry-content',
      '.post-content',
      '#wiki-content-block',
      '.wiki-content',
      '#mw-content-text',
      '.mw-parser-output',
      '#content',
      '.content',
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && (el.textContent?.length || 0) > MIN_CONTENT_LENGTH) {
        return el;
      }
    }

    return null;
  }

  /**
   * Extract paragraphs from a DOM element
   */
  private extractParagraphsFromElement(element: Element): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const seenTexts = new Set<string>();

    // Get paragraph-like elements
    const candidates = element.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, li, blockquote, [class*="paragraph"]',
    );

    let index = 0;
    let offset = 0;

    for (const el of candidates) {
      const text = el.textContent?.trim() || '';

      // Skip short paragraphs
      if (text.length < DEFAULT_MIN_PARAGRAPH_LENGTH) {
        continue;
      }

      // Skip duplicates
      const normalizedText = text.toLowerCase().substring(0, 100);
      if (seenTexts.has(normalizedText)) {
        continue;
      }
      seenTexts.add(normalizedText);

      // Skip navigation-like content
      if (this.isNavigationLike(el, text)) {
        continue;
      }

      paragraphs.push({
        index,
        text,
        startOffset: offset,
        endOffset: offset + text.length,
      });

      offset += text.length + 2; // +2 for newline separator
      index++;
    }

    return paragraphs;
  }

  /**
   * Check if element/text is navigation-like
   */
  private isNavigationLike(el: Element, text: string): boolean {
    // Check parent elements for nav patterns
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const classId = ((parent.className || '') + ' ' + (parent.id || '')).toLowerCase();
      if (
        classId.includes('nav') ||
        classId.includes('menu') ||
        classId.includes('sidebar') ||
        classId.includes('footer') ||
        classId.includes('header') ||
        classId.includes('comment')
      ) {
        return true;
      }
      parent = parent.parentElement;
    }

    // Check for high link density
    const links = el.querySelectorAll('a');
    let linkTextLength = 0;
    for (const link of links) {
      linkTextLength += link.textContent?.length || 0;
    }
    if (linkTextLength > text.length * 0.5) {
      return true;
    }

    return false;
  }

  /**
   * Remove unwanted elements from document
   */
  private removeUnwantedElements(doc: Document): void {
    const unwantedSelectors = [
      'script',
      'style',
      'noscript',
      'iframe',
      'svg',
      'nav',
      'header',
      'footer',
      'aside',
      '.nav',
      '.navigation',
      '.menu',
      '.sidebar',
      '.advertisement',
      '.ad',
      '.ads',
      '.social-share',
      '.comments',
      '.related',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="complementary"]',
      '.toc',
      '.table-of-contents',
      '.infobox',
      '.navbox',
      '.mw-editsection',
      '.reference',
      '.references',
    ];

    for (const selector of unwantedSelectors) {
      try {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
      } catch {
        // Ignore selector errors
      }
    }
  }

  /**
   * Canonicalize URL
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

  /**
   * Normalize language code to BCP-47 format
   */
  private normalizeLanguageCode(code: string): string {
    // Extract primary language tag
    const primary = code.split('-')[0].toLowerCase();
    return primary;
  }
}
