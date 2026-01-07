/**
 * PDF Message Handlers
 *
 * Feature: 033-pdf-reading-support
 * Task: T021
 *
 * Handles all PDF-related messages between content scripts,
 * background script, and popup.
 */

import type {
  PDFExtractRequest,
  PDFExtractResponse,
  PDFGetStateRequest,
  PDFGetStateResponse,
  PDFPlayRequest,
  PDFPlayResponse,
  PDFSeekRequest,
  PDFSeekResponse,
} from '../types';

import {
  extractPDFText,
  PDFAccessError,
  PDFPasswordError,
} from '../../pdf/extractor';
import {
  getReadingState,
  saveReadingState,
} from '../../pdf/state';
import {
  startPDFSession,
  updatePDFPosition,
  getPDFSession,
  getPDFProgress,
} from '../../../background/pdf-controller';
import type { PDFReadingState } from '../../pdf/types';

/**
 * Handle pdf.extract message
 * Extracts text content from a PDF document
 */
export async function handlePDFExtract(request: PDFExtractRequest): Promise<PDFExtractResponse> {
  try {
    const { meta, paragraphs } = await extractPDFText(request.url, {
      password: request.password,
      onProgress: (percent) => {
        // TODO: Broadcast progress via message
        console.log(`VoxPage: PDF extraction progress: ${percent}%`);
      },
    });

    return {
      success: true,
      meta,
      paragraphs,
    };
  } catch (error: unknown) {
    // Handle password-protected PDF
    if (error instanceof PDFPasswordError) {
      return {
        success: false,
        requiresPassword: true,
        error: error.message,
      };
    }

    // Handle access errors (CORS, network, etc.)
    if (error instanceof PDFAccessError) {
      return {
        success: false,
        error: `Cannot access PDF: ${error.message}`,
      };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Handle pdf.state.get message
 * Retrieves saved reading state for a PDF
 */
export async function handlePDFGetState(
  request: PDFGetStateRequest,
): Promise<PDFGetStateResponse> {
  try {
    const state = await getReadingState(request.url);

    if (state) {
      return {
        found: true,
        state: {
          ...state,
          lastReadAt: state.lastReadAt.toISOString(),
        },
      };
    }

    return {
      found: false,
    };
  } catch (error) {
    console.error('VoxPage: Failed to get PDF state:', error);
    return {
      found: false,
    };
  }
}

/**
 * Handle pdf.state.save message
 * Saves reading state for a PDF
 */
export async function handlePDFSaveState(
  request: {
    url: string;
    urlHash: string;
    paragraphIndex: number;
    pageNumber: number;
    totalParagraphs: number;
    title?: string;
  },
): Promise<{ success: boolean }> {
  try {
    const state: PDFReadingState = {
      url: request.url,
      urlHash: request.urlHash,
      paragraphIndex: request.paragraphIndex,
      pageNumber: request.pageNumber,
      lastReadAt: new Date(),
      totalParagraphs: request.totalParagraphs,
    };

    await saveReadingState(state, request.title);
    return { success: true };
  } catch (error) {
    console.error('VoxPage: Failed to save PDF state:', error);
    return { success: false };
  }
}

/**
 * Handle pdf.play message
 * Starts playback of a PDF document
 *
 * Task: T022
 */
export async function handlePDFPlay(request: PDFPlayRequest): Promise<PDFPlayResponse> {
  try {
    // Start PDF session which extracts text and returns paragraphs
    const result = await startPDFSession(request.url, {
      password: request.password,
      resumeFromSaved: request.resumeFromSaved ?? true,
    });

    if (!result.success) {
      return {
        success: false,
        requiresPassword: result.requiresPassword,
        error: result.error,
      };
    }

    // Return success with paragraphs for TTS pipeline
    // The background.ts will use these paragraphs for playback
    return {
      success: true,
      paragraphs: result.paragraphs,
      startIndex: result.startIndex,
      meta: result.meta,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Handle pdf.seek message
 * Seeks to a specific paragraph in PDF playback
 *
 * Task: T022
 */
export async function handlePDFSeek(request: PDFSeekRequest): Promise<PDFSeekResponse> {
  try {
    const session = getPDFSession();
    if (!session) {
      return {
        success: false,
        error: 'No active PDF session',
      };
    }

    // Validate paragraph index
    if (request.paragraphIndex < 0 || request.paragraphIndex >= session.paragraphs.length) {
      return {
        success: false,
        error: 'Invalid paragraph index',
      };
    }

    // Update position in session and save state
    await updatePDFPosition(request.paragraphIndex);

    // Return progress info
    const progress = getPDFProgress();

    return {
      success: true,
      currentParagraph: progress?.currentParagraph ?? request.paragraphIndex + 1,
      currentPage: progress?.currentPage ?? 1,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Handle pdf.highlight message
 * Highlights a paragraph in the PDF viewer
 */
export async function handlePDFHighlight(
  request: import('../types').PDFHighlightRequest,
): Promise<{ success: boolean }> {
  try {
    // TODO: Implement in T031 (User Story 2)
    // Update highlight overlay position

    return { success: false };
  } catch (error) {
    console.error('VoxPage: Failed to highlight PDF paragraph:', error);
    return { success: false };
  }
}

/**
 * Handle pdf.scrollToPage message
 * Scrolls the PDF viewer to a specific page
 */
export async function handlePDFScrollToPage(
  request: import('../types').PDFScrollToPageRequest,
): Promise<{ success: boolean }> {
  try {
    // TODO: Implement in T032 (User Story 2)
    // Scroll PDF viewer to page

    return { success: false };
  } catch (error) {
    console.error('VoxPage: Failed to scroll to page:', error);
    return { success: false };
  }
}

/**
 * Export all PDF handlers for registration
 */
export const pdfHandlers = {
  'pdf.extract': handlePDFExtract,
  'pdf.state.get': handlePDFGetState,
  'pdf.state.save': handlePDFSaveState,
  'pdf.play': handlePDFPlay,
  'pdf.seek': handlePDFSeek,
  'pdf.highlight': handlePDFHighlight,
  'pdf.scrollToPage': handlePDFScrollToPage,
};
