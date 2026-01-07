/**
 * Trafilatura Scorer Adapter
 *
 * Adapter that implements IContentScorer using Trafilatura-inspired scoring.
 * Wraps the existing content scoring utilities.
 *
 * @module adapters/content/trafilatura-scorer
 */

import type { ContentScore, IContentScorer } from '../../ports/content-scorer.port';

/**
 * Keywords that indicate navigation elements (penalize score).
 */
const NAV_KEYWORDS = [
  'nav',
  'menu',
  'sidebar',
  'footer',
  'header',
  'comment',
  'ad',
  'social',
  'share',
  'related',
];

/**
 * Keywords that indicate content elements (boost score).
 */
const CONTENT_KEYWORDS = [
  'content',
  'article',
  'post',
  'entry',
  'story',
  'wiki',
  'body',
  'text',
  'main',
];

/**
 * Adapter that implements IContentScorer using Trafilatura-inspired scoring.
 *
 * Scoring algorithm:
 * - +10 per meaningful paragraph (>50 chars)
 * - +length/100 (capped at 50) for text content
 * - -100 * linkDensity for navigation-heavy elements
 * - +5 per heading (article structure)
 * - -30 for navigation-like class/id names
 * - +20 for content-like class/id names
 */
export class TrafilaturaScorerAdapter implements IContentScorer {
  /**
   * Score an element for content relevance.
   *
   * @param element - DOM element to score
   * @returns Content score with breakdown
   */
  scoreElement(element: Element): ContentScore {
    let score = 0;

    // Count meaningful paragraphs (not just short text snippets)
    const paragraphs = element.querySelectorAll('p');
    const meaningfulParagraphs = Array.from(paragraphs).filter(
      (p) => (p.textContent?.trim().length || 0) > 50,
    );
    const paragraphCount = meaningfulParagraphs.length;
    score += paragraphCount * 10;

    // Text length bonus (diminishing returns)
    const textLength = element.textContent?.length || 0;
    score += Math.min(textLength / 100, 50);

    // Link density penalty
    const linkDensity = this.calculateLinkDensity(element);
    score -= linkDensity * 100;

    // Heading bonus (article structure)
    const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const headingCount = headings.length;
    score += headingCount * 5;

    // Class/ID name analysis
    const classId = ((element.className || '') + ' ' + (element.id || '')).toLowerCase();

    // Navigation penalty
    for (const keyword of NAV_KEYWORDS) {
      if (classId.includes(keyword)) {
        score -= 30;
      }
    }

    // Content bonus
    for (const keyword of CONTENT_KEYWORDS) {
      if (classId.includes(keyword)) {
        score += 20;
      }
    }

    return {
      score,
      paragraphCount,
      linkDensity,
      headingCount,
    };
  }

  /**
   * Score HTML content.
   *
   * @param html - HTML string to score
   * @returns Content score with breakdown
   */
  scoreHtml(html: string): ContentScore {
    if (!html || html.trim().length === 0) {
      return {
        score: 0,
        paragraphCount: 0,
        linkDensity: 0,
        headingCount: 0,
      };
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      return this.scoreElement(doc.body);
    } catch {
      // Return empty score on parse failure
      return {
        score: 0,
        paragraphCount: 0,
        linkDensity: 0,
        headingCount: 0,
      };
    }
  }

  /**
   * Find the best content container in a document.
   *
   * @param document - Document to search
   * @returns Best container element or null
   */
  findBestContainer(document: Document): Element | null {
    // Priority: semantic containers, then scoring fallback
    const prioritySelectors = [
      // Wiki-specific containers
      '#wiki-content-block',
      '.wiki-content',
      '#mw-content-text',
      '.mw-parser-output',
      '#WikiaArticle',
      '.page-content',
      // Standard article containers
      'article[role="main"]',
      'main article',
      '[role="main"] article',
      'article.post',
      'article.entry',
      '.article-content',
      '.entry-content',
      '.post-content',
      '.story-body',
      '.markdown-body',
      '.prose',
      // Generic containers
      '[role="main"]',
      'main',
      '#main-content',
      '#content',
      '.content-area',
      'article',
    ];

    // Try priority selectors first
    for (const selector of prioritySelectors) {
      try {
        const el = document.querySelector(selector);
        if (el && this.isValidContentContainer(el)) {
          return el;
        }
      } catch {
        // Ignore selector errors
      }
    }

    // Fall back to scoring all candidate containers
    const candidates = document.querySelectorAll('div, section, article, main');
    let bestElement: Element | null = null;
    let bestScore = 0;

    for (const el of candidates) {
      // Skip obvious non-content elements
      if (this.isNavigationElement(el)) {
        continue;
      }

      // Skip elements with too little text
      if ((el.textContent?.length || 0) < 500) {
        continue;
      }

      const scoreResult = this.scoreElement(el);
      if (scoreResult.score > bestScore) {
        bestScore = scoreResult.score;
        bestElement = el;
      }
    }

    return bestElement;
  }

  /**
   * Calculate ratio of link text to total text.
   *
   * @param element - Element to analyze
   * @returns Link density (0-1)
   */
  private calculateLinkDensity(element: Element): number {
    const links = element.querySelectorAll('a');
    let linkText = 0;

    for (const a of links) {
      linkText += a.textContent?.length || 0;
    }

    const totalText = element.textContent?.length || 1;
    return linkText / totalText;
  }

  /**
   * Check if element is a valid content container.
   *
   * @param element - Element to check
   * @returns True if valid content container
   */
  private isValidContentContainer(element: Element): boolean {
    // Must have minimum text length
    const textLength = element.textContent?.length || 0;
    if (textLength < 500) {
      return false;
    }

    // Should not be navigation
    if (this.isNavigationElement(element)) {
      return false;
    }

    return true;
  }

  /**
   * Check if element is likely navigation.
   *
   * @param element - Element to check
   * @returns True if element appears to be navigation
   */
  private isNavigationElement(element: Element): boolean {
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const tagName = element.tagName.toLowerCase();

    // Check semantic tags
    if (['nav', 'header', 'footer', 'aside'].includes(tagName)) {
      return true;
    }

    // Check ARIA roles
    const role = element.getAttribute('role');
    if (role && ['navigation', 'banner', 'complementary'].includes(role)) {
      return true;
    }

    // Check class/id for nav patterns
    for (const keyword of NAV_KEYWORDS) {
      if (className.includes(keyword) || id.includes(keyword)) {
        return true;
      }
    }

    return false;
  }
}
