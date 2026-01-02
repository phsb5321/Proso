/**
 * Content Extractor
 * Text extraction logic for web pages. Handles selection, article, and full page extraction.
 * Uses scoring algorithms to identify main content areas.
 *
 * @module content/content-extractor
 */

// Wrap in IIFE to avoid variable name collisions with other content scripts
(function() {
  'use strict';

  // Initialize VoxPage namespace
  window.VoxPage = window.VoxPage || {};

  // Get scorer functions from namespace
  const getScorer = () => window.VoxPage.contentScorer || {};

  // Store extracted paragraphs for highlighting
  let extractedParagraphs = [];

  /**
   * Feature 015: Unwanted container configuration
   * Patterns for identifying non-content containers to filter
   * @const {Object}
   */
  const UNWANTED_CONFIG = {
    patterns: [
      // Table of contents
      'toc', 'table-of-contents', 'contents-list',
      // Info boxes
      'infobox', 'info-box', 'sidebar-content', 'portable-infobox',
      // Navigation
      'navbox', 'nav-box', 'navigation-box',
      // Wiki-specific
      'hatnote', 'dablink', 'rellink',
      'reference', 'reflist', 'citations',
      'see-also', 'external-links',
      'edit-section', 'mw-editsection',
      // Fextralife specific
      'bonfire', 'widget', 'boss-card', 'enemy-card', 'item-card',
      'wiki-table-wrapper', 'build-planner',
      'inline-nav', 'related-', 'quick-link',
      'map-marker', 'location-card',
      // Generic
      'card', 'box', 'panel', 'aside',
      'summary', 'stat-block', 'stats-table',
      // Interactive elements
      'calculator', 'planner', 'builder', 'tool-',
      // Ad/promo containers
      'promo', 'sponsor', 'advertisement', 'ad-'
    ],
    unwantedTags: ['aside', 'figure'],
    wikiSelectors: [
      '#wiki-content-block', '.wiki-content',
      '#mw-content-text', '.mw-parser-output',
      '#WikiaArticle', '.page-content'
    ]
  };

  /**
   * Feature 015: Pre-filter document clone before Readability
   * Removes unwanted elements (cards, infoboxes, etc.) from the cloned document
   * MUST be called BEFORE passing to Readability to prevent card content in audio
   * @param {Document} docClone - Cloned document to filter
   * @returns {number} - Number of elements removed
   */
  function preFilterDocumentForReadability(docClone) {
    let removedCount = 0;

    // Build comprehensive selector list for unwanted elements
    const classSelectors = UNWANTED_CONFIG.patterns.map(p => `[class*="${p}"]`).join(', ');
    const idSelectors = UNWANTED_CONFIG.patterns.map(p => `[id*="${p}"]`).join(', ');
    const tagSelectors = UNWANTED_CONFIG.unwantedTags.join(', ');

    // Also target specific Fextralife structures
    const fextralifeSelectors = [
      '.infobox', '.navbox', '.toc', '.sidebar',
      '[class*="card"]', '[class*="widget"]', '[class*="bonfire"]',
      '[class*="boss-"]', '[class*="enemy-"]', '[class*="item-"]',
      '[class*="stat"]', '[class*="inline-nav"]',
      'table:not(.wikitable)', // Most wiki tables are stat tables
      '.reference', '.reflist', '.external-links', '.see-also'
    ].join(', ');

    // Combine all selectors
    const combinedSelector = [classSelectors, idSelectors, tagSelectors, fextralifeSelectors]
      .filter(s => s.length > 0)
      .join(', ');

    try {
      const unwantedElements = docClone.querySelectorAll(combinedSelector);
      console.log(`VoxPage: Pre-filter found ${unwantedElements.length} potentially unwanted elements`);

      for (const el of unwantedElements) {
        // Don't remove the wiki content container itself
        if (el.id === 'wiki-content-block' || el.id === 'mw-content-text' ||
            el.classList.contains('wiki-content') || el.classList.contains('mw-parser-output')) {
          continue;
        }

        // Check if this is a significant content container (has many paragraphs)
        const paragraphCount = el.querySelectorAll('p').length;
        if (paragraphCount > 10) {
          // This might be a main content area, skip it
          console.log(`VoxPage: Skipping removal of element with ${paragraphCount} paragraphs`);
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

      console.log(`VoxPage: Pre-filter removed ${removedCount} unwanted elements`);
    } catch (e) {
      console.error('VoxPage: Pre-filter error:', e);
    }

    return removedCount;
  }

  /**
   * Feature 015: Sort elements by document position
   * Uses compareDocumentPosition() for O(n log n) sorting
   * @param {Element[]} elements - Array of DOM elements
   * @returns {Element[]} - Sorted array (mutates original)
   */
  function sortByDocumentPosition(elements) {
    return elements.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  /**
   * Get extracted paragraphs
   * @returns {Element[]}
   */
  function getExtractedParagraphs() {
    return extractedParagraphs;
  }

  /**
   * Get paragraph texts as an array
   * This returns the exact text content of each extracted DOM paragraph,
   * ensuring TTS paragraph indices match DOM paragraph indices for highlighting.
   * @returns {string[]}
   */
  function getParagraphTexts() {
    return extractedParagraphs
      .map(el => el.textContent.trim())
      .filter(text => text.length > 0);
  }

  /**
   * Set extracted paragraphs
   * @param {Element[]} paragraphs
   */
  function setExtractedParagraphs(paragraphs) {
    extractedParagraphs = paragraphs;
  }

  /**
   * Extract text from the page based on mode
   * @param {string} mode - Extraction mode: 'selection', 'article', or 'full'
   * @returns {string}
   */
  function extractText(mode) {
    console.log(`VoxPage: extractText() called with mode: "${mode}"`);
    switch (mode) {
      case 'selection':
        return extractSelection();
      case 'article':
        return extractArticle();
      case 'full':
      default:
        console.log('VoxPage: Using full page extraction (consider using article mode)');
        return extractFullPage();
    }
  }

  /**
   * Extract selected text and find corresponding DOM elements for highlighting
   * @returns {string}
   */
  function extractSelection() {
    const selection = window.getSelection();
    if (!selection || !selection.toString().trim()) {
      return '';
    }

    const text = selection.toString();

    // Find DOM elements that contain the selection for highlighting
    const selectedElements = [];
    const range = selection.getRangeAt(0);

    if (range) {
      // Get the common ancestor and find all paragraph-like elements within
      const container = range.commonAncestorContainer;
      const containerEl = container.nodeType === Node.ELEMENT_NODE
        ? container
        : container.parentElement;

      if (containerEl) {
        // If selection is within a single paragraph-like element, use it
        const paragraphParent = containerEl.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, div, article, section');
        if (paragraphParent && paragraphParent.textContent.includes(text.substring(0, 50))) {
          selectedElements.push(paragraphParent);
        } else {
          // Selection spans multiple elements - find all paragraph elements in range
          const walker = document.createTreeWalker(
            containerEl,
            NodeFilter.SHOW_ELEMENT,
            {
              acceptNode: (node) => {
                if (['P', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(node.tagName)) {
                  if (selection.containsNode(node, true)) {
                    return NodeFilter.FILTER_ACCEPT;
                  }
                }
                return NodeFilter.FILTER_SKIP;
              }
            }
          );

          let node;
          while ((node = walker.nextNode())) {
            if (node.textContent.trim().length > 10) {
              selectedElements.push(node);
            }
          }
        }
      }
    }

    // Store DOM elements for highlighting (or empty if we couldn't find them)
    extractedParagraphs = selectedElements.length > 0 ? selectedElements : [];

    // Log for debugging
    console.log(`VoxPage: Selection extracted ${text.length} chars, ${extractedParagraphs.length} DOM elements`);

    return text;
  }

  /**
   * Extract main article content using Mozilla Readability
   * Falls back to heuristics if Readability fails
   * @returns {string}
   */
  function extractArticle() {
    console.log('VoxPage: extractArticle() called');
    console.log('VoxPage: Readability available:', typeof window.Readability);
    console.log('VoxPage: isProbablyReaderable available:', typeof window.isProbablyReaderable);

    // Try Mozilla Readability first (best content extraction)
    const readabilityResult = tryReadabilityExtraction();
    if (readabilityResult) {
      console.log('VoxPage: Used Readability for extraction');
      console.log('VoxPage: Extracted paragraphs count:', extractedParagraphs.length);
      return readabilityResult;
    }

    // Fallback to manual heuristics
    console.log('VoxPage: Readability failed, using heuristic extraction');
    const result = extractArticleHeuristic();
    console.log('VoxPage: Heuristic extracted paragraphs count:', extractedParagraphs.length);
    return result;
  }

  /**
   * Try to extract content using Mozilla Readability
   * Feature 015: Now pre-filters document to exclude cards/infoboxes BEFORE extraction
   * @returns {string|null}
   */
  function tryReadabilityExtraction() {
    try {
      // Check if Readability is available
      if (typeof window.Readability !== 'function') {
        console.log('VoxPage: Readability not available');
        return null;
      }

      // Check if page is probably readable
      if (typeof window.isProbablyReaderable === 'function') {
        if (!window.isProbablyReaderable(document)) {
          console.log('VoxPage: Page not suitable for Readability');
          return null;
        }
      }

      // Clone document to avoid modifying the original
      const documentClone = document.cloneNode(true);

      // Feature 015: Pre-filter BEFORE Readability to remove cards/infoboxes
      // This ensures audio content doesn't include card text
      const removedCount = preFilterDocumentForReadability(documentClone);
      console.log(`VoxPage: Pre-filtered ${removedCount} elements before Readability`);

      // Parse with Readability
      const reader = new window.Readability(documentClone, {
        charThreshold: 100,  // Lower threshold for shorter articles
        keepClasses: false,  // Clean output
      });

      const article = reader.parse();

      if (!article || !article.textContent || article.textContent.trim().length < 100) {
        console.log('VoxPage: Readability returned insufficient content');
        return null;
      }

      console.log(`VoxPage: Readability extracted ${article.textContent.length} chars (after pre-filtering)`);

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
      const meaningfulParagraphs = [];
      const seenTexts = new Set();

      for (const el of paragraphElements) {
        const text = el.textContent.trim();
        if (text.length < 20) continue;

        // Deduplicate
        const normalizedText = text.toLowerCase().substring(0, 100);
        if (seenTexts.has(normalizedText)) continue;
        seenTexts.add(normalizedText);

        meaningfulParagraphs.push(el);
      }

      // Now find corresponding elements in the actual DOM for highlighting
      extractedParagraphs = findMatchingDOMElements(meaningfulParagraphs);

      console.log(`VoxPage: Found ${extractedParagraphs.length} paragraphs for highlighting`);

      // Feature 015: Return ONLY the text from matched DOM paragraphs
      // This ensures audio matches exactly what will be highlighted
      if (extractedParagraphs.length > 0) {
        const filteredText = extractedParagraphs
          .map(el => el.textContent.trim())
          .filter(text => text.length > 0)
          .join('\n\n');
        console.log(`VoxPage: Returning filtered text (${filteredText.length} chars) from ${extractedParagraphs.length} matched paragraphs`);
        return filteredText;
      }

      // Fallback to article textContent if no paragraphs matched
      return article.textContent;
    } catch (e) {
      console.error('VoxPage: Readability extraction failed:', e);
      return null;
    }
  }

  /**
   * Create a text fingerprint for fuzzy matching
   * Normalizes text to handle differences between Readability output and live DOM
   * @param {string} text
   * @returns {string}
   */
  function createTextFingerprint(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .replace(/[^\w\s]/g, '')   // Remove punctuation
      .trim()
      .substring(0, 50);         // Use first 50 chars for comparison
  }

  /**
   * Check if two texts match using fuzzy comparison
   * @param {string} text1
   * @param {string} text2
   * @returns {boolean}
   */
  function textsMatch(text1, text2) {
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
    return (matches / minLen) >= 0.8;
  }

  /**
   * Find matching DOM elements for extracted paragraphs
   * Uses improved fuzzy matching and wiki-specific selectors
   * Feature 015: Improved with document position sorting, pre-filtering,
   * fingerprint map for O(1) lookup, and performance timing
   * @param {Element[]} extractedEls - Elements from parsed content
   * @returns {Element[]}
   */
  function findMatchingDOMElements(extractedEls) {
    const startTime = performance.now();
    const scorer = getScorer();
    const matchedElements = [];
    const seenFingerprints = new Set();

    // Try wiki-specific content containers first for better targeting
    const wikiContainer = findWikiContentContainer();
    const isKnownContentContainer = !!wikiContainer;

    // Build comprehensive selector list including wiki-specific patterns
    const selectors = [
      // Wiki-specific selectors (Fextralife, Wikipedia, Fandom)
      '#wiki-content-block p', '.wiki-content p', '#WikiaArticle p',
      '#mw-content-text p', '.mw-parser-output p', '.page-content p',
      // Standard paragraph selectors
      'article p', 'main p', '[role="main"] p',
      '.article-content p', '.entry-content p', '.post-content p',
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Other content elements
      'blockquote', 'li'
    ];

    // Get DOM paragraphs, preferring wiki container if found
    const searchRoot = wikiContainer || document;
    let domParagraphs = [];

    for (const selector of selectors) {
      try {
        const elements = searchRoot.querySelectorAll(selector);
        domParagraphs.push(...elements);
      } catch (e) {
        // Ignore invalid selectors
      }
    }

    // Fallback: get all paragraph-like elements
    if (domParagraphs.length === 0) {
      domParagraphs = Array.from(document.querySelectorAll(
        'p, h1, h2, h3, h4, h5, h6, li, blockquote'
      ));
    }

    // Remove duplicates and sort by document position (FR-001)
    domParagraphs = [...new Set(domParagraphs)];
    sortByDocumentPosition(domParagraphs);

    // Pre-filter DOM paragraphs to remove those in unwanted containers
    const filteredDomParagraphs = domParagraphs.filter(domEl => {
      if (isKnownContentContainer) {
        return !isInsideUnwantedSubContainer(domEl, wikiContainer);
      } else {
        return !scorer.isInsideUnwantedElement?.(domEl);
      }
    });

    console.log(`VoxPage: Searching ${filteredDomParagraphs.length} DOM elements for matches (wiki container: ${isKnownContentContainer}, filtered from ${domParagraphs.length})`);

    // Build a map of fingerprint -> all matching DOM elements
    const fingerprintToElements = new Map();
    for (const domEl of filteredDomParagraphs) {
      const domText = domEl.textContent.trim();
      if (domText.length < 20) continue;

      const fingerprint = createTextFingerprint(domText);
      if (!fingerprintToElements.has(fingerprint)) {
        fingerprintToElements.set(fingerprint, []);
      }
      fingerprintToElements.get(fingerprint).push(domEl);
    }

    // Match extracted elements to DOM using fuzzy text matching
    for (const extractedEl of extractedEls) {
      const targetText = extractedEl.textContent.trim();
      if (targetText.length < 20) continue;

      const targetFingerprint = createTextFingerprint(targetText);
      if (seenFingerprints.has(targetFingerprint)) continue;

      // Find matching element in DOM - prefer exact fingerprint match first
      let bestMatch = null;

      // Check for exact fingerprint match
      if (fingerprintToElements.has(targetFingerprint)) {
        const candidates = fingerprintToElements.get(targetFingerprint);
        // If multiple matches, prefer ones not already used
        for (const candidate of candidates) {
          const candidateFp = createTextFingerprint(candidate.textContent.trim());
          if (!seenFingerprints.has(candidateFp)) {
            bestMatch = candidate;
            break;
          }
        }
      }

      // Fall back to fuzzy matching if no exact match
      if (!bestMatch) {
        for (const domEl of filteredDomParagraphs) {
          const domText = domEl.textContent.trim();
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
        const domFingerprint = createTextFingerprint(bestMatch.textContent.trim());
        seenFingerprints.add(domFingerprint);
        seenFingerprints.add(targetFingerprint);
        matchedElements.push(bestMatch);
      }
    }

    // If matching failed, fall back to direct DOM extraction
    if (matchedElements.length === 0 && extractedEls.length > 0) {
      console.log('VoxPage: Readability matching failed, using direct DOM extraction');
      return extractParagraphsDirectlyFromDOM();
    }

    // Sort matched elements by document order to ensure correct reading sequence (FR-004)
    sortByDocumentPosition(matchedElements);

    // Feature 015: Log matching statistics for performance monitoring
    const endTime = performance.now();
    const matchTime = (endTime - startTime).toFixed(2);
    console.log(`VoxPage: Matching stats - extracted: ${extractedEls.length}, ` +
      `candidates: ${domParagraphs.length}, filtered: ${filteredDomParagraphs.length}, ` +
      `matched: ${matchedElements.length}, time: ${matchTime}ms`);

    return matchedElements;
  }

  /**
   * Find wiki-specific content container
   * @returns {Element|null}
   */
  function findWikiContentContainer() {
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
      '.article-content'
    ];

    for (const selector of wikiContainerSelectors) {
      const container = document.querySelector(selector);
      if (container && container.textContent.length > 200) {
        console.log(`VoxPage: Found wiki container: ${selector}`);
        return container;
      }
    }

    return null;
  }

  /**
   * Check if element is inside an unwanted sub-container within the content area
   * This is a lighter check than the full isInsideUnwantedElement - only checks
   * immediate parents for things like TOC, infoboxes, etc. within the content
   * @param {Element} el - Element to check
   * @param {Element} contentContainer - The content container boundary
   * @returns {boolean}
   */
  function isInsideUnwantedSubContainer(el, contentContainer) {
    // Patterns for sub-containers within content that should be skipped
    const unwantedSubPatterns = [
      // Table of contents
      'toc', 'table-of-contents', 'contents-list',
      // Info boxes / cards (generic)
      'infobox', 'info-box', 'sidebar-content', 'portable-infobox',
      // Navigation boxes
      'navbox', 'nav-box', 'navigation-box',
      // Wikipedia/MediaWiki specific
      'hatnote', 'dablink', 'rellink',
      'reference', 'reflist', 'citations',
      'see-also', 'external-links',
      'edit-section', 'mw-editsection',
      // Fextralife wiki specific
      'bonfire', 'widget', 'boss-card', 'enemy-card', 'item-card',
      'wiki-table-wrapper', 'build-planner',
      'inline-nav', 'related-', 'quick-link',
      'map-marker', 'location-card',
      // General card/box patterns
      'card', 'box', 'panel', 'aside',
      'summary', 'stat-block', 'stats-table',
      // Interactive elements
      'calculator', 'planner', 'builder', 'tool-',
      // Ad/promo containers
      'promo', 'sponsor', 'advertisement', 'ad-'
    ];

    // Check if element is inside a table (often used for stat boxes on wikis)
    const table = el.closest('table');
    if (table && table !== el) {
      // Tables in wiki content are usually stat/info boxes, not article text
      // Exception: tables that are part of article content (very large with p tags)
      const tableParagraphs = table.querySelectorAll('p');
      if (tableParagraphs.length < 3) {
        return true;  // Likely a stat/info table, not content
      }
    }

    let parent = el.parentElement;
    while (parent && parent !== contentContainer && parent !== document.body) {
      const classId = ((parent.className || '') + ' ' + (parent.id || '')).toLowerCase();

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
   * @returns {Element[]}
   */
  function extractParagraphsDirectlyFromDOM() {
    const scorer = getScorer();
    const paragraphs = [];
    const seenFingerprints = new Set();

    // Try to find the main content container
    const wikiContainer = findWikiContentContainer();
    const container = wikiContainer ||
                      document.querySelector('article') ||
                      document.querySelector('main') ||
                      document.querySelector('[role="main"]') ||
                      document.body;

    // Track if we found a known content container (skip aggressive filtering if so)
    const isKnownContentContainer = !!wikiContainer ||
                                     container.tagName === 'ARTICLE' ||
                                     container.tagName === 'MAIN';

    console.log(`VoxPage: Direct extraction from container: ${container.tagName}${container.id ? '#' + container.id : ''} (known: ${isKnownContentContainer})`);

    // Get all paragraph-like elements
    const candidates = container.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, blockquote'
    );

    console.log(`VoxPage: Found ${candidates.length} candidate elements`);

    for (const el of candidates) {
      // If we're in a known content container, only check for unwanted sub-containers
      // Otherwise, use the full parent chain check
      if (isKnownContentContainer) {
        if (isInsideUnwantedSubContainer(el, container)) continue;
      } else {
        if (scorer.isInsideUnwantedElement?.(el)) continue;
      }

      const text = el.textContent.trim();

      // Minimum length check
      if (text.length < 30) continue;

      // Skip navigation-like text (but be less aggressive for known content)
      if (!isKnownContentContainer && scorer.isNavigationText?.(text)) continue;

      // Skip high link density (navigation) - more lenient threshold for known content
      const linkText = Array.from(el.querySelectorAll('a'))
        .reduce((sum, a) => sum + a.textContent.length, 0);
      const linkThreshold = isKnownContentContainer ? 0.7 : 0.5;
      if (linkText > text.length * linkThreshold) continue;

      // Skip fixed/sticky elements
      try {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') continue;
      } catch (e) {}

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

      const text = el.textContent.trim();
      if (text.length < 30) continue;
      if (!isKnownContentContainer && scorer.isNavigationText?.(text)) continue;

      const linkText = Array.from(el.querySelectorAll('a'))
        .reduce((sum, a) => sum + a.textContent.length, 0);
      const linkThreshold = isKnownContentContainer ? 0.7 : 0.5;
      if (linkText > text.length * linkThreshold) continue;

      const fingerprint = createTextFingerprint(text);
      if (seenFingerprints.has(fingerprint)) continue;
      seenFingerprints.add(fingerprint);

      paragraphs.push(el);
    }

    console.log(`VoxPage: Direct extraction found ${paragraphs.length} paragraphs`);
    return paragraphs;
  }

  /**
   * Extract article using heuristics (fallback)
   * @returns {string}
   */
  function extractArticleHeuristic() {
    const scorer = getScorer();

    // Priority 1: Wiki-specific selectors
    const wikiSelectors = [
      '#wiki-content-block', '.wiki-content', '#WikiaArticle',
      '#mw-content-text', '.mw-parser-output', '#bodyContent',
      '.page-content', '#content-wrapper',
    ];

    // Priority 2: Standard article selectors
    const articleSelectors = [
      'article[role="main"]', 'main article', '[role="main"] article',
      'article.post', 'article.entry', '.post-content', '.article-content',
      '.article-body', '.entry-content', '.story-body', '.markdown-body', '.prose',
    ];

    // Priority 3: Generic content containers
    const genericSelectors = [
      '[role="main"]', 'main', '#main-content', '#content', '.content-area',
    ];

    let articleElement = null;

    // Try wiki selectors first
    for (const selector of wikiSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.length > 500 && !scorer.isNavigationElement?.(el)) {
        articleElement = el;
        break;
      }
    }

    // Try article selectors
    if (!articleElement) {
      for (const selector of articleSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.length > 500 && !scorer.isNavigationElement?.(el)) {
          articleElement = el;
          break;
        }
      }
    }

    // Try generic selectors
    if (!articleElement) {
      for (const selector of genericSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.length > 500 && !scorer.isNavigationElement?.(el)) {
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
   * Find the best content block using a scoring algorithm
   * @returns {Element|null}
   */
  function findBestContentBlock() {
    const scorer = getScorer();
    const candidates = document.querySelectorAll('div, section, article, main');
    let bestElement = null;
    let bestScore = 0;

    for (const el of candidates) {
      if (scorer.isNavigationElement?.(el)) continue;
      if (el.textContent.length < 500) continue;

      const score = scorer.calculateContentScore?.(el) || 0;
      if (score > bestScore) {
        bestScore = score;
        bestElement = el;
      }
    }

    return bestElement;
  }

  /**
   * Extract clean text from an element
   * @param {Element} element - Element to extract from
   * @returns {string}
   */
  function extractCleanTextFromElement(element) {
    const scorer = getScorer();
    const clone = element.cloneNode(true);

    const unwantedSelectors = [
      'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
      'nav', 'header', 'footer', 'aside',
      '.nav', '.navigation', '.menu', '.sidebar', '.footer', '.header',
      '.advertisement', '.ad', '.ads', '.adsbygoogle', '.social-share',
      '.comments', '#comments', '.comment-section', '.disqus',
      '.related', '.related-posts', '.recommended',
      '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
      '.hidden', '[hidden]', '[aria-hidden="true"]',
      '.toc', '.table-of-contents', '#toc',
      '.infobox', '.infobox-wrapper', '.navbox', '.navbox-wrapper',
      '.mw-editsection', '.reference', '.references',
      'form', 'input', 'button', 'select', 'textarea',
      '.breadcrumb', '.breadcrumbs', '.pagination',
      '.author-bio', '.author-box', '.share-buttons', '.social-buttons',
      '.newsletter', '.subscribe', '.popup', '.modal',
      '[class*="cookie"]', '[id*="cookie"]', '[class*="banner"]', '[id*="banner"]',
    ];

    for (const selector of unwantedSelectors) {
      try {
        clone.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) {}
    }

    const texts = [];
    const walker = document.createTreeWalker(
      clone, NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          const text = node.textContent.trim();
          if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let currentBlock = '';
    let lastParent = null;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const isBlock = parent && scorer.isBlockElement?.(parent);
      const isNewBlock = isBlock && parent !== lastParent;

      if (isNewBlock && currentBlock.trim()) {
        texts.push(currentBlock.trim());
        currentBlock = '';
      }

      currentBlock += node.textContent + ' ';
      lastParent = parent;
    }

    if (currentBlock.trim()) {
      texts.push(currentBlock.trim());
    }

    const filteredTexts = texts.filter(text => {
      if (text.length < 30) return false;
      if (scorer.isNavigationText?.(text)) return false;
      const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
      if (alphaRatio < 0.5) return false;
      return true;
    });

    return filteredTexts.join('\n\n');
  }

  /**
   * Find content paragraphs within an element
   * @param {Element} container - Container element
   * @returns {Element[]}
   */
  function findContentParagraphs(container) {
    const scorer = getScorer();
    const paragraphs = [];
    const seenTexts = new Set();

    const candidates = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, .wiki-paragraph, article p, .content p');

    for (const el of candidates) {
      if (scorer.isInsideUnwantedElement?.(el)) continue;
      const text = el.textContent.trim();
      if (text.length < 30) continue;
      if (scorer.isNavigationText?.(text)) continue;

      const linkText = Array.from(el.querySelectorAll('a')).reduce((sum, a) => sum + a.textContent.length, 0);
      if (linkText > text.length * 0.5) continue;

      const normalizedText = text.toLowerCase().substring(0, 100);
      if (seenTexts.has(normalizedText)) continue;
      seenTexts.add(normalizedText);

      const computedStyle = window.getComputedStyle(el);
      if (computedStyle.position === 'fixed' || computedStyle.position === 'sticky') continue;

      paragraphs.push(el);
    }

    // Content-focused list items
    const contentLists = container.querySelectorAll('.wiki-content li, .content li, article li, .prose li, .article-body li, [role="main"] li');
    for (const el of contentLists) {
      if (scorer.isInsideUnwantedElement?.(el)) continue;
      const text = el.textContent.trim();
      if (text.length < 30) continue;
      if (scorer.isNavigationText?.(text)) continue;

      const linkText = Array.from(el.querySelectorAll('a')).reduce((sum, a) => sum + a.textContent.length, 0);
      if (linkText > text.length * 0.5) continue;

      const normalizedText = text.toLowerCase().substring(0, 100);
      if (seenTexts.has(normalizedText)) continue;
      seenTexts.add(normalizedText);

      paragraphs.push(el);
    }

    return paragraphs;
  }

  /**
   * Extract all readable text from the page
   * @returns {string}
   */
  function extractFullPage() {
    const body = document.body;
    if (!body) return '';

    const text = extractTextFromElement(body);
    extractedParagraphs = findParagraphElements(body);
    return text;
  }

  /**
   * Extract readable text from an element
   * @param {Element} element - Element to extract from
   * @returns {string}
   */
  function extractTextFromElement(element) {
    const scorer = getScorer();
    const clone = element.cloneNode(true);

    const unwantedSelectors = [
      'script', 'style', 'noscript', 'iframe', 'svg',
      'nav', 'header', 'footer', 'aside',
      '.nav', '.navigation', '.menu', '.sidebar', '.footer', '.header',
      '.advertisement', '.ad', '.ads', '.social-share',
      '.comments', '#comments', '.comment-section',
      '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
      '.hidden', '[hidden]', '[aria-hidden="true"]'
    ];

    for (const selector of unwantedSelectors) {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    }

    const texts = [];
    const walker = document.createTreeWalker(
      clone, NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let currentBlock = '';

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const isBlock = parent && scorer.isBlockElement?.(parent);

      if (isBlock && currentBlock) {
        texts.push(currentBlock.trim());
        currentBlock = '';
      }

      currentBlock += node.textContent + ' ';
    }

    if (currentBlock.trim()) {
      texts.push(currentBlock.trim());
    }

    return texts.join('\n\n');
  }

  /**
   * Find paragraph elements for highlighting
   * @param {Element} container - Container element
   * @returns {Element[]}
   */
  function findParagraphElements(container) {
    const scorer = getScorer();
    const paragraphs = [];
    const walker = document.createTreeWalker(
      container, NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (scorer.isBlockElement?.(node) && node.textContent.trim().length > 20) {
            const nestedBlocks = node.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li');
            const hasNestedContent = Array.from(nestedBlocks).some(b => b.textContent.trim().length > 50);
            if (!hasNestedContent || node.tagName === 'P' || node.tagName === 'LI') {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    while (walker.nextNode()) {
      paragraphs.push(walker.currentNode);
    }

    return paragraphs;
  }

  /**
   * Split text into paragraphs
   * @param {string} text - Text to split
   * @returns {string[]}
   */
  function splitTextIntoParagraphs(text) {
    return text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  /**
   * Find a DOM element that contains the given text
   * @param {string} searchText - Text to search for
   * @returns {Element|null}
   */
  function findElementByText(searchText) {
    if (!searchText || searchText.length < 10) return null;

    const normalizedSearch = searchText.toLowerCase().replace(/\s+/g, ' ').trim();

    for (const el of extractedParagraphs) {
      const elText = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
      if (elText.startsWith(normalizedSearch) || elText.includes(normalizedSearch)) {
        return el;
      }
    }

    const blockElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, div.content, article p');
    for (const el of blockElements) {
      const elText = el.textContent?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
      if (elText.startsWith(normalizedSearch) || elText.includes(normalizedSearch)) {
        return el;
      }
    }

    return null;
  }

  // Export to VoxPage namespace
  window.VoxPage.contentExtractor = {
    extractText,
    extractSelection,
    extractArticle,
    extractFullPage,
    findBestContentBlock,
    findContentParagraphs,
    findElementByText,
    getExtractedParagraphs,
    setExtractedParagraphs,
    getParagraphTexts
  };

  console.log('VoxPage: content-extractor.js loaded');
})();
