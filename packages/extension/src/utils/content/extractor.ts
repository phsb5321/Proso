// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Content Extractor
 * Text extraction logic for web pages. Handles selection, article, and full page extraction.
 * Uses scoring algorithms to identify main content areas.
 *
 * @module utils/content/extractor
 */

import { z } from 'zod';
import { createLogger } from '../logging/logger';

const log = createLogger('content');

// ============================================================================
// Zod Schemas (Zod-first approach)
// ============================================================================

/**
 * Feature 015: Unwanted container configuration schema
 */
export const unwantedConfigSchema = z.object({
  patterns: z.array(z.string()),
  unwantedTags: z.array(z.string()),
  wikiSelectors: z.array(z.string()),
});

export type UnwantedConfig = z.infer<typeof unwantedConfigSchema>;

/**
 * Extracted content schema (from data-model.md)
 */
export const extractedContentSchema = z.object({
  paragraphs: z.array(z.string()),
  title: z.string(),
  byline: z.string().nullable(),
  language: z.string().nullable(),
  fingerprints: z.array(z.string()),
});

export type ExtractedContent = z.infer<typeof extractedContentSchema>;

/**
 * DOM element mapping schema (from data-model.md)
 */
export const domMappingSchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  element: z.custom<Element>((val) => val instanceof Element),
  range: z.custom<Range>((val) => val instanceof Range),
  fingerprint: z.string(),
});

export type DOMMapping = z.infer<typeof domMappingSchema>;

/**
 * Extraction mode enum
 */
export const extractionModeSchema = z.enum(['selection', 'article', 'full']);
export type ExtractionMode = z.infer<typeof extractionModeSchema>;

/**
 * Content scoring result schema
 */
export const contentScoreSchema = z.object({
  score: z.number(),
  linkDensity: z.number(),
  paragraphCount: z.number(),
  textLength: z.number(),
});

export type ContentScore = z.infer<typeof contentScoreSchema>;

/**
 * Text fingerprint schema (normalized text for matching)
 */
export const textFingerprintSchema = z.string().min(1).max(50);
export type TextFingerprint = z.infer<typeof textFingerprintSchema>;

// ============================================================================
// Constants
// ============================================================================

/**
 * Feature 015: Unwanted container configuration
 * Patterns for identifying non-content containers to filter
 */
export const UNWANTED_CONFIG: UnwantedConfig = {
  patterns: [
    // Table of contents
    'toc',
    'table-of-contents',
    'contents-list',
    // Info boxes
    'infobox',
    'info-box',
    'sidebar-content',
    'portable-infobox',
    // Navigation
    'navbox',
    'nav-box',
    'navigation-box',
    // Wiki-specific
    'hatnote',
    'dablink',
    'rellink',
    'reference',
    'reflist',
    'citations',
    'see-also',
    'external-links',
    'edit-section',
    'mw-editsection',
    // Fextralife specific
    'bonfire',
    'widget',
    'boss-card',
    'enemy-card',
    'item-card',
    'wiki-table-wrapper',
    'build-planner',
    'inline-nav',
    'related-',
    'quick-link',
    'map-marker',
    'location-card',
    // Generic
    'card',
    'box',
    'panel',
    'aside',
    'summary',
    'stat-block',
    'stats-table',
    // Interactive elements
    'calculator',
    'planner',
    'builder',
    'tool-',
    // Ad/promo containers
    'promo',
    'sponsor',
    'advertisement',
    'ad-',
  ],
  unwantedTags: ['aside', 'figure'],
  wikiSelectors: [
    '#wiki-content-block',
    '.wiki-content',
    '#mw-content-text',
    '.mw-parser-output',
    '#WikiaArticle',
    '.page-content',
  ],
};

// ============================================================================
// Module State
// ============================================================================

/**
 * Store extracted paragraphs for highlighting
 * This is module-level state that persists across function calls
 */
let extractedParagraphs: Element[] = [];

// ============================================================================
// Type Definitions for External Dependencies
// ============================================================================

/**
 * Content scorer interface (from content-scorer.js)
 * This is optional dependency - functions check if it exists before calling
 */
interface ContentScorer {
  isNavigationElement?: (el: Element) => boolean;
  isInsideUnwantedElement?: (el: Element) => boolean;
  isNavigationText?: (text: string) => boolean;
  isBlockElement?: (el: Element) => boolean;
  calculateContentScore?: (el: Element) => number;
}

/**
 * Get scorer functions from global namespace (legacy compatibility)
 * In the future, this will be replaced with direct imports
 */
function getScorer(): ContentScorer {
  return (
    (((window as unknown as Record<string, unknown>).Proso as Record<string, unknown> | undefined)
      ?.contentScorer as ContentScorer) || {}
  );
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Get extracted paragraphs
 */
export function getExtractedParagraphs(): Element[] {
  return extractedParagraphs;
}

/**
 * Get paragraph texts as an array
 * This returns the exact text content of each extracted DOM paragraph,
 * ensuring TTS paragraph indices match DOM paragraph indices for highlighting.
 */
export function getParagraphTexts(): string[] {
  return extractedParagraphs
    .map((el) => el.textContent?.trim() || '')
    .filter((text) => text.length > 0);
}

/**
 * Set extracted paragraphs
 */
export function setExtractedParagraphs(paragraphs: Element[]): void {
  extractedParagraphs = paragraphs;
}

/**
 * Extract text from the page based on mode
 */
export function extractText(mode: ExtractionMode): string {
  log.debug(`Proso: extractText() called with mode: "${mode}"`);

  switch (mode) {
    case 'selection':
      return extractSelection();
    case 'article':
      return extractArticle();
    case 'full':
    default:
      log.debug('Proso: Using full page extraction (consider using article mode)');
      return extractFullPage();
  }
}

/**
 * Extract selected text and find corresponding DOM elements for highlighting
 */
export function extractSelection(): string {
  const selection = window.getSelection();
  if (!selection || !selection.toString().trim()) {
    return '';
  }

  const text = selection.toString();

  // Find DOM elements that contain the selection for highlighting
  const selectedElements: Element[] = [];
  const range = selection.getRangeAt(0);

  if (range) {
    // Get the common ancestor and find all paragraph-like elements within
    const container = range.commonAncestorContainer;
    const containerEl =
      container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement;

    if (containerEl) {
      // If selection is within a single paragraph-like element, use it
      const paragraphParent = containerEl.closest(
        'p, li, blockquote, h1, h2, h3, h4, h5, h6, div, article, section',
      );
      if (paragraphParent && paragraphParent.textContent?.includes(text.substring(0, 50))) {
        selectedElements.push(paragraphParent);
      } else {
        // Selection spans multiple elements - find all paragraph elements in range
        const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_ELEMENT, {
          acceptNode: (node: Node) => {
            const el = node as Element;
            if (
              ['P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(el.tagName)
            ) {
              if (selection.containsNode(el, true)) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
            return NodeFilter.FILTER_SKIP;
          },
        });

        let node: Node | null;
        while ((node = walker.nextNode())) {
          if ((node.textContent?.trim().length || 0) > 10) {
            selectedElements.push(node as Element);
          }
        }
      }
    }
  }

  // Store DOM elements for highlighting (or empty if we couldn't find them)
  extractedParagraphs = selectedElements.length > 0 ? selectedElements : [];

  // Log for debugging
  log.debug(
    `Proso: Selection extracted ${text.length} chars, ${extractedParagraphs.length} DOM elements`,
  );

  return text;
}

/**
 * Extract main article content using Mozilla Readability
 * Falls back to heuristics if Readability fails
 */
export function extractArticle(): string {
  log.debug('Proso: extractArticle() called', {
    readabilityAvailable: typeof window.Readability,
    isProbablyReaderableAvailable: typeof window.isProbablyReaderable,
  });

  // Try Mozilla Readability first (best content extraction)
  const readabilityResult = tryReadabilityExtraction();
  if (readabilityResult) {
    log.debug('Proso: Used Readability for extraction', {
      paragraphCount: extractedParagraphs.length,
    });
    return readabilityResult;
  }

  // Fallback to manual heuristics
  log.debug('Proso: Readability failed, using heuristic extraction');
  const result = extractArticleHeuristic();
  log.debug('Proso: Heuristic extracted paragraphs count', {
    paragraphCount: extractedParagraphs.length,
  });
  return result;
}

/**
 * Extract all readable text from the page
 */
export function extractFullPage(): string {
  const body = document.body;
  if (!body) return '';

  const text = extractTextFromElement(body);
  extractedParagraphs = findParagraphElements(body);
  return text;
}

/**
 * Find the best content block using a scoring algorithm
 */
export function findBestContentBlock(): Element | null {
  const scorer = getScorer();
  const candidates = document.querySelectorAll('div, section, article, main');
  let bestElement: Element | null = null;
  let bestScore = 0;

  for (const el of candidates) {
    if (scorer.isNavigationElement?.(el)) continue;
    if ((el.textContent?.length || 0) < 500) continue;

    const score = scorer.calculateContentScore?.(el) || 0;
    if (score > bestScore) {
      bestScore = score;
      bestElement = el;
    }
  }

  return bestElement;
}

/**
 * Find content paragraphs within an element
 */
export function findContentParagraphs(container: Element): Element[] {
  const scorer = getScorer();
  const paragraphs: Element[] = [];
  const seenTexts = new Set<string>();

  const candidates = container.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, blockquote, .wiki-paragraph, article p, .content p',
  );

  // T033: Two-pass approach to batch getComputedStyle() calls (035-selection-tts-hardening)
  // First pass: Filter candidates without style checks (non-layout operations)
  const preFilteredCandidates: Element[] = [];
  for (const el of candidates) {
    if (scorer.isInsideUnwantedElement?.(el)) continue;
    const text = el.textContent?.trim() || '';
    if (text.length < 30) continue;
    if (scorer.isNavigationText?.(text)) continue;

    const linkText = Array.from(el.querySelectorAll('a')).reduce(
      (sum, a) => sum + (a.textContent?.length || 0),
      0,
    );
    if (linkText > text.length * 0.5) continue;

    const normalizedText = text.toLowerCase().substring(0, 100);
    if (seenTexts.has(normalizedText)) continue;
    seenTexts.add(normalizedText);

    preFilteredCandidates.push(el);
  }

  // Second pass: Batch read all computed styles, then filter
  const styles = preFilteredCandidates.map((el) => window.getComputedStyle(el));
  for (let i = 0; i < preFilteredCandidates.length; i++) {
    const position = styles[i].position;
    if (position !== 'fixed' && position !== 'sticky') {
      paragraphs.push(preFilteredCandidates[i]);
    }
  }

  // Content-focused list items
  const contentLists = container.querySelectorAll(
    '.wiki-content li, .content li, article li, .prose li, .article-body li, [role="main"] li',
  );
  for (const el of contentLists) {
    if (scorer.isInsideUnwantedElement?.(el)) continue;
    const text = el.textContent?.trim() || '';
    if (text.length < 30) continue;
    if (scorer.isNavigationText?.(text)) continue;

    const linkText = Array.from(el.querySelectorAll('a')).reduce(
      (sum, a) => sum + (a.textContent?.length || 0),
      0,
    );
    if (linkText > text.length * 0.5) continue;

    const normalizedText = text.toLowerCase().substring(0, 100);
    if (seenTexts.has(normalizedText)) continue;
    seenTexts.add(normalizedText);

    paragraphs.push(el);
  }

  return paragraphs;
}

/**
 * Find a DOM element that contains the given text
 */
export function findElementByText(searchText: string): Element | null {
  if (!searchText || searchText.length < 10) return null;

  const normalizedSearch = searchText.toLowerCase().replace(/\s+/g, ' ').trim();

  for (const el of extractedParagraphs) {
    const elText = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
    if (elText.startsWith(normalizedSearch) || elText.includes(normalizedSearch)) {
      return el;
    }
  }

  const blockElements = document.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, blockquote, div.content, article p',
  );
  for (const el of blockElements) {
    const elText = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
    if (elText.startsWith(normalizedSearch) || elText.includes(normalizedSearch)) {
      return el;
    }
  }

  return null;
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/**
 * Feature 015: Pre-filter document clone before Readability
 * Removes unwanted elements (cards, infoboxes, etc.) from the cloned document
 * MUST be called BEFORE passing to Readability to prevent card content in audio
 */
function preFilterDocumentForReadability(docClone: Document): number {
  let removedCount = 0;

  // Build comprehensive selector list for unwanted elements
  const classSelectors = UNWANTED_CONFIG.patterns.map((p) => `[class*="${p}"]`).join(', ');
  const idSelectors = UNWANTED_CONFIG.patterns.map((p) => `[id*="${p}"]`).join(', ');
  const tagSelectors = UNWANTED_CONFIG.unwantedTags.join(', ');

  // Also target specific Fextralife structures
  const fextralifeSelectors = [
    '.infobox',
    '.navbox',
    '.toc',
    '.sidebar',
    '[class*="card"]',
    '[class*="widget"]',
    '[class*="bonfire"]',
    '[class*="boss-"]',
    '[class*="enemy-"]',
    '[class*="item-"]',
    '[class*="stat"]',
    '[class*="inline-nav"]',
    'table:not(.wikitable)', // Most wiki tables are stat tables
    '.reference',
    '.reflist',
    '.external-links',
    '.see-also',
  ].join(', ');

  // Combine all selectors
  const combinedSelector = [classSelectors, idSelectors, tagSelectors, fextralifeSelectors]
    .filter((s) => s.length > 0)
    .join(', ');

  try {
    const unwantedElements = docClone.querySelectorAll(combinedSelector);
    log.debug(`Proso: Pre-filter found ${unwantedElements.length} potentially unwanted elements`);

    for (const el of unwantedElements) {
      // Don't remove the wiki content container itself
      if (
        el.id === 'wiki-content-block' ||
        el.id === 'mw-content-text' ||
        el.classList.contains('wiki-content') ||
        el.classList.contains('mw-parser-output')
      ) {
        continue;
      }

      // Check if this is a significant content container (has many paragraphs)
      const paragraphCount = el.querySelectorAll('p').length;
      if (paragraphCount > 10) {
        // This might be a main content area, skip it
        log.debug(`Proso: Skipping removal of element with ${paragraphCount} paragraphs`);
        continue;
      }

      // Remove the element
      if (el.parentNode) {
        el.parentNode.removeChild(el);
        removedCount++;
      }
    }

    // Also remove all tables that look like stat tables (less than 3 paragraphs inside)
    const tables = docClone.querySelectorAll('table');
    for (const table of tables) {
      const tableParagraphs = table.querySelectorAll('p');
      if (tableParagraphs.length < 3 && table.parentNode) {
        table.parentNode.removeChild(table);
        removedCount++;
      }
    }

    log.debug(`Proso: Pre-filter removed ${removedCount} unwanted elements`);
  } catch (e) {
    log.error('Proso: Pre-filter error', { error: e });
  }

  return removedCount;
}

/**
 * Feature 015: Sort elements by document position
 * Uses compareDocumentPosition() for O(n log n) sorting
 */
function sortByDocumentPosition(elements: Element[]): Element[] {
  return elements.sort((a, b) => {
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

/**
 * Try to extract content using Mozilla Readability
 * Feature 015: Now pre-filters document to exclude cards/infoboxes BEFORE extraction
 */
function tryReadabilityExtraction(): string | null {
  try {
    // Check if Readability is available
    if (typeof window.Readability !== 'function') {
      log.debug('Proso: Readability not available');
      return null;
    }

    // Check if page is probably readable
    if (typeof window.isProbablyReaderable === 'function') {
      if (!window.isProbablyReaderable(document)) {
        log.debug('Proso: Page not suitable for Readability');
        return null;
      }
    }

    // Clone document to avoid modifying the original
    const documentClone = document.cloneNode(true) as Document;

    // Feature 015: Pre-filter BEFORE Readability to remove cards/infoboxes
    // This ensures audio content doesn't include card text
    const removedCount = preFilterDocumentForReadability(documentClone);
    log.debug(`Proso: Pre-filtered ${removedCount} elements before Readability`);

    // Parse with Readability
    const reader = new window.Readability(documentClone, {
      charThreshold: 100, // Lower threshold for shorter articles
      keepClasses: false, // Clean output
    });

    const article = reader.parse();

    if (!article || !article.textContent || article.textContent.trim().length < 100) {
      log.debug('Proso: Readability returned insufficient content');
      return null;
    }

    // Extract the article title for TTS to read first
    const articleTitle = article.title?.trim() || '';
    log.debug(`Proso: Article title: "${articleTitle}"`);

    log.debug(
      `Proso: Readability extracted ${article.textContent.length} chars (after pre-filtering)`,
    );

    // Find paragraphs from the parsed content
    const tempDiv = document.createElement('div');
    // Use DOMParser for safe HTML parsing instead of innerHTML
    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(article.content, 'text/html');
    while (parsedDoc.body.firstChild) {
      tempDiv.appendChild(parsedDoc.body.firstChild);
    }

    // Get paragraph elements from parsed content
    const paragraphElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
    const meaningfulParagraphs: Element[] = [];
    const seenTexts = new Set<string>();

    for (const el of paragraphElements) {
      const text = el.textContent?.trim() || '';
      if (text.length < 20) continue;

      // Deduplicate
      const normalizedText = text.toLowerCase().substring(0, 100);
      if (seenTexts.has(normalizedText)) continue;
      seenTexts.add(normalizedText);

      meaningfulParagraphs.push(el);
    }

    // Now find corresponding elements in the actual DOM for highlighting
    extractedParagraphs = findMatchingDOMElements(meaningfulParagraphs);

    // Try to find the title element in the DOM for highlighting
    let titleElement: Element | null = null;
    const normalizedTitle = articleTitle.toLowerCase().replace(/\s+/g, ' ').trim();

    if (articleTitle && normalizedTitle.length > 0) {
      // Look for h1 first (most common for article titles)
      const h1Elements = document.querySelectorAll('h1');
      for (const h1 of h1Elements) {
        const h1Text = h1.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
        // Fuzzy match: check if h1 contains the title or vice versa
        if (
          h1Text === normalizedTitle ||
          h1Text.includes(normalizedTitle) ||
          normalizedTitle.includes(h1Text) ||
          (h1Text.length > 10 && normalizedTitle.startsWith(h1Text.substring(0, 20)))
        ) {
          titleElement = h1;
          log.debug('Proso: Found title h1 element', { title: h1Text.substring(0, 50) });
          break;
        }
      }

      // If no h1 match, try other title-like elements
      if (!titleElement) {
        const titleSelectors = [
          'h2',
          '.title',
          '.headline',
          '.article-title',
          '.post-title',
          '.entry-title',
          '[class*="title"]',
          '[class*="headline"]',
        ];
        for (const selector of titleSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const elText = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
            if (
              elText === normalizedTitle ||
              elText.includes(normalizedTitle) ||
              normalizedTitle.includes(elText)
            ) {
              titleElement = el;
              log.debug('Proso: Found title element via selector', { selector });
              break;
            }
          }
          if (titleElement) break;
        }
      }

      // Prepend title element to extractedParagraphs if found and not already included
      if (titleElement && !extractedParagraphs.includes(titleElement)) {
        extractedParagraphs = [titleElement, ...extractedParagraphs];
        log.debug('Proso: Prepended title element for highlighting');
      } else if (!titleElement) {
        // No DOM element found for title - create a virtual entry by logging
        // The title text will still be included in the returned text below
        log.debug('Proso: Title element not found in DOM, but title text will be read');
      }
    }

    log.debug(
      `Proso: Found ${extractedParagraphs.length} paragraphs for highlighting (including title)`,
    );

    // Feature 015: Return ONLY the text from matched DOM paragraphs
    // This ensures audio matches exactly what will be highlighted
    if (extractedParagraphs.length > 0) {
      let filteredText = extractedParagraphs
        .map((el) => el.textContent?.trim() || '')
        .filter((text) => text.length > 0)
        .join('\n\n');

      // ALWAYS prepend the article title if we have one and it's not already the first paragraph
      if (articleTitle) {
        const firstParagraphText =
          extractedParagraphs[0]?.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
        const titleNormalized = articleTitle.toLowerCase().replace(/\s+/g, ' ').trim();

        // Check if first paragraph already contains/is the title
        if (
          !firstParagraphText.includes(titleNormalized) &&
          !titleNormalized.includes(firstParagraphText)
        ) {
          filteredText = `${articleTitle}\n\n${filteredText}`;
          log.debug('Proso: Prepended title text to output', {
            title: articleTitle.substring(0, 50),
          });
        } else {
          log.debug('Proso: Title already present in first paragraph');
        }
      }

      log.debug(
        `Proso: Returning filtered text (${filteredText.length} chars) from ${extractedParagraphs.length} matched paragraphs`,
      );
      return filteredText;
    }

    // Fallback: prepend title to article textContent if we have a title
    if (articleTitle) {
      log.debug('Proso: Using fallback with title prepended');
      return `${articleTitle}\n\n${article.textContent}`;
    }

    // Final fallback to article textContent if no paragraphs matched
    return article.textContent;
  } catch (e) {
    log.error('Proso: Readability extraction failed', { error: e });
    return null;
  }
}

/**
 * Create a text fingerprint for fuzzy matching
 * Normalizes text to handle differences between Readability output and live DOM
 */
function createTextFingerprint(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .trim()
    .substring(0, 50); // Use first 50 chars for comparison
}

/**
 * Check if two texts match using fuzzy comparison
 */
function textsMatch(text1: string, text2: string): boolean {
  if (!text1 || !text2) return false;

  const fp1 = createTextFingerprint(text1);
  const fp2 = createTextFingerprint(text2);

  if (fp1.length < 15 || fp2.length < 15) return false;

  // Exact match
  if (fp1 === fp2) return true;

  // Prefix match (one starts with the other)
  if (fp1.startsWith(fp2) || fp2.startsWith(fp1)) return true;

  // Similarity check for ~80% match
  const minLen = Math.min(fp1.length, fp2.length);
  let matches = 0;
  for (let i = 0; i < minLen; i++) {
    if (fp1[i] === fp2[i]) matches++;
  }
  return matches / minLen >= 0.8;
}

/**
 * Find matching DOM elements for extracted paragraphs
 * Uses improved fuzzy matching and wiki-specific selectors
 * Feature 015: Improved with document position sorting, pre-filtering,
 * fingerprint map for O(1) lookup, and performance timing
 */
function findMatchingDOMElements(extractedEls: Element[]): Element[] {
  const startTime = performance.now();
  const scorer = getScorer();
  const matchedElements: Element[] = [];
  const seenFingerprints = new Set<string>();

  // Try wiki-specific content containers first for better targeting
  const wikiContainer = findWikiContentContainer();
  const isKnownContentContainer = !!wikiContainer;

  // Build comprehensive selector list including wiki-specific patterns
  const selectors = [
    // Wiki-specific selectors (Fextralife, Wikipedia, Fandom)
    '#wiki-content-block p',
    '.wiki-content p',
    '#WikiaArticle p',
    '#mw-content-text p',
    '.mw-parser-output p',
    '.page-content p',
    // Standard paragraph selectors
    'article p',
    'main p',
    '[role="main"] p',
    '.article-content p',
    '.entry-content p',
    '.post-content p',
    // Headings
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    // Other content elements
    'blockquote',
    'li',
  ];

  // Get DOM paragraphs, preferring wiki container if found
  const searchRoot = wikiContainer || document;
  let domParagraphs: Element[] = [];

  for (const selector of selectors) {
    try {
      const elements = searchRoot.querySelectorAll(selector);
      domParagraphs.push(...Array.from(elements));
    } catch (_e) {
      // Ignore invalid selectors
    }
  }

  // Fallback: get all paragraph-like elements
  if (domParagraphs.length === 0) {
    domParagraphs = Array.from(
      document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote'),
    );
  }

  // Remove duplicates and sort by document position (FR-001)
  domParagraphs = [...new Set(domParagraphs)];
  sortByDocumentPosition(domParagraphs);

  // Pre-filter DOM paragraphs to remove those in unwanted containers
  const filteredDomParagraphs = domParagraphs.filter((domEl) => {
    if (isKnownContentContainer && wikiContainer) {
      return !isInsideUnwantedSubContainer(domEl, wikiContainer);
    } else {
      return !scorer.isInsideUnwantedElement?.(domEl);
    }
  });

  log.debug(
    `Proso: Searching ${filteredDomParagraphs.length} DOM elements for matches (wiki container: ${isKnownContentContainer}, filtered from ${domParagraphs.length})`,
  );

  // Build a map of fingerprint -> all matching DOM elements
  const fingerprintToElements = new Map<string, Element[]>();
  for (const domEl of filteredDomParagraphs) {
    const domText = domEl.textContent?.trim() || '';
    if (domText.length < 20) continue;

    const fingerprint = createTextFingerprint(domText);
    if (!fingerprintToElements.has(fingerprint)) {
      fingerprintToElements.set(fingerprint, []);
    }
    fingerprintToElements.get(fingerprint)!.push(domEl);
  }

  // Match extracted elements to DOM using fuzzy text matching
  for (const extractedEl of extractedEls) {
    const targetText = extractedEl.textContent?.trim() || '';
    if (targetText.length < 20) continue;

    const targetFingerprint = createTextFingerprint(targetText);
    if (seenFingerprints.has(targetFingerprint)) continue;

    // Find matching element in DOM - prefer exact fingerprint match first
    let bestMatch: Element | null = null;

    // Check for exact fingerprint match
    if (fingerprintToElements.has(targetFingerprint)) {
      const candidates = fingerprintToElements.get(targetFingerprint)!;
      // If multiple matches, prefer ones not already used
      for (const candidate of candidates) {
        const candidateFp = createTextFingerprint(candidate.textContent?.trim() || '');
        if (!seenFingerprints.has(candidateFp)) {
          bestMatch = candidate;
          break;
        }
      }
    }

    // Fall back to fuzzy matching if no exact match
    if (!bestMatch) {
      for (const domEl of filteredDomParagraphs) {
        const domText = domEl.textContent?.trim() || '';
        if (domText.length < 20) continue;

        const domFingerprint = createTextFingerprint(domText);
        if (seenFingerprints.has(domFingerprint)) continue;

        if (textsMatch(targetText, domText)) {
          bestMatch = domEl;
          break;
        }
      }
    }

    if (bestMatch) {
      const domFingerprint = createTextFingerprint(bestMatch.textContent?.trim() || '');
      seenFingerprints.add(domFingerprint);
      seenFingerprints.add(targetFingerprint);
      matchedElements.push(bestMatch);
    }
  }

  // If matching failed, fall back to direct DOM extraction
  if (matchedElements.length === 0 && extractedEls.length > 0) {
    log.debug('Proso: Readability matching failed, using direct DOM extraction');
    return extractParagraphsDirectlyFromDOM();
  }

  // Sort matched elements by document order to ensure correct reading sequence (FR-004)
  sortByDocumentPosition(matchedElements);

  // Feature 015: Log matching statistics for performance monitoring
  const endTime = performance.now();
  const matchTime = (endTime - startTime).toFixed(2);
  log.debug(
    `Proso: Matching stats - extracted: ${extractedEls.length}, ` +
      `candidates: ${domParagraphs.length}, filtered: ${filteredDomParagraphs.length}, ` +
      `matched: ${matchedElements.length}, time: ${matchTime}ms`,
  );

  return matchedElements;
}

/**
 * Find wiki-specific content container
 */
function findWikiContentContainer(): Element | null {
  // Priority-ordered wiki selectors
  const wikiContainerSelectors = [
    // Fextralife
    '#wiki-content-block',
    '.wiki-content',
    // Wikipedia / MediaWiki
    '#mw-content-text',
    '.mw-parser-output',
    '#bodyContent',
    // Fandom
    '#WikiaArticle',
    '.page-content',
    '#content-wrapper',
    // Generic wiki patterns
    '.wiki-article',
    '.article-content',
  ];

  for (const selector of wikiContainerSelectors) {
    const container = document.querySelector(selector);
    if (container && (container.textContent?.length || 0) > 200) {
      log.debug(`Proso: Found wiki container: ${selector}`);
      return container;
    }
  }

  return null;
}

/**
 * Check if element is inside an unwanted sub-container within the content area
 * This is a lighter check than the full isInsideUnwantedElement - only checks
 * immediate parents for things like TOC, infoboxes, etc. within the content
 */
function isInsideUnwantedSubContainer(el: Element, contentContainer: Element): boolean {
  // Patterns for sub-containers within content that should be skipped
  const unwantedSubPatterns = [
    // Table of contents
    'toc',
    'table-of-contents',
    'contents-list',
    // Info boxes / cards (generic)
    'infobox',
    'info-box',
    'sidebar-content',
    'portable-infobox',
    // Navigation boxes
    'navbox',
    'nav-box',
    'navigation-box',
    // Wikipedia/MediaWiki specific
    'hatnote',
    'dablink',
    'rellink',
    'reference',
    'reflist',
    'citations',
    'see-also',
    'external-links',
    'edit-section',
    'mw-editsection',
    // Fextralife wiki specific
    'bonfire',
    'widget',
    'boss-card',
    'enemy-card',
    'item-card',
    'wiki-table-wrapper',
    'build-planner',
    'inline-nav',
    'related-',
    'quick-link',
    'map-marker',
    'location-card',
    // General card/box patterns
    'card',
    'box',
    'panel',
    'aside',
    'summary',
    'stat-block',
    'stats-table',
    // Interactive elements
    'calculator',
    'planner',
    'builder',
    'tool-',
    // Ad/promo containers
    'promo',
    'sponsor',
    'advertisement',
    'ad-',
  ];

  // Check if element is inside a table (often used for stat boxes on wikis)
  const table = el.closest('table');
  if (table && table !== el) {
    // Tables in wiki content are usually stat/info boxes, not article text
    // Exception: tables that are part of article content (very large with p tags)
    const tableParagraphs = table.querySelectorAll('p');
    if (tableParagraphs.length < 3) {
      return true; // Likely a stat/info table, not content
    }
  }

  let parent: Element | null = el.parentElement;
  while (parent && parent !== contentContainer && parent !== document.body) {
    const classId = ((parent.className as string) || '' + ' ' + (parent.id || '')).toLowerCase();

    for (const pattern of unwantedSubPatterns) {
      if (classId.includes(pattern)) {
        return true;
      }
    }

    // Check for common card/widget tag structures
    const tagName = parent.tagName.toLowerCase();
    if (tagName === 'aside' || tagName === 'figure') {
      return true;
    }

    parent = parent.parentElement;
  }
  return false;
}

/**
 * Extract paragraphs directly from the live DOM (fallback)
 * This bypasses Readability remapping entirely
 */
function extractParagraphsDirectlyFromDOM(): Element[] {
  const scorer = getScorer();
  const paragraphs: Element[] = [];
  const seenFingerprints = new Set<string>();

  // Try to find the main content container
  const wikiContainer = findWikiContentContainer();
  const container =
    wikiContainer ||
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.body;

  // Track if we found a known content container (skip aggressive filtering if so)
  const isKnownContentContainer =
    !!wikiContainer || container.tagName === 'ARTICLE' || container.tagName === 'MAIN';

  log.debug(
    `Proso: Direct extraction from container: ${container.tagName}${container.id ? '#' + container.id : ''} (known: ${isKnownContentContainer})`,
  );

  // Get all paragraph-like elements
  const candidates = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote');

  log.debug(`Proso: Found ${candidates.length} candidate elements`);

  for (const el of candidates) {
    // If we're in a known content container, only check for unwanted sub-containers
    // Otherwise, use the full parent chain check
    if (isKnownContentContainer) {
      if (isInsideUnwantedSubContainer(el, container)) continue;
    } else {
      if (scorer.isInsideUnwantedElement?.(el)) continue;
    }

    const text = el.textContent?.trim() || '';

    // Minimum length check
    if (text.length < 30) continue;

    // Skip navigation-like text (but be less aggressive for known content)
    if (!isKnownContentContainer && scorer.isNavigationText?.(text)) continue;

    // Skip high link density (navigation) - more lenient threshold for known content
    const linkText = Array.from(el.querySelectorAll('a')).reduce(
      (sum, a) => sum + (a.textContent?.length || 0),
      0,
    );
    const linkThreshold = isKnownContentContainer ? 0.7 : 0.5;
    if (linkText > text.length * linkThreshold) continue;

    // Skip fixed/sticky elements
    try {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') continue;
    } catch (_e) {
      // Ignore styling errors
    }

    // Deduplicate using fingerprint
    const fingerprint = createTextFingerprint(text);
    if (seenFingerprints.has(fingerprint)) continue;
    seenFingerprints.add(fingerprint);

    paragraphs.push(el);
  }

  // Also check for content in list items (common in wikis)
  const listItems = container.querySelectorAll('li');
  for (const el of listItems) {
    if (isKnownContentContainer) {
      if (isInsideUnwantedSubContainer(el, container)) continue;
    } else {
      if (scorer.isInsideUnwantedElement?.(el)) continue;
    }

    const text = el.textContent?.trim() || '';
    if (text.length < 30) continue;
    if (!isKnownContentContainer && scorer.isNavigationText?.(text)) continue;

    const linkText = Array.from(el.querySelectorAll('a')).reduce(
      (sum, a) => sum + (a.textContent?.length || 0),
      0,
    );
    const linkThreshold = isKnownContentContainer ? 0.7 : 0.5;
    if (linkText > text.length * linkThreshold) continue;

    const fingerprint = createTextFingerprint(text);
    if (seenFingerprints.has(fingerprint)) continue;
    seenFingerprints.add(fingerprint);

    paragraphs.push(el);
  }

  log.debug(`Proso: Direct extraction found ${paragraphs.length} paragraphs`);
  return paragraphs;
}

/**
 * Extract article using heuristics (fallback)
 */
function extractArticleHeuristic(): string {
  const scorer = getScorer();

  // Priority 1: Wiki-specific selectors
  const wikiSelectors = [
    '#wiki-content-block',
    '.wiki-content',
    '#WikiaArticle',
    '#mw-content-text',
    '.mw-parser-output',
    '#bodyContent',
    '.page-content',
    '#content-wrapper',
  ];

  // Priority 2: Standard article selectors
  const articleSelectors = [
    'article[role="main"]',
    'main article',
    '[role="main"] article',
    'article.post',
    'article.entry',
    '.post-content',
    '.article-content',
    '.article-body',
    '.entry-content',
    '.story-body',
    '.markdown-body',
    '.prose',
  ];

  // Priority 3: Generic content containers
  const genericSelectors = ['[role="main"]', 'main', '#main-content', '#content', '.content-area'];

  let articleElement: Element | null = null;

  // Try wiki selectors first
  for (const selector of wikiSelectors) {
    const el = document.querySelector(selector);
    if (el && (el.textContent?.length || 0) > 500 && !scorer.isNavigationElement?.(el)) {
      articleElement = el;
      break;
    }
  }

  // Try article selectors
  if (!articleElement) {
    for (const selector of articleSelectors) {
      const el = document.querySelector(selector);
      if (el && (el.textContent?.length || 0) > 500 && !scorer.isNavigationElement?.(el)) {
        articleElement = el;
        break;
      }
    }
  }

  // Try generic selectors
  if (!articleElement) {
    for (const selector of genericSelectors) {
      const el = document.querySelector(selector);
      if (el && (el.textContent?.length || 0) > 500 && !scorer.isNavigationElement?.(el)) {
        articleElement = el;
        break;
      }
    }
  }

  // Fallback: find the largest text block with good content score
  if (!articleElement) {
    articleElement = findBestContentBlock();
  }

  if (articleElement) {
    const text = extractCleanTextFromElement(articleElement);
    extractedParagraphs = findContentParagraphs(articleElement);
    return text;
  }

  return extractFullPage();
}

/**
 * Extract clean text from an element
 */
function extractCleanTextFromElement(element: Element): string {
  const scorer = getScorer();
  const clone = element.cloneNode(true) as Element;

  const unwantedSelectors = [
    'script',
    'style',
    'noscript',
    'iframe',
    'svg',
    'canvas',
    'nav',
    'header',
    'footer',
    'aside',
    '.nav',
    '.navigation',
    '.menu',
    '.sidebar',
    '.footer',
    '.header',
    '.advertisement',
    '.ad',
    '.ads',
    '.adsbygoogle',
    '.social-share',
    '.comments',
    '#comments',
    '.comment-section',
    '.disqus',
    '.related',
    '.related-posts',
    '.recommended',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '.hidden',
    '[hidden]',
    '[aria-hidden="true"]',
    '.toc',
    '.table-of-contents',
    '#toc',
    '.infobox',
    '.infobox-wrapper',
    '.navbox',
    '.navbox-wrapper',
    '.mw-editsection',
    '.reference',
    '.references',
    'form',
    'input',
    'button',
    'select',
    'textarea',
    '.breadcrumb',
    '.breadcrumbs',
    '.pagination',
    '.author-bio',
    '.author-box',
    '.share-buttons',
    '.social-buttons',
    '.newsletter',
    '.subscribe',
    '.popup',
    '.modal',
    '[class*="cookie"]',
    '[id*="cookie"]',
    '[class*="banner"]',
    '[id*="banner"]',
  ];

  for (const selector of unwantedSelectors) {
    try {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    } catch (_e) {
      // Ignore selector errors
    }
  }

  const texts: string[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
      }
      const text = node.textContent?.trim() || '';
      if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let currentBlock = '';
  let lastParent: Element | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const isBlock = parent && scorer.isBlockElement?.(parent);
    const isNewBlock = isBlock && parent !== lastParent;

    if (isNewBlock && currentBlock.trim()) {
      texts.push(currentBlock.trim());
      currentBlock = '';
    }

    currentBlock += (node.textContent || '') + ' ';
    lastParent = parent;
  }

  if (currentBlock.trim()) {
    texts.push(currentBlock.trim());
  }

  const filteredTexts = texts.filter((text) => {
    if (text.length < 30) return false;
    if (scorer.isNavigationText?.(text)) return false;
    const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    if (alphaRatio < 0.5) return false;
    return true;
  });

  return filteredTexts.join('\n\n');
}

/**
 * Extract readable text from an element
 */
function extractTextFromElement(element: Element): string {
  const scorer = getScorer();
  const clone = element.cloneNode(true) as Element;

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
    '.footer',
    '.header',
    '.advertisement',
    '.ad',
    '.ads',
    '.social-share',
    '.comments',
    '#comments',
    '.comment-section',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '.hidden',
    '[hidden]',
    '[aria-hidden="true"]',
  ];

  for (const selector of unwantedSelectors) {
    clone.querySelectorAll(selector).forEach((el) => el.remove());
  }

  const texts: string[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let currentBlock = '';

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const isBlock = parent && scorer.isBlockElement?.(parent);

    if (isBlock && currentBlock) {
      texts.push(currentBlock.trim());
      currentBlock = '';
    }

    currentBlock += (node.textContent || '') + ' ';
  }

  if (currentBlock.trim()) {
    texts.push(currentBlock.trim());
  }

  return texts.join('\n\n');
}

/**
 * Find paragraph elements for highlighting
 */
function findParagraphElements(container: Element): Element[] {
  const scorer = getScorer();
  const paragraphs: Element[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node: Node) => {
      const el = node as Element;
      if (scorer.isBlockElement?.(el) && (el.textContent?.trim().length || 0) > 20) {
        const nestedBlocks = el.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li');
        const hasNestedContent = Array.from(nestedBlocks).some(
          (b) => (b.textContent?.trim().length || 0) > 50,
        );
        if (!hasNestedContent || el.tagName === 'P' || el.tagName === 'LI') {
          return NodeFilter.FILTER_ACCEPT;
        }
      }
      return NodeFilter.FILTER_SKIP;
    },
  });

  while (walker.nextNode()) {
    paragraphs.push(walker.currentNode as Element);
  }

  return paragraphs;
}

/**
 * Split text into paragraphs
 */
export function splitTextIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ============================================================================
// Console Log
// ============================================================================

log.debug('Proso: utils/content/extractor.ts loaded');
