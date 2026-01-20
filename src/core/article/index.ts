/**
 * Article Core Module
 *
 * Exports article entity and extraction service.
 *
 * @module core/article
 */

export type { Article, Paragraph } from './article.entity';
export {
  createArticle,
  createParagraph,
  getArticleCharacterCount,
  getEstimatedReadingTime,
  getEstimatedTTSDuration,
} from './article.entity';

export type { ArticleExtractionError, ExtractionOptions } from './extraction.service';
export {
  ArticleExtractionService,
  createArticleExtractionService,
} from './extraction.service';
