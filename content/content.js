/**
 * VoxPage Content Script
 * Handles text extraction and highlighting on web pages
 */

// Store extracted paragraphs for highlighting
let extractedParagraphs = [];
let highlightElements = [];

/**
 * Listen for messages from background script
 */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'extractText':
      const text = extractText(message.mode);
      browser.runtime.sendMessage({
        action: 'textContent',
        text: text,
        mode: message.mode
      });
      break;
    case 'highlight':
      highlightParagraph(message.index);
      break;
    case 'clearHighlight':
      clearHighlights();
      break;
  }
});

/**
 * Extract text from the page based on mode
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
 * Extract main article content using heuristics
 */
function extractArticle() {
  // Try common article selectors
  const articleSelectors = [
    'article',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '.post-body',
    '.article-body',
    '.story-body',
    'main',
    '#content',
    '.markdown-body',
    '.prose'
  ];

  let articleElement = null;

  // Try each selector
  for (const selector of articleSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      // Skip if too short or is navigation/sidebar
      if (el.textContent.length > 500 && !isNavigationElement(el)) {
        if (!articleElement || el.textContent.length > articleElement.textContent.length) {
          articleElement = el;
        }
      }
    }
  }

  // Fallback: find the largest text block
  if (!articleElement) {
    articleElement = findLargestTextBlock();
  }

  if (articleElement) {
    const text = extractTextFromElement(articleElement);
    extractedParagraphs = findParagraphElements(articleElement);
    return text;
  }

  // Final fallback to full page
  return extractFullPage();
}

/**
 * Extract all readable text from the page
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
 */
function extractTextFromElement(element) {
  // Clone to avoid modifying the page
  const clone = element.cloneNode(true);

  // Remove unwanted elements
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

  // Get text content
  let text = '';
  const walker = document.createTreeWalker(
    clone,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip hidden elements
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip empty text
        if (!node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const texts = [];
  let currentBlock = '';
  let lastNode = null;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;

    // Check if this is a block-level element
    const isBlock = parent && isBlockElement(parent);

    if (isBlock && currentBlock) {
      texts.push(currentBlock.trim());
      currentBlock = '';
    }

    currentBlock += node.textContent + ' ';
    lastNode = node;
  }

  if (currentBlock.trim()) {
    texts.push(currentBlock.trim());
  }

  return texts.join('\n\n');
}

/**
 * Check if element is block-level
 */
function isBlockElement(element) {
  const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'BLOCKQUOTE', 'PRE', 'ARTICLE', 'SECTION', 'ASIDE',
    'HEADER', 'FOOTER', 'MAIN', 'FIGURE', 'FIGCAPTION'];
  return blockTags.includes(element.tagName);
}

/**
 * Check if element is likely navigation
 */
function isNavigationElement(element) {
  const navClasses = ['nav', 'menu', 'sidebar', 'footer', 'header', 'navigation'];
  const className = element.className.toLowerCase();
  const id = element.id.toLowerCase();

  return navClasses.some(c => className.includes(c) || id.includes(c));
}

/**
 * Find the largest text block in the document
 */
function findLargestTextBlock() {
  const candidates = document.querySelectorAll('div, section, article');
  let largest = null;
  let maxLength = 0;

  for (const el of candidates) {
    // Skip navigation elements
    if (isNavigationElement(el)) continue;

    // Count direct text content
    const textLength = el.textContent.length;
    const linkDensity = calculateLinkDensity(el);

    // Good article content has low link density
    if (textLength > maxLength && linkDensity < 0.3) {
      maxLength = textLength;
      largest = el;
    }
  }

  return largest;
}

/**
 * Calculate ratio of link text to total text
 */
function calculateLinkDensity(element) {
  const links = element.querySelectorAll('a');
  let linkText = 0;
  links.forEach(a => linkText += a.textContent.length);
  const totalText = element.textContent.length || 1;
  return linkText / totalText;
}

/**
 * Find paragraph elements for highlighting
 */
function findParagraphElements(container) {
  const paragraphs = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (isBlockElement(node) && node.textContent.trim().length > 20) {
          // Check if it's a leaf block (no nested blocks with significant text)
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
 */
function splitTextIntoParagraphs(text) {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Highlight the current paragraph being read
 */
function highlightParagraph(index) {
  clearHighlights();

  if (index >= 0 && index < extractedParagraphs.length) {
    const element = extractedParagraphs[index];
    if (element && element.nodeType === Node.ELEMENT_NODE) {
      element.classList.add('voxpage-highlight');
      highlightElements.push(element);

      // Scroll into view smoothly
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }
}

/**
 * Clear all highlights
 */
function clearHighlights() {
  highlightElements.forEach(el => {
    el.classList.remove('voxpage-highlight');
  });
  highlightElements = [];

  // Also clear any stray highlights
  document.querySelectorAll('.voxpage-highlight').forEach(el => {
    el.classList.remove('voxpage-highlight');
  });
}

console.log('VoxPage content script loaded');
