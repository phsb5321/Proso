/**
 * PDF Message Handlers
 *
 * Handlers for PDF-related messages in the hexagonal architecture.
 * These handlers wrap existing PDF handlers with Result<T,E> error handling.
 *
 * @module handlers/pdf
 */

import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import {
  handlePDFExtract,
  handlePDFGetState,
  handlePDFSaveState,
  handlePDFPlay,
  handlePDFSeek,
  handlePDFHighlight,
  handlePDFScrollToPage,
} from '../utils/messaging/handlers/pdf';
import type { HandlerRegistry } from './registry';

/**
 * PDF handler error type.
 */
export type PDFHandlerError =
  | { type: 'extraction_failed'; message: string }
  | { type: 'password_required'; message: string }
  | { type: 'access_denied'; message: string }
  | { type: 'no_session'; message: string }
  | { type: 'invalid_params'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * PDF extract request parameters.
 */
export interface PDFExtractParams {
  url: string;
  password?: string;
}

/**
 * PDF paragraph with metadata.
 */
export interface PDFParagraphInfo {
  index: number;
  text: string;
  pageNumber: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;
  };
  contentHash: string;
}

/**
 * PDF extract response.
 */
export interface PDFExtractResult {
  success: boolean;
  meta?: {
    url?: string;
    urlHash?: string;
    title?: string;
    author?: string;
    pageCount?: number;
    isTagged?: boolean;
    isScanned?: boolean;
  };
  paragraphs?: PDFParagraphInfo[];
  requiresPassword?: boolean;
}

/**
 * PDF state get parameters.
 */
export interface PDFGetStateParams {
  url: string;
}

/**
 * PDF state save parameters.
 */
export interface PDFSaveStateParams {
  url: string;
  urlHash: string;
  paragraphIndex: number;
  pageNumber: number;
  totalParagraphs: number;
  title?: string;
}

/**
 * PDF play parameters.
 */
export interface PDFPlayParams {
  url: string;
  password?: string;
  resumeFromSaved?: boolean;
}

/**
 * PDF seek parameters.
 */
export interface PDFSeekParams {
  url: string;
  paragraphIndex: number;
}

/**
 * PDF highlight parameters.
 */
export interface PDFHighlightParams {
  paragraphIndex: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
    pageNumber: number;
  };
}

/**
 * PDF play response - paragraphs as text strings for TTS.
 */
export interface PDFPlayResult {
  success: boolean;
  meta?: {
    url?: string;
    urlHash?: string;
    title?: string;
    author?: string;
    pageCount?: number;
    isTagged?: boolean;
    isScanned?: boolean;
  };
  paragraphs?: string[];
  startIndex?: number;
}

/**
 * PDF scroll to page parameters.
 */
export interface PDFScrollToPageParams {
  pageNumber: number;
}

/**
 * Register PDF message handlers on the registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerPDFHandlers(registry: HandlerRegistry): void {
  /**
   * Extract text content from a PDF document.
   */
  registry.register<PDFExtractParams, Result<PDFExtractResult, PDFHandlerError>>(
    'pdf.extract',
    async (params) => {
      if (!params?.url) {
        return Err({
          type: 'invalid_params',
          message: 'url is required',
        });
      }

      try {
        const result = await handlePDFExtract({
          url: params.url,
          password: params.password,
        });

        if (!result.success) {
          if (result.requiresPassword) {
            return Err({
              type: 'password_required',
              message: result.error || 'PDF requires password',
            });
          }
          return Err({
            type: 'extraction_failed',
            message: result.error || 'Failed to extract PDF',
          });
        }

        return Ok({
          success: true,
          meta: result.meta,
          paragraphs: result.paragraphs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Extract text from PDF document',
  );

  /**
   * Get saved reading state for a PDF.
   */
  registry.register<
    PDFGetStateParams,
    Result<{ found: boolean; state?: unknown }, PDFHandlerError>
  >(
    'pdf.state.get',
    async (params) => {
      if (!params?.url) {
        return Err({
          type: 'invalid_params',
          message: 'url is required',
        });
      }

      try {
        const result = await handlePDFGetState({ url: params.url });
        return Ok({
          found: result.found,
          state: result.found ? result.state : undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get PDF reading state',
  );

  /**
   * Save reading state for a PDF.
   */
  registry.register<PDFSaveStateParams, Result<{ success: boolean }, PDFHandlerError>>(
    'pdf.state.save',
    async (params) => {
      if (!params?.url || !params?.urlHash) {
        return Err({
          type: 'invalid_params',
          message: 'url and urlHash are required',
        });
      }

      try {
        const result = await handlePDFSaveState({
          url: params.url,
          urlHash: params.urlHash,
          paragraphIndex: params.paragraphIndex,
          pageNumber: params.pageNumber,
          totalParagraphs: params.totalParagraphs,
          title: params.title,
        });
        return Ok({ success: result.success });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Save PDF reading state',
  );

  /**
   * Start playback of a PDF document.
   */
  registry.register<PDFPlayParams, Result<PDFPlayResult, PDFHandlerError>>(
    'pdf.play',
    async (params) => {
      if (!params?.url) {
        return Err({
          type: 'invalid_params',
          message: 'url is required',
        });
      }

      try {
        const result = await handlePDFPlay({
          url: params.url,
          password: params.password,
          resumeFromSaved: params.resumeFromSaved,
        });

        if (!result.success) {
          if (result.requiresPassword) {
            return Err({
              type: 'password_required',
              message: result.error || 'PDF requires password',
            });
          }
          return Err({
            type: 'extraction_failed',
            message: result.error || 'Failed to start PDF playback',
          });
        }

        return Ok({
          success: true,
          meta: result.meta,
          paragraphs: result.paragraphs,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Start PDF playback',
  );

  /**
   * Seek to a specific paragraph in PDF playback.
   */
  registry.register<
    PDFSeekParams,
    Result<{ success: boolean; currentParagraph?: number; currentPage?: number }, PDFHandlerError>
  >(
    'pdf.seek',
    async (params) => {
      if (typeof params?.paragraphIndex !== 'number') {
        return Err({
          type: 'invalid_params',
          message: 'paragraphIndex is required',
        });
      }
      if (!params?.url) {
        return Err({
          type: 'invalid_params',
          message: 'url is required',
        });
      }

      try {
        const result = await handlePDFSeek({
          url: params.url,
          paragraphIndex: params.paragraphIndex,
        });

        if (!result.success) {
          return Err({
            type: 'no_session',
            message: result.error || 'No active PDF session',
          });
        }

        return Ok({
          success: true,
          currentParagraph: result.currentParagraph,
          currentPage: result.currentPage,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Seek to paragraph in PDF',
  );

  /**
   * Highlight a paragraph in the PDF viewer.
   */
  registry.register<PDFHighlightParams, Result<{ success: boolean }, PDFHandlerError>>(
    'pdf.highlight',
    async (params) => {
      if (typeof params?.paragraphIndex !== 'number') {
        return Err({
          type: 'invalid_params',
          message: 'paragraphIndex is required',
        });
      }
      if (!params?.boundingBox) {
        return Err({
          type: 'invalid_params',
          message: 'boundingBox is required',
        });
      }

      try {
        const result = await handlePDFHighlight({
          paragraphIndex: params.paragraphIndex,
          boundingBox: params.boundingBox,
        });
        return Ok({ success: result.success });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Highlight paragraph in PDF viewer',
  );

  /**
   * Scroll PDF viewer to a specific page.
   */
  registry.register<PDFScrollToPageParams, Result<{ success: boolean }, PDFHandlerError>>(
    'pdf.scrollToPage',
    async (params) => {
      if (typeof params?.pageNumber !== 'number') {
        return Err({
          type: 'invalid_params',
          message: 'pageNumber is required',
        });
      }

      try {
        const result = await handlePDFScrollToPage({
          pageNumber: params.pageNumber,
        });
        return Ok({ success: result.success });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Scroll PDF viewer to page',
  );
}
