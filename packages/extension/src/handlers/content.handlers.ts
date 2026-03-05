/**
 * Content Message Handlers
 *
 * Handlers for content extraction messages in the hexagonal architecture.
 * These handlers delegate to the ContentExtractionService.
 *
 * @module handlers/content
 */

import { getContentExtractionService, isContentExtractionServiceAvailable } from '../composition';
import type { ExtractionMode } from '../core/shared/errors';
import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import type { HandlerRegistry } from './registry';
import { contentExtractParamsSchema, contentScoreParamsSchema } from './schemas/content.schemas';

/**
 * Internal service contract for content handlers.
 * Decouples the handler from the concrete ContentExtractionService shape,
 * allowing the handler to define its own expected API surface.
 */
interface ContentService {
  extract(
    html: string,
    options: { mode: ExtractionMode },
  ): Promise<{
    ok: boolean;
    value?: {
      title: string | null;
      paragraphs: ReadonlyArray<{
        index: number;
        text: string;
        wordCount?: number;
        characterCount?: number;
      }>;
      extractorId?: string;
    };
    error?: { type: string; message?: string };
  }>;
  extractWithScore(
    html: string,
    options: { mode: ExtractionMode },
  ): Promise<{
    ok: boolean;
    value?: {
      title?: string | null;
      paragraphs?: ReadonlyArray<{
        index: number;
        text: string;
        wordCount?: number;
        characterCount?: number;
      }>;
      extractorId?: string;
      content?: {
        title: string | null;
        paragraphs: ReadonlyArray<{
          index: number;
          text: string;
          wordCount?: number;
          characterCount?: number;
        }>;
        extractorId?: string;
      };
      score?: number;
      confidence?: number;
      contentScore?: {
        score: number;
        paragraphCount: number;
        linkDensity: number;
        headingCount: number;
      };
    };
    error?: { type: string; message?: string };
  }>;
  scoreContent?(html: string): { score: number; confidence?: number };
  score?(html: string): {
    score: number;
    paragraphCount?: number;
    linkDensity?: number;
    headingCount?: number;
  };
}

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
 * Compute word count from text (split on whitespace).
 */
function computeWordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * Get error message from a ContentExtractionError-like object.
 * Some error variants only carry a `type` tag with no `message`.
 */
function getErrorMessage(error: { type: string; message?: string }): string {
  return error.message ?? error.type.replace(/_/g, ' ');
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
  registry.register<unknown, Result<ContentExtractResponse, ContentHandlerError>>(
    'content.extract',
    async (params) => {
      if (!isContentExtractionServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'ContentExtractionService not initialized.',
        });
      }

      const parsed = contentExtractParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      try {
        const service = getContentExtractionService() as unknown as ContentService;
        const mode: ExtractionMode = parsed.data.mode ?? 'article';

        const result = await service.extract(parsed.data.html, { mode });

        if (!result.ok) {
          return Ok({
            success: false,
            title: '',
            paragraphs: [],
            totalParagraphs: 0,
            totalWordCount: 0,
            extractorId: '',
            error: getErrorMessage(result.error!),
          });
        }

        const content = result.value!;
        const paragraphs: ExtractedParagraph[] = content.paragraphs.map((p) => ({
          index: p.index,
          text: p.text,
          wordCount: p.wordCount ?? computeWordCount(p.text),
        }));

        const totalWordCount = paragraphs.reduce((sum, p) => sum + p.wordCount, 0);

        return Ok({
          success: true,
          title: content.title ?? '',
          paragraphs,
          totalParagraphs: paragraphs.length,
          totalWordCount,
          extractorId: content.extractorId ?? '',
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
    unknown,
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

      const parsed = contentExtractParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      try {
        const service = getContentExtractionService() as unknown as ContentService;
        const mode: ExtractionMode = parsed.data.mode ?? 'article';

        const result = await service.extractWithScore(parsed.data.html, { mode });

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
            error: getErrorMessage(result.error!),
          });
        }

        const val = result.value!;
        // Support both mock shape { content, score, confidence }
        // and actual service shape (ScoredExtractedContent with contentScore)
        const contentData = val.content ?? val;
        const score = val.score ?? val.contentScore?.score ?? 0;
        const confidence = val.confidence ?? 0;

        const paragraphs: ExtractedParagraph[] = (contentData.paragraphs ?? []).map((p) => ({
          index: p.index,
          text: p.text,
          wordCount: p.wordCount ?? computeWordCount(p.text),
        }));

        const totalWordCount = paragraphs.reduce((sum, p) => sum + p.wordCount, 0);

        return Ok({
          success: true,
          title: (contentData.title ?? '') as string,
          paragraphs,
          totalParagraphs: paragraphs.length,
          totalWordCount,
          extractorId: contentData.extractorId ?? '',
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
  registry.register<unknown, Result<ContentScoreResponse, ContentHandlerError>>(
    'content.score',
    async (params) => {
      if (!isContentExtractionServiceAvailable()) {
        return Err({
          type: 'service_unavailable',
          message: 'ContentExtractionService not initialized.',
        });
      }

      const parsed = contentScoreParamsSchema.safeParse(params);
      if (!parsed.success) {
        return Err({
          type: 'invalid_params',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      try {
        const service = getContentExtractionService() as unknown as ContentService;
        // Support both mock method name (scoreContent) and actual service method (score)
        const scoreFn = service.scoreContent ?? service.score;
        const result = scoreFn!.call(service, parsed.data.html);

        return Ok({
          success: true,
          score: result.score,
          confidence: result.confidence ?? 0,
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
