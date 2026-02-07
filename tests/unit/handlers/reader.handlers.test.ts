/**
 * Reader Handlers Unit Tests
 *
 * Tests all 6 reader handler functions:
 *   - reader.extractArticle
 *   - reader.getParagraphs
 *   - reader.getParagraph
 *   - reader.getArticleInfo
 *   - reader.clearArticle
 *   - reader.isArticlePage
 *
 * Uses ESM mocking via jest.unstable_mockModule for adapters and services.
 * Handlers take (params, sender) — sender carries tab info for tab ID resolution.
 *
 * @module tests/unit/handlers/reader.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Article } from '../../../src/core/article/article.entity';
import type { Result } from '../../../src/core/shared/result';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// ============================================
// Mock extraction service instance
// ============================================

const mockExtract = jest.fn<
  (doc: Document, url: string) => Promise<Result<Article, { type: string; message: string }>>
>();
const mockIsArticlePage = jest.fn<(doc: Document) => boolean>();

const mockExtractionService = {
  extract: mockExtract,
  isArticlePage: mockIsArticlePage,
};

// ============================================
// ESM Mocks — must precede dynamic imports
// ============================================

jest.unstable_mockModule(resolve(srcDir, 'adapters/content/readability.adapter'), () => ({
  ReadabilityAdapter: jest.fn(),
}));

jest.unstable_mockModule(resolve(srcDir, 'core/article/extraction.service'), () => ({
  ArticleExtractionService: jest.fn(),
  createArticleExtractionService: jest.fn(() => mockExtractionService),
}));

// Dynamic imports after mock registration
const { registerReaderHandlers, clearArticleCache, getCachedArticle, onTabRemoved } =
  await import('../../../src/handlers/reader.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ============================================
// Test fixtures
// ============================================

function createTestArticle(overrides: Partial<Article> = {}): Article {
  return {
    url: 'https://example.com/article',
    extractedAt: '2026-01-15T00:00:00.000Z',
    title: 'Test Article',
    content: 'First paragraph text.\n\nSecond paragraph text.',
    paragraphs: [
      { index: 0, text: 'First paragraph text.', startOffset: 0, endOffset: 21 },
      { index: 1, text: 'Second paragraph text.', startOffset: 23, endOffset: 45 },
    ],
    length: 6,
    excerpt: 'First paragraph text.',
    lang: 'en',
    byline: 'Test Author',
    siteName: 'Example.com',
    ...overrides,
  };
}

/**
 * Create a mock sender object matching browser.runtime.MessageSender shape.
 * Reader handlers use sender?.tab?.id to resolve the tab ID.
 */
function createSender(tabId?: number) {
  if (tabId === undefined) return undefined;
  return { tab: { id: tabId } };
}

/**
 * Invoke a registered handler directly with both params and sender.
 *
 * registry.dispatch() only passes params (sender is lost). To test
 * sender-based tab ID resolution we retrieve the handler entry and
 * call the underlying function directly.
 */
async function invokeHandler(
  registry: InstanceType<typeof HandlerRegistry>,
  name: string,
  params: unknown,
  sender?: unknown,
): Promise<unknown> {
  const entry = registry.get(name);
  if (!entry) throw new Error(`Handler '${name}' not registered`);
  // The handler fn signature is (params, sender?) even though the type only declares params
  return (entry.handler as (p: unknown, s: unknown) => Promise<unknown>)(params, sender);
}

// ============================================
// Tests
// ============================================

describe('Reader Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerReaderHandlers(registry);

    // Clear module-level article cache between tests
    clearArticleCache(1);
    clearArticleCache(2);
    clearArticleCache(42);
    clearArticleCache(99);

    jest.clearAllMocks();
  });

  // ------------------------------------------
  // Registration
  // ------------------------------------------

  describe('registration', () => {
    it('should register all 6 reader handlers', () => {
      expect(registry.has('reader.extractArticle')).toBe(true);
      expect(registry.has('reader.getParagraphs')).toBe(true);
      expect(registry.has('reader.getParagraph')).toBe(true);
      expect(registry.has('reader.getArticleInfo')).toBe(true);
      expect(registry.has('reader.clearArticle')).toBe(true);
      expect(registry.has('reader.isArticlePage')).toBe(true);
      expect(registry.size).toBeGreaterThanOrEqual(6);
    });
  });

  // ------------------------------------------
  // reader.extractArticle
  // ------------------------------------------

  describe('reader.extractArticle', () => {
    const sampleHtml = '<html><head><title>Test</title></head><body><p>Hello world</p></body></html>';

    it('should extract article and return summary on success', async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });

      const result = (await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: sampleHtml, url: 'https://example.com/article' },
        createSender(42),
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.article).toEqual({
        url: article.url,
        title: article.title,
        paragraphCount: article.paragraphs.length,
        wordCount: article.length,
        lang: article.lang,
        excerpt: article.excerpt,
      });
    });

    it('should cache the extracted article by tab ID', async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });

      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: sampleHtml, url: 'https://example.com/article' },
        createSender(42),
      );

      expect(getCachedArticle(42)).toBe(article);
    });

    it('should return error when no tab ID available', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: sampleHtml },
        undefined, // no sender
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No tab ID available');
    });

    it('should return error when no HTML provided', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.extractArticle',
        {}, // no html
        createSender(42),
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTML content required for extraction');
      expect(result.needsContentScript).toBe(true);
    });

    it('should return error when extraction service fails', async () => {
      mockExtract.mockResolvedValue({
        ok: false,
        error: { type: 'NO_CONTENT', message: 'No readable content found' },
      });

      const result = (await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: sampleHtml, url: 'https://example.com/empty' },
        createSender(42),
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No readable content found');
      expect(result.errorType).toBe('NO_CONTENT');
    });

    it('should handle exceptions thrown by extraction service', async () => {
      mockExtract.mockRejectedValue(new Error('DOMParser crashed'));

      const result = (await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: sampleHtml },
        createSender(42),
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOMParser crashed');
    });

    it('should use "unknown" as default URL when url param is missing', async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });

      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: sampleHtml }, // no url
        createSender(42),
      );

      expect(mockExtract).toHaveBeenCalledWith(expect.any(Object), 'unknown');
    });
  });

  // ------------------------------------------
  // reader.getParagraphs
  // ------------------------------------------

  describe('reader.getParagraphs', () => {
    it('should return all paragraphs for a cached article', async () => {
      const article = createTestArticle();
      // Seed cache by extracting first
      mockExtract.mockResolvedValue({ ok: true, value: article });
      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: '<html><body>x</body></html>', url: 'https://example.com' },
        createSender(1),
      );

      const result = (await invokeHandler(
        registry,
        'reader.getParagraphs',
        { tabId: 1 },
        createSender(1),
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      const paragraphs = result.paragraphs as Array<Record<string, unknown>>;
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0]).toEqual({
        index: 0,
        text: 'First paragraph text.',
        startOffset: 0,
        endOffset: 21,
      });
    });

    it('should return error when no article cached for tab', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getParagraphs',
        { tabId: 999 },
        createSender(999),
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No article cached for this tab');
      expect(result.needsExtraction).toBe(true);
    });

    it('should return error when no tab ID available', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getParagraphs',
        {}, // no tabId in params
        undefined, // no sender
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No tab ID available');
    });

    it('should resolve tab ID from sender when not in params', async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });
      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: '<html><body>x</body></html>', url: 'https://example.com' },
        createSender(2),
      );

      const result = (await invokeHandler(
        registry,
        'reader.getParagraphs',
        {}, // no tabId — must fall back to sender
        createSender(2),
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
    });
  });

  // ------------------------------------------
  // reader.getParagraph
  // ------------------------------------------

  describe('reader.getParagraph', () => {
    beforeEach(async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });
      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: '<html><body>x</body></html>', url: 'https://example.com' },
        createSender(1),
      );
    });

    it('should return a specific paragraph by index', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getParagraph',
        { index: 1, tabId: 1 },
        createSender(1),
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      const para = result.paragraph as Record<string, unknown>;
      expect(para.index).toBe(1);
      expect(para.text).toBe('Second paragraph text.');
    });

    it('should return error for out-of-range index (too high)', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getParagraph',
        { index: 5, tabId: 1 },
        createSender(1),
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should return error for out-of-range index (negative)', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getParagraph',
        { index: -1, tabId: 1 },
        createSender(1),
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should return error when no article cached', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getParagraph',
        { index: 0, tabId: 999 },
        createSender(999),
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No article cached for this tab');
      expect(result.needsExtraction).toBe(true);
    });

    it('should return error when no tab ID available', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getParagraph',
        { index: 0 }, // no tabId
        undefined, // no sender
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No tab ID available');
    });

    it('should resolve tab ID from sender when not in params', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getParagraph',
        { index: 0 }, // no tabId in params
        createSender(1),
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      const para = result.paragraph as Record<string, unknown>;
      expect(para.text).toBe('First paragraph text.');
    });
  });

  // ------------------------------------------
  // reader.getArticleInfo
  // ------------------------------------------

  describe('reader.getArticleInfo', () => {
    it('should return article metadata when article is cached', async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });
      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: '<html><body>x</body></html>', url: 'https://example.com' },
        createSender(1),
      );

      const result = (await invokeHandler(
        registry,
        'reader.getArticleInfo',
        { tabId: 1 },
        createSender(1),
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.hasArticle).toBe(true);
      const info = result.info as Record<string, unknown>;
      expect(info.url).toBe(article.url);
      expect(info.title).toBe(article.title);
      expect(info.paragraphCount).toBe(2);
      expect(info.wordCount).toBe(article.length);
      expect(info.lang).toBe('en');
      expect(info.excerpt).toBe(article.excerpt);
      expect(info.byline).toBe('Test Author');
      expect(info.siteName).toBe('Example.com');
    });

    it('should return hasArticle:false when no article cached', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getArticleInfo',
        { tabId: 999 },
        createSender(999),
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.hasArticle).toBe(false);
    });

    it('should return error when no tab ID available', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.getArticleInfo',
        {},
        undefined,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No tab ID available');
    });
  });

  // ------------------------------------------
  // reader.clearArticle
  // ------------------------------------------

  describe('reader.clearArticle', () => {
    it('should clear a cached article and report cleared:true', async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });
      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: '<html><body>x</body></html>', url: 'https://example.com' },
        createSender(1),
      );

      // Verify article is cached
      expect(getCachedArticle(1)).toBeDefined();

      const result = (await invokeHandler(
        registry,
        'reader.clearArticle',
        { tabId: 1 },
        createSender(1),
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.cleared).toBe(true);
      expect(getCachedArticle(1)).toBeUndefined();
    });

    it('should report cleared:false when no article was cached', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.clearArticle',
        { tabId: 999 },
        createSender(999),
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.cleared).toBe(false);
    });

    it('should return error when no tab ID available', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.clearArticle',
        {},
        undefined,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('No tab ID available');
    });
  });

  // ------------------------------------------
  // reader.isArticlePage
  // ------------------------------------------

  describe('reader.isArticlePage', () => {
    it('should return isArticle:true when service says yes', async () => {
      mockIsArticlePage.mockReturnValue(true);

      const result = (await invokeHandler(
        registry,
        'reader.isArticlePage',
        { html: '<html><body><article><p>Content</p></article></body></html>' },
        undefined,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.isArticle).toBe(true);
      expect(mockIsArticlePage).toHaveBeenCalledTimes(1);
    });

    it('should return isArticle:false when service says no', async () => {
      mockIsArticlePage.mockReturnValue(false);

      const result = (await invokeHandler(
        registry,
        'reader.isArticlePage',
        { html: '<html><body><nav>Links</nav></body></html>' },
        undefined,
      )) as Record<string, unknown>;

      expect(result.success).toBe(true);
      expect(result.isArticle).toBe(false);
    });

    it('should return error when no HTML provided', async () => {
      const result = (await invokeHandler(
        registry,
        'reader.isArticlePage',
        {},
        undefined,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('HTML content required');
    });

    it('should handle exceptions from the extraction service', async () => {
      mockIsArticlePage.mockImplementation(() => {
        throw new Error('Parser failure');
      });

      const result = (await invokeHandler(
        registry,
        'reader.isArticlePage',
        { html: '<html><body>broken</body></html>' },
        undefined,
      )) as Record<string, unknown>;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Parser failure');
    });
  });

  // ------------------------------------------
  // Exported utility functions
  // ------------------------------------------

  describe('utility exports', () => {
    it('clearArticleCache should remove cached article', async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });
      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: '<html><body>x</body></html>', url: 'https://example.com' },
        createSender(99),
      );

      expect(getCachedArticle(99)).toBeDefined();
      clearArticleCache(99);
      expect(getCachedArticle(99)).toBeUndefined();
    });

    it('onTabRemoved should clear article cache for the tab', async () => {
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });
      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: '<html><body>x</body></html>', url: 'https://example.com' },
        createSender(99),
      );

      expect(getCachedArticle(99)).toBeDefined();
      onTabRemoved(99);
      expect(getCachedArticle(99)).toBeUndefined();
    });
  });

  // ------------------------------------------
  // Dispatch via registry (sender is undefined)
  // ------------------------------------------

  describe('dispatch via registry', () => {
    it('should return not_found for unregistered handler', async () => {
      const result = await registry.dispatch('reader.nonexistent', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
        expect(result.error.handlerName).toBe('reader.nonexistent');
      }
    });

    it('should resolve tabId from params when dispatched via registry (no sender)', async () => {
      // First cache an article using direct invoke (sender needed)
      const article = createTestArticle();
      mockExtract.mockResolvedValue({ ok: true, value: article });
      await invokeHandler(
        registry,
        'reader.extractArticle',
        { html: '<html><body>x</body></html>', url: 'https://example.com' },
        createSender(1),
      );

      // Now dispatch via registry — sender is undefined, so tabId must come from params
      const result = await registry.dispatch('reader.getParagraphs', { tabId: 1 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const response = result.value as { success: boolean; total: number };
        expect(response.success).toBe(true);
        expect(response.total).toBe(2);
      }
    });
  });
});
