/**
 * PDF Playback Controller
 *
 * Feature: 033-pdf-reading-support
 * Task: T024
 *
 * Coordinates PDF text extraction with the existing TTS playback pipeline.
 * Manages PDF-specific playback state and position persistence.
 */

import { extractPDFText, PDFPasswordError, PDFAccessError } from '../utils/pdf/extractor';
import {
  getReadingState,
  saveReadingState,
  hashUrl,
} from '../utils/pdf/state';
import type { PDFDocumentMeta, PDFParagraph, PDFReadingState } from '../utils/pdf/types';

/**
 * PDF playback session state
 */
export interface PDFSession {
  /** PDF URL being played */
  url: string;
  /** URL hash for state lookup */
  urlHash: string;
  /** Document metadata */
  meta: PDFDocumentMeta;
  /** Extracted paragraphs */
  paragraphs: PDFParagraph[];
  /** Current paragraph index */
  currentIndex: number;
  /** Whether session is active */
  active: boolean;
}

/**
 * Current PDF session (null if not playing a PDF)
 */
let currentSession: PDFSession | null = null;

/**
 * Check if a PDF session is active
 */
export function isPDFSessionActive(): boolean {
  return currentSession !== null && currentSession.active;
}

/**
 * Get current PDF session
 */
export function getPDFSession(): PDFSession | null {
  return currentSession;
}

/**
 * Start a PDF playback session
 *
 * @param url - PDF URL to play
 * @param options - Playback options
 * @returns Session info and paragraphs for TTS playback
 */
export async function startPDFSession(
  url: string,
  options: {
    password?: string;
    resumeFromSaved?: boolean;
  } = {},
): Promise<{
  success: boolean;
  paragraphs?: string[];
  startIndex?: number;
  meta?: PDFDocumentMeta;
  error?: string;
  requiresPassword?: boolean;
}> {
  try {
    // Extract PDF text
    const { meta, paragraphs } = await extractPDFText(url, {
      password: options.password,
    });

    if (paragraphs.length === 0) {
      return {
        success: false,
        error: meta.isScanned
          ? 'This appears to be a scanned PDF. OCR support coming soon.'
          : 'No text content found in PDF',
      };
    }

    const urlHash = await hashUrl(url);

    // Check for saved reading position
    let startIndex = 0;
    if (options.resumeFromSaved !== false) {
      const savedState = await getReadingState(url);
      if (savedState && savedState.paragraphIndex < paragraphs.length) {
        startIndex = savedState.paragraphIndex;
        console.log(`VoxPage: Resuming PDF from paragraph ${startIndex + 1}`);
      }
    }

    // Create session
    currentSession = {
      url,
      urlHash,
      meta,
      paragraphs,
      currentIndex: startIndex,
      active: true,
    };

    // Convert PDF paragraphs to plain text for TTS pipeline
    const textParagraphs = paragraphs.map((p) => p.text);

    return {
      success: true,
      paragraphs: textParagraphs,
      startIndex,
      meta,
    };
  } catch (error) {
    if (error instanceof PDFPasswordError) {
      return {
        success: false,
        requiresPassword: true,
        error: error.message,
      };
    }

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
 * Update current paragraph position in PDF session
 *
 * @param index - New paragraph index
 */
export async function updatePDFPosition(index: number): Promise<void> {
  if (!currentSession || !currentSession.active) {
    return;
  }

  currentSession.currentIndex = index;

  // Get page number for this paragraph
  const paragraph = currentSession.paragraphs[index];
  const pageNumber = paragraph?.pageNumber ?? 1;

  // Save reading state
  const state: PDFReadingState = {
    url: currentSession.url,
    urlHash: currentSession.urlHash,
    paragraphIndex: index,
    pageNumber,
    lastReadAt: new Date(),
    totalParagraphs: currentSession.paragraphs.length,
  };

  await saveReadingState(state, currentSession.meta.title);
}

/**
 * Get current page number in PDF session
 */
export function getCurrentPDFPage(): number | null {
  if (!currentSession || !currentSession.active) {
    return null;
  }

  const paragraph = currentSession.paragraphs[currentSession.currentIndex];
  return paragraph?.pageNumber ?? null;
}

/**
 * Get total pages in current PDF session
 */
export function getTotalPDFPages(): number | null {
  if (!currentSession || !currentSession.active) {
    return null;
  }

  return currentSession.meta.pageCount;
}

/**
 * End current PDF session
 */
export async function endPDFSession(): Promise<void> {
  if (!currentSession) {
    return;
  }

  // Save final position before ending
  await updatePDFPosition(currentSession.currentIndex);

  currentSession.active = false;
  currentSession = null;
}

/**
 * Get PDF paragraph by index
 */
export function getPDFParagraph(index: number): PDFParagraph | null {
  if (!currentSession || index < 0 || index >= currentSession.paragraphs.length) {
    return null;
  }

  return currentSession.paragraphs[index];
}

/**
 * Find paragraph index by page number
 * Returns the first paragraph on the given page
 */
export function findParagraphByPage(pageNumber: number): number | null {
  if (!currentSession) {
    return null;
  }

  const index = currentSession.paragraphs.findIndex((p) => p.pageNumber === pageNumber);
  return index >= 0 ? index : null;
}

/**
 * Get session progress info for UI
 */
export function getPDFProgress(): {
  currentParagraph: number;
  totalParagraphs: number;
  currentPage: number;
  totalPages: number;
  percentComplete: number;
} | null {
  if (!currentSession || !currentSession.active) {
    return null;
  }

  const currentPage = getCurrentPDFPage() ?? 1;
  const percentComplete = Math.round(
    (currentSession.currentIndex / currentSession.paragraphs.length) * 100,
  );

  return {
    currentParagraph: currentSession.currentIndex + 1,
    totalParagraphs: currentSession.paragraphs.length,
    currentPage,
    totalPages: currentSession.meta.pageCount,
    percentComplete,
  };
}
