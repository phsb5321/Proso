/**
 * Content Scorer
 * Heuristic scoring algorithms for detecting main article content.
 * Used to differentiate article text from navigation, ads, and other non-content.
 *
 * @module content/content-scorer
 */

// Wrap in IIFE to avoid variable name collisions with other content scripts
(function() {
  'use strict';

  // Initialize VoxPage namespace
  window.VoxPage = window.VoxPage || {};

  /**
   * Calculate a content score for an element
   * Higher scores indicate more likely to be main content
   * @param {Element} element - Element to score
   * @returns {number} Content score
   */
  function calculateContentScore(element) {
    let score = 0;

    // Count meaningful paragraphs (not just short text snippets)
    const paragraphs = element.querySelectorAll('p');
    const meaningfulParagraphs = Array.from(paragraphs).filter(p => p.textContent.trim().length > 50);
    score += meaningfulParagraphs.length * 10;

    // Text length (but diminishing returns after a point)
    const textLength = element.textContent.length;
    score += Math.min(textLength / 100, 50);

    // Penalize high link density (navigation-like)
    const linkDensity = calculateLinkDensity(element);
    score -= linkDensity * 100;

    // Bonus for having headings (article structure)
    const headings = element.querySelectorAll('h1, h2, h3, h4');
    score += headings.length * 5;

    // Penalty for navigation-like class/id names
    const classId = (element.className + ' ' + element.id).toLowerCase();
    const navKeywords = ['nav', 'menu', 'sidebar', 'footer', 'header', 'comment', 'ad', 'social', 'share', 'related'];
    for (const keyword of navKeywords) {
      if (classId.includes(keyword)) {
        score -= 30;
      }
    }

    // Bonus for content-like class/id names
    const contentKeywords = ['content', 'article', 'post', 'entry', 'story', 'wiki', 'body', 'text', 'main'];
    for (const keyword of contentKeywords) {
      if (classId.includes(keyword)) {
        score += 20;
      }
    }

    return score;
  }

  /**
   * Calculate ratio of link text to total text
   * @param {Element} element - Element to analyze
   * @returns {number} Link density (0-1)
   */
  function calculateLinkDensity(element) {
    const links = element.querySelectorAll('a');
    let linkText = 0;
    links.forEach(a => linkText += a.textContent.length);
    const totalText = element.textContent.length || 1;
    return linkText / totalText;
  }

  /**
   * Check if element is likely navigation
   * @param {Element} element - Element to check
   * @returns {boolean}
   */
  function isNavigationElement(element) {
    const navClasses = ['nav', 'menu', 'sidebar', 'footer', 'header', 'navigation'];
    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();

    return navClasses.some(c => className.includes(c) || id.includes(c));
  }

  /**
   * Check if text looks like navigation/UI text
   * @param {string} text - Text to check
   * @returns {boolean}
   */
  function isNavigationText(text) {
    if (!text) return true;

    const trimmed = text.trim();

    // Very short text is suspicious
    if (trimmed.length < 30) {
      const navPatterns = [
        /^(home|menu|search|login|sign\s*(in|up|out)|register|contact|about|privacy|terms|help)/i,
        /^(wiki|news|reviews?|guides?|forums?|community|browse|explore|discover)/i,
        /^(prev(ious)?|next|back|forward|see\s+more|read\s+more|view\s+all|show\s+more)/i,
        /^(share|follow|subscribe|download|print|edit|report|flag)/i,
        /^(copyright|©|all\s+rights|powered\s+by)/i
      ];
      for (const pattern of navPatterns) {
        if (pattern.test(trimmed)) return true;
      }
    }

    // Text that's just a list of short words separated by spaces
    const words = trimmed.split(/\s+/);
    if (words.length >= 3 && words.length <= 10) {
      const avgWordLength = trimmed.replace(/\s+/g, '').length / words.length;
      if (avgWordLength < 7 && words.every(w => w.length < 15)) {
        const capitalizedCount = words.filter(w => /^[A-Z]/.test(w)).length;
        if (capitalizedCount >= words.length * 0.7) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if element is block-level
   * @param {Element} element - Element to check
   * @returns {boolean}
   */
  function isBlockElement(element) {
    const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
      'LI', 'BLOCKQUOTE', 'PRE', 'ARTICLE', 'SECTION', 'ASIDE',
      'HEADER', 'FOOTER', 'MAIN', 'FIGURE', 'FIGCAPTION'];
    return blockTags.includes(element.tagName);
  }

  /**
   * Check if an element is inside an unwanted container
   * @param {Element} element - Element to check
   * @returns {boolean}
   */
  function isInsideUnwantedElement(element) {
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      if (isNavigationElement(parent)) return true;

      const classId = (parent.className + ' ' + parent.id).toLowerCase();
      const tagName = parent.tagName.toLowerCase();

      if (tagName === 'nav' || tagName === 'header' || tagName === 'footer' || tagName === 'aside') {
        return true;
      }
      if (parent.getAttribute('role') === 'navigation' ||
          parent.getAttribute('role') === 'banner' ||
          parent.getAttribute('role') === 'complementary') {
        return true;
      }

      const unwantedPatterns = [
        'nav', 'menu', 'sidebar', 'footer', 'header', 'comment', 'ad-', 'social', 'share',
        'related', 'toc', 'infobox', 'breadcrumb', 'toolbar', 'topbar', 'bottom-bar',
        'widget', 'promo', 'banner', 'masthead', 'global-header', 'global-footer',
        'fex-header', 'fex-footer', 'site-header', 'site-footer', 'page-header', 'page-footer',
        'user-nav', 'user-menu', 'account-', 'login', 'signin', 'signup', 'auth-',
        'dropdown', 'flyout', 'mega-menu', 'subnav', 'submenu'
      ];
      for (const pattern of unwantedPatterns) {
        if (classId.includes(pattern)) return true;
      }

      parent = parent.parentElement;
    }
    return false;
  }

  // Export to VoxPage namespace
  window.VoxPage.contentScorer = {
    calculateContentScore,
    calculateLinkDensity,
    isNavigationElement,
    isNavigationText,
    isBlockElement,
    isInsideUnwantedElement
  };

  console.log('VoxPage: content-scorer.js loaded');
})();
