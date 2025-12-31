/**
 * Content Extractor
 * Text extraction logic for web pages. Handles selection, article, and full page extraction.
 * Uses scoring algorithms to identify main content areas.
 *
 * @module content/content-extractor
 */

// Initialize VoxPage namespace
window.VoxPage = window.VoxPage || {};

// Get scorer functions from namespace
const getScorer = () => window.VoxPage.contentScorer || {};

// Store extracted paragraphs for highlighting
let extractedParagraphs = [];

/**
 * Get extracted paragraphs
 * @returns {Element[]}
 */
function getExtractedParagraphs() {
  return extractedParagraphs;
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
  switch (mode) {
    case 'selection':
      return extractSelection();
    case 'article':
      return extractArticle();
    case 'full':
    default:
      return extractFullPage();
  }
}

/**
 * Extract selected text
 * @returns {string}
 */
function extractSelection() {
  const selection = window.getSelection();
  if (selection && selection.toString().trim()) {
    const text = selection.toString();
    extractedParagraphs = splitTextIntoParagraphs(text);
    return text;
  }
  return '';
}

/**
 * Extract main article content using improved heuristics
 * @returns {string}
 */
function extractArticle() {
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
      console.log('VoxPage: Found wiki content via selector:', selector);
      break;
    }
  }

  // Try article selectors
  if (!articleElement) {
    for (const selector of articleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.length > 500 && !scorer.isNavigationElement?.(el)) {
        articleElement = el;
        console.log('VoxPage: Found article via selector:', selector);
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
        console.log('VoxPage: Found content via selector:', selector);
        break;
      }
    }
  }

  // Fallback: find the largest text block with good content score
  if (!articleElement) {
    articleElement = findBestContentBlock();
    if (articleElement) {
      console.log('VoxPage: Found content via scoring algorithm');
    }
  }

  if (articleElement) {
    const text = extractCleanTextFromElement(articleElement);
    extractedParagraphs = findContentParagraphs(articleElement);
    console.log('VoxPage: Extracted', extractedParagraphs.length, 'content paragraphs');
    return text;
  }

  console.warn('VoxPage: Could not find main content, using full page');
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

  console.log(`VoxPage: findContentParagraphs found ${paragraphs.length} paragraphs`);
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
  setExtractedParagraphs
};
