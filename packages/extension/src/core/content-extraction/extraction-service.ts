/**
 * Content Extraction Service
 *
 * Domain service for content extraction orchestration.
 * Depends only on port interfaces, not concrete implementations.
 *
 * @module core/content-extraction/extraction-service
 */

import type { ContentScore, IContentScorer } from '../../ports/content-scorer.port';
import type { ExtractedContent, ITextExtractor } from '../../ports/text-extractor.port';
import type { ContentExtractionError, ExtractionMode } from '../shared/errors';
import { contentError } from '../shared/errors';
import type { Result } from '../shared/result';
import { Err, Ok, isErr } from '../shared/result';

/**
 * Dependencies for ContentExtractionService.
 * Services depend only on port interfaces, never on adapters directly.
 */
export interface ContentExtractionServiceDependencies {
  /** Text extractor port (e.g., Readability) */
  textExtractor: ITextExtractor;
  /** Content scorer port (e.g., Trafilatura-inspired scorer) */
  contentScorer: IContentScorer;
}

/**
 * Extraction options.
 */
export interface ExtractionOptions {
  /** Extraction mode: selection, article, or full */
  mode: ExtractionMode;
  /** Minimum score threshold for valid content */
  minScoreThreshold?: number;
  /** Whether to validate extracted content */
  validateContent?: boolean;
}

/**
 * Extraction result with scoring metadata.
 */
export interface ScoredExtractedContent extends ExtractedContent {
  /** Content relevance score */
  contentScore: ContentScore;
}

/**
 * Default minimum score threshold.
 * Content with scores below this is considered non-meaningful.
 */
const DEFAULT_MIN_SCORE_THRESHOLD = 10;

/**
 * Minimum characters for valid content.
 */
const MIN_CONTENT_CHARACTERS = 100;

/**
 * ContentExtractionService
 *
 * Orchestrates content extraction by coordinating between
 * text extractor and content scorer ports.
 *
 * Responsibilities:
 * - Delegate extraction to ITextExtractor
 * - Delegate scoring to IContentScorer
 * - Validate extracted content meets quality thresholds
 * - Select appropriate extractor based on content type
 */
export class ContentExtractionService {
  private readonly deps: ContentExtractionServiceDependencies;

  constructor(deps: ContentExtractionServiceDependencies) {
    this.deps = deps;
  }

  /**
   * Extract content from a document or HTML string.
   *
   * @param documentOrHtml - Document object or HTML string
   * @param options - Extraction options
   * @returns Result with extracted content or error
   */
  async extract(
    documentOrHtml: Document | string,
    options: ExtractionOptions,
  ): Promise<Result<ExtractedContent, ContentExtractionError>> {
    const {
      mode,
      validateContent = true,
      minScoreThreshold = DEFAULT_MIN_SCORE_THRESHOLD,
    } = options;

    // Extract content using text extractor port
    const extractResult = await this.deps.textExtractor.extract(mode, documentOrHtml);

    if (isErr(extractResult)) {
      return extractResult;
    }

    const content = extractResult.value;

    // Validate content if requested
    if (validateContent) {
      const validationResult = this.validateExtractedContent(content, minScoreThreshold);
      if (isErr(validationResult)) {
        return validationResult;
      }
    }

    return Ok(content);
  }

  /**
   * Extract content with scoring metadata.
   *
   * @param documentOrHtml - Document object or HTML string
   * @param options - Extraction options
   * @returns Result with scored extracted content or error
   */
  async extractWithScore(
    documentOrHtml: Document | string,
    options: ExtractionOptions,
  ): Promise<Result<ScoredExtractedContent, ContentExtractionError>> {
    // First extract content
    const extractResult = await this.extract(documentOrHtml, {
      ...options,
      validateContent: false, // We'll validate after scoring
    });

    if (isErr(extractResult)) {
      return extractResult;
    }

    const content = extractResult.value;

    // Score the extracted content
    let contentScore: ContentScore;
    if (typeof documentOrHtml === 'string') {
      contentScore = this.deps.contentScorer.scoreHtml(documentOrHtml);
    } else {
      // For Document, find best container and score it
      const container = this.deps.contentScorer.findBestContainer(documentOrHtml);
      if (container) {
        contentScore = this.deps.contentScorer.scoreElement(container);
      } else {
        // Score the entire body
        contentScore = this.deps.contentScorer.scoreElement(documentOrHtml.body);
      }
    }

    // Validate if requested
    const { validateContent = true, minScoreThreshold = DEFAULT_MIN_SCORE_THRESHOLD } = options;
    if (validateContent) {
      if (contentScore.score < minScoreThreshold) {
        return Err(contentError.noReadableContent());
      }

      if (content.totalCharacters < MIN_CONTENT_CHARACTERS) {
        return Err(contentError.noReadableContent());
      }
    }

    return Ok({
      ...content,
      contentScore,
    });
  }

  /**
   * Score HTML content without full extraction.
   *
   * @param html - HTML string to score
   * @returns Content score
   */
  score(html: string): ContentScore {
    return this.deps.contentScorer.scoreHtml(html);
  }

  /**
   * Score a DOM element.
   *
   * @param element - Element to score
   * @returns Content score
   */
  scoreElement(element: Element): ContentScore {
    return this.deps.contentScorer.scoreElement(element);
  }

  /**
   * Find the best content container in a document.
   *
   * @param doc - Document to search
   * @returns Best container element or null
   */
  findBestContainer(doc: Document): Element | null {
    return this.deps.contentScorer.findBestContainer(doc);
  }

  /**
   * Check if the text extractor can handle a content type.
   *
   * @param contentType - MIME type
   * @param url - Optional URL for additional detection
   * @returns True if extractor can handle the content type
   */
  canHandle(contentType: string, url?: string): boolean {
    return this.deps.textExtractor.canHandle(contentType, url);
  }

  /**
   * Get the extractor ID.
   */
  get extractorId(): string {
    return this.deps.textExtractor.extractorId;
  }

  /**
   * Validate extracted content meets quality thresholds.
   *
   * @param content - Extracted content to validate
   * @param minScoreThreshold - Minimum score threshold
   * @returns Ok if valid, Err if invalid
   */
  private validateExtractedContent(
    content: ExtractedContent,
    minScoreThreshold: number,
  ): Result<void, ContentExtractionError> {
    // Check for empty content
    if (content.paragraphs.length === 0) {
      return Err(contentError.noReadableContent());
    }

    // Check for minimum character count
    if (content.totalCharacters < MIN_CONTENT_CHARACTERS) {
      return Err(contentError.noReadableContent());
    }

    // Check for meaningful paragraphs
    const meaningfulParagraphs = content.paragraphs.filter((p) => p.characterCount >= 30);
    if (meaningfulParagraphs.length === 0) {
      return Err(contentError.noReadableContent());
    }

    // Score-based validation using HTML representation
    // Create a simple HTML representation of paragraphs
    const html = content.paragraphs.map((p) => `<p>${p.text}</p>`).join('\n');
    const score = this.deps.contentScorer.scoreHtml(html);

    if (score.score < minScoreThreshold) {
      return Err(contentError.noReadableContent());
    }

    return Ok(undefined);
  }
}

/**
 * Factory function to create ContentExtractionService.
 *
 * @param deps - Service dependencies
 * @returns Configured ContentExtractionService instance
 */
export function createContentExtractionService(
  deps: ContentExtractionServiceDependencies,
): ContentExtractionService {
  return new ContentExtractionService(deps);
}
