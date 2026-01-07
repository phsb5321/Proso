/**
 * Content Extraction Domain
 *
 * Exports content extraction entities and service (when implemented).
 *
 * @module core/content-extraction
 */

export {
  type ParagraphType,
  type Paragraph,
  type ExtractedContent,
  type ContentScore,
  createEmptyContent,
  createParagraph,
  createExtractedContent,
  getTextArray,
  getParagraphAt,
  estimateReadingTime,
  estimateTTSDuration,
} from './extracted-content';

export {
  ContentExtractionService,
  createContentExtractionService,
  type ContentExtractionServiceDependencies,
  type ExtractionOptions,
  type ScoredExtractedContent,
} from './extraction-service';
