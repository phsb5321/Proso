// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Reader Message Handlers
 *
 * Handles article extraction and paragraph retrieval messages.
 * Uses ArticleExtractionService for extraction logic.
 *
 * @module handlers/reader.handlers
 */

import type { HandlerRegistry } from './registry';
import { ReadabilityAdapter } from '../adapters/content/readability.adapter';
import {
  type ArticleExtractionService,
  createArticleExtractionService,
} from '../core/article/extraction.service';
import type { Article } from '../core/article/article.entity';
import { isErr } from '../core/shared/result';

/**
 * Cache for extracted articles by tab ID
 * Used to avoid re-extraction when getting paragraphs
 */
const articleCache = new Map<number, Article>();

/**
 * Get or create the article extraction service
 */
let extractionService: ArticleExtractionService | null = null;

function getExtractionService(): ArticleExtractionService {
  if (!extractionService) {
    extractionService = createArticleExtractionService({
      reader: new ReadabilityAdapter(),
    });
  }
  return extractionService;
}

/**
 * Clear cached article for a tab
 */
export function clearArticleCache(tabId: number): void {
  articleCache.delete(tabId);
}

/**
 * Get cached article for a tab
 */
export function getCachedArticle(tabId: number): Article | undefined {
  return articleCache.get(tabId);
}

/**
 * Register reader message handlers
 *
 * @param registry - Handler registry to register with
 */
export function registerReaderHandlers(registry: HandlerRegistry): void {
  /**
   * EXTRACT_ARTICLE - Extract article content from current page
   *
   * This is called from the content script context where we have access
   * to the document. The content script sends the HTML to the background.
   */
  registry.register('reader.extractArticle', async (params, sender) => {
    const tabId = sender?.tab?.id;

    if (!tabId) {
      return {
        success: false,
        error: 'No tab ID available',
      };
    }

    try {
      // The content script should send the document HTML
      const { html, url } = params as { html?: string; url?: string };

      if (!html) {
        // If no HTML provided, we need to request it from content script
        return {
          success: false,
          error: 'HTML content required for extraction',
          needsContentScript: true,
        };
      }

      // Parse HTML string to document
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Extract article
      const service = getExtractionService();
      const result = await service.extract(doc, url || 'unknown');

      if (isErr(result)) {
        return {
          success: false,
          error: result.error.message,
          errorType: result.error.type,
        };
      }

      const article = result.value;

      // Cache the article
      articleCache.set(tabId, article);

      return {
        success: true,
        article: {
          url: article.url,
          title: article.title,
          paragraphCount: article.paragraphs.length,
          wordCount: article.length,
          lang: article.lang,
          excerpt: article.excerpt,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ReaderHandlers] Extract article error:', message);
      return {
        success: false,
        error: message,
      };
    }
  });

  /**
   * GET_PARAGRAPHS - Get paragraphs for a tab's cached article
   */
  registry.register('reader.getParagraphs', async (params, sender) => {
    const tabId = (params as { tabId?: number })?.tabId || sender?.tab?.id;

    if (!tabId) {
      return {
        success: false,
        error: 'No tab ID available',
      };
    }

    const article = articleCache.get(tabId);

    if (!article) {
      return {
        success: false,
        error: 'No article cached for this tab',
        needsExtraction: true,
      };
    }

    return {
      success: true,
      paragraphs: article.paragraphs.map((p) => ({
        index: p.index,
        text: p.text,
        startOffset: p.startOffset,
        endOffset: p.endOffset,
      })),
      total: article.paragraphs.length,
    };
  });

  /**
   * GET_PARAGRAPH - Get a specific paragraph by index
   */
  registry.register('reader.getParagraph', async (params, sender) => {
    const { index, tabId: paramTabId } = params as { index: number; tabId?: number };
    const tabId = paramTabId || sender?.tab?.id;

    if (!tabId) {
      return {
        success: false,
        error: 'No tab ID available',
      };
    }

    const article = articleCache.get(tabId);

    if (!article) {
      return {
        success: false,
        error: 'No article cached for this tab',
        needsExtraction: true,
      };
    }

    if (index < 0 || index >= article.paragraphs.length) {
      return {
        success: false,
        error: `Paragraph index ${index} out of range (0-${article.paragraphs.length - 1})`,
      };
    }

    const paragraph = article.paragraphs[index];

    return {
      success: true,
      paragraph: {
        index: paragraph.index,
        text: paragraph.text,
        startOffset: paragraph.startOffset,
        endOffset: paragraph.endOffset,
      },
    };
  });

  /**
   * GET_ARTICLE_INFO - Get cached article metadata without paragraphs
   */
  registry.register('reader.getArticleInfo', async (params, sender) => {
    const tabId = (params as { tabId?: number })?.tabId || sender?.tab?.id;

    if (!tabId) {
      return {
        success: false,
        error: 'No tab ID available',
      };
    }

    const article = articleCache.get(tabId);

    if (!article) {
      return {
        success: false,
        hasArticle: false,
      };
    }

    return {
      success: true,
      hasArticle: true,
      info: {
        url: article.url,
        title: article.title,
        paragraphCount: article.paragraphs.length,
        wordCount: article.length,
        lang: article.lang,
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName,
      },
    };
  });

  /**
   * CLEAR_ARTICLE - Clear cached article for a tab
   */
  registry.register('reader.clearArticle', async (params, sender) => {
    const tabId = (params as { tabId?: number })?.tabId || sender?.tab?.id;

    if (!tabId) {
      return {
        success: false,
        error: 'No tab ID available',
      };
    }

    const hadArticle = articleCache.has(tabId);
    articleCache.delete(tabId);

    return {
      success: true,
      cleared: hadArticle,
    };
  });

  /**
   * IS_ARTICLE_PAGE - Check if current page is likely an article
   */
  registry.register('reader.isArticlePage', async (params) => {
    const { html } = params as { html?: string };

    if (!html) {
      return {
        success: false,
        error: 'HTML content required',
      };
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const service = getExtractionService();
      const isArticle = service.isArticlePage(doc);

      return {
        success: true,
        isArticle,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message,
      };
    }
  });

  console.log('[ReaderHandlers] Registered 6 reader handlers');
}

/**
 * Clean up handler for tab removal
 * Should be called when a tab is closed
 */
export function onTabRemoved(tabId: number): void {
  clearArticleCache(tabId);
}
