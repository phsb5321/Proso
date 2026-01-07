/**
 * PDF Text Extractor
 *
 * Feature: 033-pdf-reading-support
 * Task: T018
 *
 * Extracts text content from PDF documents using pdfjs-dist.
 * Groups text items into paragraphs with bounding boxes.
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { getPDFJS } from './init';
import { groupIntoParagraphs } from './paragraph-grouper';
import type {
  PDFDocumentMeta,
  PDFExtractionResult,
  PDFPageInfo,
  PDFParagraph,
  PDFTextItem,
} from './types';

/**
 * Threshold for detecting scanned PDFs.
 * If average characters per page is below this, likely scanned.
 */
const SCANNED_THRESHOLD_CHARS_PER_PAGE = 100;

/**
 * Maximum pages to process in a single batch for memory efficiency.
 */
const PAGE_BATCH_SIZE = 10;

/**
 * Generate SHA-256 hash of a string.
 * Returns 64-character hex string.
 */
export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Options for PDF extraction.
 */
export interface ExtractOptions {
  /** Password for encrypted PDFs */
  password?: string;
  /** Extract only specific pages (1-indexed) */
  pageRange?: { start: number; end: number };
  /** Progress callback (0-100) */
  onProgress?: (percent: number) => void;
}

/**
 * Error thrown when PDF requires a password.
 */
export class PDFPasswordError extends Error {
  constructor(message = 'PDF requires a password') {
    super(message);
    this.name = 'PDFPasswordError';
  }
}

/**
 * Error thrown when PDF cannot be accessed (CORS, network, etc.).
 */
export class PDFAccessError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'PDFAccessError';
  }
}

/**
 * Extract text from a single PDF page.
 */
async function extractPageText(
  page: PDFPageProxy,
  pageNumber: number,
): Promise<{ items: PDFTextItem[]; pageInfo: PDFPageInfo }> {
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();

  // Convert pdfjs TextItem to our PDFTextItem interface
  const items: PDFTextItem[] = textContent.items
    .filter((item): item is { str: string; dir: string; width: number; height: number; transform: number[]; fontName: string; hasEOL?: boolean } =>
      'str' in item && typeof item.str === 'string'
    )
    .map((item) => ({
      str: item.str,
      dir: (item.dir === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl',
      width: item.width,
      height: item.height,
      transform: item.transform,
      fontName: item.fontName,
      hasEOL: item.hasEOL,
    }));

  const pageInfo: PDFPageInfo = {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    rotation: page.rotate,
  };

  return { items, pageInfo };
}

/**
 * Extract document metadata from PDF.
 */
async function extractMetadata(
  pdf: PDFDocumentProxy,
  url: string,
  totalChars: number,
): Promise<PDFDocumentMeta> {
  const urlHash = await hashString(url);
  const metadata = await pdf.getMetadata();

  // Extract info from PDF metadata
  const info = metadata.info as Record<string, unknown> | undefined;
  const title = typeof info?.Title === 'string' ? info.Title : undefined;
  const author = typeof info?.Author === 'string' ? info.Author : undefined;

  // Check if PDF has structure tree (tagged PDF)
  let isTagged = false;
  try {
    const markInfo = await pdf.getMarkInfo();
    isTagged = markInfo?.Marked === true;
  } catch {
    // getMarkInfo may not be available in all PDF.js versions
    isTagged = false;
  }

  // Detect if PDF is scanned (low text content)
  const charsPerPage = totalChars / pdf.numPages;
  const isScanned = charsPerPage < SCANNED_THRESHOLD_CHARS_PER_PAGE;

  return {
    url,
    urlHash,
    title,
    author,
    pageCount: pdf.numPages,
    isTagged,
    isScanned,
  };
}

/**
 * Extract text content from a PDF document.
 *
 * @param source - PDF source: URL string or ArrayBuffer
 * @param options - Extraction options
 * @returns Extraction result with metadata and paragraphs
 * @throws {PDFPasswordError} If PDF is encrypted and no/wrong password provided
 * @throws {PDFAccessError} If PDF cannot be loaded (CORS, network error, etc.)
 */
export async function extractPDFText(
  source: string | ArrayBuffer,
  options: ExtractOptions = {},
): Promise<PDFExtractionResult> {
  const pdfjs = await getPDFJS();
  const { password, pageRange, onProgress } = options;

  // Prepare loading task parameters
  const loadingParams: { data?: ArrayBuffer; url?: string; password?: string } = {};

  if (source instanceof ArrayBuffer) {
    loadingParams.data = source;
  } else {
    loadingParams.url = source;
  }

  if (password) {
    loadingParams.password = password;
  }

  let pdf: PDFDocumentProxy;

  try {
    const loadingTask = pdfjs.getDocument(loadingParams);
    pdf = await loadingTask.promise;
  } catch (error) {
    // Handle password-protected PDFs
    if (error instanceof Error) {
      if (error.name === 'PasswordException' || error.message.includes('password')) {
        throw new PDFPasswordError(
          password ? 'Incorrect password' : 'PDF requires a password',
        );
      }

      // Handle access errors
      if (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('CORS')
      ) {
        throw new PDFAccessError(
          `Cannot access PDF: ${error.message}`,
          error,
        );
      }
    }

    throw error;
  }

  try {
    // Determine page range
    const startPage = pageRange?.start ?? 1;
    const endPage = Math.min(pageRange?.end ?? pdf.numPages, pdf.numPages);
    const totalPages = endPage - startPage + 1;

    // Collect all text items from pages
    const allItems: Array<{ items: PDFTextItem[]; pageNumber: number }> = [];
    let totalChars = 0;
    let processedPages = 0;

    // Process pages in batches for memory efficiency
    for (let batchStart = startPage; batchStart <= endPage; batchStart += PAGE_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + PAGE_BATCH_SIZE - 1, endPage);
      const pagePromises: Promise<{
        items: PDFTextItem[];
        pageInfo: PDFPageInfo;
        pageNumber: number;
      }>[] = [];

      for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
        pagePromises.push(
          pdf.getPage(pageNum).then(async (page) => {
            const result = await extractPageText(page, pageNum);
            // Clean up page resources
            page.cleanup();
            return { ...result, pageNumber: pageNum };
          }),
        );
      }

      const batchResults = await Promise.all(pagePromises);

      for (const result of batchResults) {
        const pageChars = result.items.reduce((sum, item) => sum + item.str.length, 0);
        totalChars += pageChars;
        allItems.push({ items: result.items, pageNumber: result.pageNumber });

        processedPages++;
        if (onProgress) {
          const percent = Math.round((processedPages / totalPages) * 100);
          onProgress(percent);
        }
      }
    }

    // Extract metadata
    const url = typeof source === 'string' ? source : 'blob:pdf';
    const meta = await extractMetadata(pdf, url, totalChars);

    // Group text items into paragraphs
    const paragraphs = await groupIntoParagraphs(allItems);

    return { meta, paragraphs };
  } finally {
    // Clean up document resources
    await pdf.cleanup();
    await pdf.destroy();
  }
}

/**
 * Extract text from a specific page range.
 * Useful for on-demand extraction of large PDFs.
 */
export async function extractPageRange(
  source: string | ArrayBuffer,
  startPage: number,
  endPage: number,
  options: Omit<ExtractOptions, 'pageRange'> = {},
): Promise<PDFParagraph[]> {
  const result = await extractPDFText(source, {
    ...options,
    pageRange: { start: startPage, end: endPage },
  });
  return result.paragraphs;
}

/**
 * Get basic document info without full extraction.
 * Useful for checking if OCR is needed before heavy processing.
 */
export async function getDocumentInfo(
  source: string | ArrayBuffer,
  password?: string,
): Promise<{
  pageCount: number;
  isScanned: boolean;
  isTagged: boolean;
  title?: string;
}> {
  const pdfjs = await getPDFJS();

  const loadingParams: { data?: ArrayBuffer; url?: string; password?: string } = {};

  if (source instanceof ArrayBuffer) {
    loadingParams.data = source;
  } else {
    loadingParams.url = source;
  }

  if (password) {
    loadingParams.password = password;
  }

  const loadingTask = pdfjs.getDocument(loadingParams);
  const pdf = await loadingTask.promise;

  try {
    // Sample first 3 pages to estimate if scanned
    const samplePages = Math.min(3, pdf.numPages);
    let sampleChars = 0;

    for (let i = 1; i <= samplePages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageChars = textContent.items.reduce((sum, item) => {
        if ('str' in item && typeof item.str === 'string') {
          return sum + item.str.length;
        }
        return sum;
      }, 0);
      sampleChars += pageChars;
      page.cleanup();
    }

    const avgCharsPerPage = sampleChars / samplePages;
    const isScanned = avgCharsPerPage < SCANNED_THRESHOLD_CHARS_PER_PAGE;

    // Check for tagged PDF
    let isTagged = false;
    try {
      const markInfo = await pdf.getMarkInfo();
      isTagged = markInfo?.Marked === true;
    } catch {
      isTagged = false;
    }

    // Get title from metadata
    const metadata = await pdf.getMetadata();
    const info = metadata.info as Record<string, unknown> | undefined;
    const title = typeof info?.Title === 'string' ? info.Title : undefined;

    return {
      pageCount: pdf.numPages,
      isScanned,
      isTagged,
      title,
    };
  } finally {
    await pdf.cleanup();
    await pdf.destroy();
  }
}
