/**
 * Mock Content Scorer
 *
 * Mock implementation of IContentScorer for testing.
 * Provides configurable scoring behavior without DOM dependencies.
 *
 * @module tests/mocks/mock-content-scorer
 */

import type { IContentScorer, ContentScore } from '../../src/ports/content-scorer.port';

/**
 * Configuration for mock content scorer.
 */
export interface MockContentScorerConfig {
  /** Default score to return for all elements */
  defaultScore?: number;
  /** Default paragraph count */
  defaultParagraphCount?: number;
  /** Default link density */
  defaultLinkDensity?: number;
  /** Default heading count */
  defaultHeadingCount?: number;
}

/**
 * Mock content scorer for testing ContentExtractionService.
 *
 * Provides predictable scoring without requiring real DOM elements.
 * Can be configured to return specific scores for testing different scenarios.
 */
export class MockContentScorer implements IContentScorer {
  private defaultScore: number;
  private defaultParagraphCount: number;
  private defaultLinkDensity: number;
  private defaultHeadingCount: number;

  // Tracking for test assertions
  public scoreElementCalls: Array<{ element: Element }> = [];
  public scoreHtmlCalls: Array<{ html: string }> = [];
  public findBestContainerCalls: Array<{ document: Document }> = [];

  // Configurable return values
  private nextScore: ContentScore | null = null;
  private nextContainer: Element | null = null;

  constructor(config: MockContentScorerConfig = {}) {
    this.defaultScore = config.defaultScore ?? 100;
    this.defaultParagraphCount = config.defaultParagraphCount ?? 10;
    this.defaultLinkDensity = config.defaultLinkDensity ?? 0.1;
    this.defaultHeadingCount = config.defaultHeadingCount ?? 3;
  }

  scoreElement(element: Element): ContentScore {
    this.scoreElementCalls.push({ element });

    if (this.nextScore) {
      const score = this.nextScore;
      this.nextScore = null;
      return score;
    }

    // Simulate basic scoring based on element content
    const text = element.textContent || '';
    const paragraphs = element.querySelectorAll?.('p')?.length ?? this.defaultParagraphCount;
    const links = element.querySelectorAll?.('a')?.length ?? 0;
    const headings = element.querySelectorAll?.('h1, h2, h3, h4, h5, h6')?.length ?? this.defaultHeadingCount;

    const textLength = text.length;
    const linkDensity = textLength > 0 ? links / textLength : 0;

    return {
      score: this.defaultScore + paragraphs * 10 - linkDensity * 50,
      paragraphCount: paragraphs,
      linkDensity: Math.min(linkDensity, 1),
      headingCount: headings,
    };
  }

  scoreHtml(html: string): ContentScore {
    this.scoreHtmlCalls.push({ html });

    if (this.nextScore) {
      const score = this.nextScore;
      this.nextScore = null;
      return score;
    }

    // Simple regex-based scoring for HTML strings
    const paragraphMatches = html.match(/<p[^>]*>/gi) || [];
    const linkMatches = html.match(/<a[^>]*>/gi) || [];
    const headingMatches = html.match(/<h[1-6][^>]*>/gi) || [];

    const textLength = html.replace(/<[^>]*>/g, '').length;
    const linkDensity = textLength > 0 ? linkMatches.length / textLength : 0;

    return {
      score: this.defaultScore + paragraphMatches.length * 10,
      paragraphCount: paragraphMatches.length || this.defaultParagraphCount,
      linkDensity: Math.min(linkDensity, 1),
      headingCount: headingMatches.length || this.defaultHeadingCount,
    };
  }

  findBestContainer(document: Document): Element | null {
    this.findBestContainerCalls.push({ document });

    if (this.nextContainer !== undefined) {
      const container = this.nextContainer;
      this.nextContainer = null;
      return container;
    }

    // Return article, main, or body as best container
    const article = document.querySelector('article');
    if (article) return article;

    const main = document.querySelector('main');
    if (main) return main;

    const content = document.querySelector('#content, .content, [role="main"]');
    if (content) return content;

    return document.body;
  }

  // Test helpers

  /**
   * Reset all tracking.
   */
  reset(): void {
    this.scoreElementCalls = [];
    this.scoreHtmlCalls = [];
    this.findBestContainerCalls = [];
    this.nextScore = null;
    this.nextContainer = null;
  }

  /**
   * Configure the next score to return.
   */
  setNextScore(score: ContentScore): void {
    this.nextScore = score;
  }

  /**
   * Configure the next container to return from findBestContainer.
   */
  setNextContainer(container: Element | null): void {
    this.nextContainer = container;
  }

  /**
   * Set default score for all subsequent calls.
   */
  setDefaultScore(score: number): void {
    this.defaultScore = score;
  }

  /**
   * Get the default score configuration.
   */
  getDefaultContentScore(): ContentScore {
    return {
      score: this.defaultScore,
      paragraphCount: this.defaultParagraphCount,
      linkDensity: this.defaultLinkDensity,
      headingCount: this.defaultHeadingCount,
    };
  }
}

/**
 * Create a mock content scorer with default configuration.
 */
export function createMockContentScorer(config?: MockContentScorerConfig): MockContentScorer {
  return new MockContentScorer(config);
}
