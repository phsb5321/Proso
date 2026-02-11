/**
 * Readability Extractor Adapter
 *
 * Adapter that implements ITextExtractor using Mozilla Readability.
 * Wraps the existing content extraction utilities.
 *
 * @module adapters/content/readability-extractor
 */

import type { ContentExtractionError, ExtractionMode } from '../../core/shared/errors';
import { contentError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type { ExtractedContent, ITextExtractor, Paragraph } from '../../ports/text-extractor.port';

/**
 * Readability article result structure.
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
 * Readability constructor options.
 */
interface ReadabilityOptions {
  charThreshold?: number;
  keepClasses?: boolean;
}

/**
 * Global declarations for Readability library.
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
 * Minimum character count for a meaningful paragraph.
 */
const MIN_PARAGRAPH_LENGTH = 20;

/**
 * Minimum total characters for valid content.
 */
const MIN_CONTENT_LENGTH = 100;

/**
 * Adapter that implements ITextExtractor using Mozilla Readability.
 *
 * This adapter wraps the existing content extraction logic and provides
 * a clean interface for the hexagonal architecture.
 */
export class ReadabilityExtractorAdapter implements ITextExtractor {
  public readonly extractorId = 'readability';

  /**
   * Extract readable text from document/selection.
   *
   * @param mode - Extraction mode (selection, article, full)
   * @param document - Document object or HTML string
   * @returns Result with extracted content or error
   */
  async extract(
    mode: ExtractionMode,
    documentOrHtml: Document | string,
  ): Promise<Result<ExtractedContent, ContentExtractionError>> {
    const startTime = performance.now();

    try {
      // Parse HTML string to Document if needed
      const doc =
        typeof documentOrHtml === 'string'
          ? this.parseHtmlToDocument(documentOrHtml)
          : documentOrHtml;

      // Get source URL
      const sourceUrl =
        typeof documentOrHtml === 'string' ? 'html-string' : doc.location?.href || 'unknown';

      // Extract based on mode
      let result: { paragraphs: Paragraph[]; title: string | null };

      switch (mode) {
        case 'selection':
          result = this.extractSelection(doc);
          break;
        case 'article':
          result = this.extractArticle(doc);
          break;
        case 'full':
          result = this.extractFullPage(doc);
          break;
        default:
          result = this.extractArticle(doc);
      }

      // Validate we got meaningful content
      if (result.paragraphs.length === 0) {
        return Err(contentError.noReadableContent());
      }

      const totalCharacters = result.paragraphs.reduce((sum, p) => sum + p.characterCount, 0);

      if (totalCharacters < MIN_CONTENT_LENGTH) {
        return Err(contentError.noReadableContent());
      }

      const extractionTimeMs = performance.now() - startTime;

      return Ok({
        paragraphs: result.paragraphs,
        totalCharacters,
        extractionTimeMs,
        sourceUrl,
        title: result.title,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(contentError.extractionFailed(message));
    }
  }

  /**
   * Check if this extractor can handle the content type.
   *
   * @param contentType - MIME type
   * @param url - Optional URL for additional detection
   */
  canHandle(contentType: string, url?: string): boolean {
    // Handle HTML content types
    const htmlTypes = ['text/html', 'application/xhtml+xml', 'text/xml'];

    if (htmlTypes.includes(contentType)) {
      return true;
    }

    // Check URL extension as fallback
    if (url) {
      const htmlExtensions = ['.html', '.htm', '.xhtml'];
      const urlLower = url.toLowerCase();
      if (htmlExtensions.some((ext) => urlLower.endsWith(ext))) {
        return true;
      }

      // Assume HTML for URLs without extension
      if (!urlLower.match(/\.\w{2,5}$/)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parse HTML string to Document.
   */
  private parseHtmlToDocument(html: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  /**
   * Extract selected text from document.
   */
  private extractSelection(_doc: Document): { paragraphs: Paragraph[]; title: string | null } {
    // Note: In a real browser context, this would use window.getSelection()
    // For now, return empty as selection requires browser runtime
    // The content script should handle selection extraction
    return { paragraphs: [], title: null };
  }

  /**
   * Extract article content using Mozilla Readability.
   */
  private extractArticle(doc: Document): { paragraphs: Paragraph[]; title: string | null } {
    // Try Readability first (if available in browser context)
    if (typeof window !== 'undefined' && window.Readability) {
      const readabilityResult = this.tryReadability(doc);
      if (readabilityResult) {
        return readabilityResult;
      }
    }

    // Fallback to heuristic extraction
    return this.extractWithHeuristics(doc);
  }

  /**
   * Extract full page content.
   */
  private extractFullPage(doc: Document): { paragraphs: Paragraph[]; title: string | null } {
    const body = doc.body;
    if (!body) {
      return { paragraphs: [], title: doc.title || null };
    }

    const paragraphs = this.extractParagraphsFromElement(body);
    return {
      paragraphs,
      title: doc.title || null,
    };
  }

  /**
   * Try to extract using Mozilla Readability.
   */
  private tryReadability(doc: Document): { paragraphs: Paragraph[]; title: string | null } | null {
    try {
      if (!window.Readability) {
        return null;
      }

      // Clone document to avoid modifying original
      const docClone = doc.cloneNode(true) as Document;

      // Pre-filter unwanted elements
      this.removeUnwantedElements(docClone);

      const reader = new window.Readability(docClone, {
        charThreshold: 100,
        keepClasses: false,
      });

      const article = reader.parse();

      if (
        !article ||
        !article.textContent ||
        article.textContent.trim().length < MIN_CONTENT_LENGTH
      ) {
        return null;
      }

      // Parse article content to extract paragraphs
      const tempDiv = doc.createElement('div');
      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(article.content, 'text/html');

      while (parsedDoc.body.firstChild) {
        tempDiv.appendChild(parsedDoc.body.firstChild);
      }

      const paragraphs = this.extractParagraphsFromElement(tempDiv);

      return {
        paragraphs,
        title: article.title || null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract content using heuristics (fallback).
   */
  private extractWithHeuristics(doc: Document): { paragraphs: Paragraph[]; title: string | null } {
    // Try common content selectors
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
    ];

    let container: Element | null = null;

    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el && (el.textContent?.length || 0) > MIN_CONTENT_LENGTH) {
        container = el;
        break;
      }
    }

    if (!container) {
      container = doc.body;
    }

    const paragraphs = this.extractParagraphsFromElement(container);

    return {
      paragraphs,
      title: doc.title || null,
    };
  }

  /**
   * Extract paragraphs from a DOM element.
   */
  private extractParagraphsFromElement(element: Element): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const seenTexts = new Set<string>();

    // Get paragraph-like elements
    const candidates = element.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

    let index = 0;

    for (const el of candidates) {
      const text = el.textContent?.trim() || '';

      // Skip short paragraphs
      if (text.length < MIN_PARAGRAPH_LENGTH) {
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

      // Determine paragraph type
      const type = this.getParagraphType(el);

      paragraphs.push({
        text,
        index,
        type,
        characterCount: text.length,
      });

      index++;
    }

    return paragraphs;
  }

  /**
   * Check if element/text is navigation-like.
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
        classId.includes('header')
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
   * Determine paragraph type based on element tag.
   */
  private getParagraphType(el: Element): 'paragraph' | 'heading' | 'list' {
    const tag = el.tagName.toUpperCase();

    if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
      return 'heading';
    }

    if (tag === 'LI') {
      return 'list';
    }

    return 'paragraph';
  }

  /**
   * Remove unwanted elements from document.
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
}
