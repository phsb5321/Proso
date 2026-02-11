/**
 * Content Scorer Port Interface
 *
 * Defines the contract for content relevance scoring.
 * Adapters: TrafilaturaScorerAdapter (custom scoring algorithm)
 *
 * @module ports/content-scorer
 */

/**
 * Content relevance score with breakdown.
 */
export interface ContentScore {
  readonly score: number;
  readonly paragraphCount: number;
  readonly linkDensity: number;
  readonly headingCount: number;
}

/**
 * Port interface for content relevance scoring.
 *
 * Implementations:
 * - TrafilaturaScorerAdapter - Custom Trafilatura-inspired scoring
 */
export interface IContentScorer {
  /**
   * Score an element for content relevance.
   * @param element - DOM element to score
   */
  scoreElement(element: Element): ContentScore;

  /**
   * Score HTML content.
   * @param html - HTML string to score
   */
  scoreHtml(html: string): ContentScore;

  /**
   * Find the best content container in a document.
   * @param document - Document to search
   * @returns Best container element or null
   */
  findBestContainer(document: Document): Element | null;
}
