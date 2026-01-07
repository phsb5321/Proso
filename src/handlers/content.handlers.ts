/**
 * Content Message Handlers
 *
 * Handlers for content extraction messages in the hexagonal architecture.
 * These handlers delegate to the ContentExtractionService.
 *
 * @module handlers/content
 */

import { getContentExtractionService, isContentExtractionServiceAvailable } from '../composition';
import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import type { ExtractionMode } from '../ports/text-extractor.port';
import type { HandlerRegistry } from './registry';

/**
 * Content handler error type.
 */
export type ContentHandlerError =
  | { type: 'service_unavailable'; message: string }
  | { type: 'invalid_params'; message: string }
  | { type: 'extraction_failed'; message: string };

/**
 * Extracted paragraph structure.
 */
export interface ExtractedParagraph {
  index: number;
  text: string;
  wordCount: number;
}

/**
 * Content extraction response.
 */
export interface ContentExtractResponse {
  success: boolean;
  title: string;
  paragraphs: ExtractedParagraph[];
  totalParagraphs: number;
  totalWordCount: number;
  extractorId: string;
  error?: string;
}

/**
 * Content score response.
 */
export interface ContentScoreResponse {
  success: boolean;
  score: number;
  confidence: number;
  error?: string;
}

/**
 * Register content message handlers on the registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerContentHandlers(registry: HandlerRegistry): void {
  /**
   * Extract content from HTML.
   */
  registry.register<
    { html: string; mode?: ExtractionMode },
    Result<ContentExtractResponse, ContentHandlerError>
  >(
    'content.extract',
    async (params) => {
      if (!isContentExtractionServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'ContentExtractionService not initialized.',
        });
      }

      if (!params?.html || typeof params.html !== 'string') {
        return Err({
          type: 'invalid_params',
          message: 'html parameter is required and must be a string',
        });
      }

      try {
        const service = getContentExtractionService();
        const mode: ExtractionMode = params.mode ?? 'article';

        const result = await service.extract(params.html, { mode });

        if (!result.ok) {
          return Ok({
            success: false,
            title: '',
            paragraphs: [],
            totalParagraphs: 0,
            totalWordCount: 0,
            extractorId: '',
            error: result.error.message,
          });
        }

        const content = result.value;
        const paragraphs: ExtractedParagraph[] = content.paragraphs.map((p) => ({
          index: p.index,
          text: p.text,
          wordCount: p.wordCount,
        }));

        const totalWordCount = paragraphs.reduce((sum, p) => sum + p.wordCount, 0);

        return Ok({
          success: true,
          title: content.title,
          paragraphs,
          totalParagraphs: paragraphs.length,
          totalWordCount,
          extractorId: content.extractorId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'extraction_failed', message });
      }
    },
    'Extract content from HTML',
  );

  /**
   * Extract content with scoring.
   */
  registry.register<
    { html: string; mode?: ExtractionMode },
    Result<ContentExtractResponse & { score: number; confidence: number }, ContentHandlerError>
  >(
    'content.extractWithScore',
    async (params) => {
      if (!isContentExtractionServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'ContentExtractionService not initialized.',
        });
      }

      if (!params?.html || typeof params.html !== 'string') {
        return Err({
          type: 'invalid_params',
          message: 'html parameter is required and must be a string',
        });
      }

      try {
        const service = getContentExtractionService();
        const mode: ExtractionMode = params.mode ?? 'article';

        const result = await service.extractWithScore(params.html, { mode });

        if (!result.ok) {
          return Ok({
            success: false,
            title: '',
            paragraphs: [],
            totalParagraphs: 0,
            totalWordCount: 0,
            extractorId: '',
            score: 0,
            confidence: 0,
            error: result.error.message,
          });
        }

        const { content, score, confidence } = result.value;
        const paragraphs: ExtractedParagraph[] = content.paragraphs.map((p) => ({
          index: p.index,
          text: p.text,
          wordCount: p.wordCount,
        }));

        const totalWordCount = paragraphs.reduce((sum, p) => sum + p.wordCount, 0);

        return Ok({
          success: true,
          title: content.title,
          paragraphs,
          totalParagraphs: paragraphs.length,
          totalWordCount,
          extractorId: content.extractorId,
          score,
          confidence,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'extraction_failed', message });
      }
    },
    'Extract content with quality score',
  );

  /**
   * Score HTML content quality.
   */
  registry.register<{ html: string }, Result<ContentScoreResponse, ContentHandlerError>>(
    'content.score',
    async (params) => {
      if (!isContentExtractionServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'ContentExtractionService not initialized.',
        });
      }

      if (!params?.html || typeof params.html !== 'string') {
        return Err({
          type: 'invalid_params',
          message: 'html parameter is required and must be a string',
        });
      }

      try {
        const service = getContentExtractionService();
        const { score, confidence } = service.scoreContent(params.html);

        return Ok({
          success: true,
          score,
          confidence,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'extraction_failed', message });
      }
    },
    'Score content quality',
  );

  /**
   * Check if service is available.
   */
  registry.register<void, Result<{ available: boolean }, ContentHandlerError>>(
    'content.isAvailable',
    async () => {
      return Ok({ available: isContentExtractionServiceAvailable() });
    },
    'Check if content extraction service is available',
  );
}
