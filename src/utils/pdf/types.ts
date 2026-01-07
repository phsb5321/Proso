/**
 * PDF Types and Zod Schemas
 *
 * Feature: 033-pdf-reading-support
 * Source: data-model.md
 *
 * Defines types for PDF document processing, text extraction,
 * reading state persistence, and OCR results.
 */

import { z } from 'zod';

// =============================================================================
// Bounding Box Schema
// =============================================================================

/**
 * Visual bounds for a text element within a PDF page.
 * Coordinates are in PDF units (72 DPI).
 */
export const BoundingBoxSchema = z.object({
  /** Left edge in page units */
  x: z.number(),
  /** Top edge in page units (PDF coordinates) */
  y: z.number(),
  /** Box width */
  width: z.number().positive(),
  /** Box height */
  height: z.number().positive(),
  /** Page containing this box (1-indexed) */
  pageNumber: z.number().int().positive(),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

// =============================================================================
// PDF Paragraph Schema
// =============================================================================

/**
 * Logical text segment derived from page content.
 * Represents a paragraph or text block that can be read aloud.
 */
export const PDFParagraphSchema = z.object({
  /** 0-indexed position in document reading order */
  index: z.number().int().nonnegative(),
  /** Concatenated text content */
  text: z.string().min(1),
  /** Page where paragraph starts (1-indexed) */
  pageNumber: z.number().int().positive(),
  /** Visual bounds for highlighting */
  boundingBox: BoundingBoxSchema,
  /** SHA-256 of text for cache deduplication */
  contentHash: z.string().length(64),
});

export type PDFParagraph = z.infer<typeof PDFParagraphSchema>;

// =============================================================================
// PDF Document Metadata Schema
// =============================================================================

/**
 * Represents a loaded PDF file with metadata.
 */
export const PDFDocumentMetaSchema = z.object({
  /** Full URL of the PDF (file://, http://, https://, blob:) */
  url: z.string().url(),
  /** SHA-256 hash of URL for cache keying */
  urlHash: z.string().length(64),
  /** PDF metadata title (from document info) */
  title: z.string().optional(),
  /** PDF metadata author */
  author: z.string().optional(),
  /** Total pages in document */
  pageCount: z.number().int().positive(),
  /** Whether PDF has accessibility tag tree */
  isTagged: z.boolean(),
  /** Whether PDF is primarily image-based (needs OCR) */
  isScanned: z.boolean(),
});

export type PDFDocumentMeta = z.infer<typeof PDFDocumentMetaSchema>;

// =============================================================================
// PDF Reading State Schema
// =============================================================================

/**
 * User's reading position, persisted for resume functionality.
 * Storage key: `pdfState:{urlHash}`
 */
export const PDFReadingStateSchema = z.object({
  /** PDF URL (primary key) */
  url: z.string().url(),
  /** Hash for faster lookups */
  urlHash: z.string().length(64),
  /** Current paragraph being read (0-indexed) */
  paragraphIndex: z.number().int().nonnegative(),
  /** Current page number (1-indexed) */
  pageNumber: z.number().int().positive(),
  /** Timestamp of last playback */
  lastReadAt: z.coerce.date(),
  /** Total paragraphs (for progress display) */
  totalParagraphs: z.number().int().positive(),
});

export type PDFReadingState = z.infer<typeof PDFReadingStateSchema>;

// =============================================================================
// OCR Types
// =============================================================================

/**
 * Individual word with position from OCR.
 */
export const OCRWordSchema = z.object({
  /** Word text */
  text: z.string(),
  /** OCR confidence for this word (0-100) */
  confidence: z.number().min(0).max(100),
  /** Bounding box coordinates */
  bbox: z.object({
    x0: z.number(),
    y0: z.number(),
    x1: z.number(),
    y1: z.number(),
  }),
});

export type OCRWord = z.infer<typeof OCRWordSchema>;

/**
 * Text extracted via optical character recognition for a single page.
 */
export const OCRResultSchema = z.object({
  /** Page that was OCR'd (1-indexed) */
  pageNumber: z.number().int().positive(),
  /** Full extracted text */
  text: z.string(),
  /** Overall confidence (0-100) */
  confidence: z.number().min(0).max(100),
  /** Individual word positions */
  words: z.array(OCRWordSchema),
  /** When OCR completed */
  processedAt: z.coerce.date(),
});

export type OCRResult = z.infer<typeof OCRResultSchema>;

// =============================================================================
// PDF Settings Schema
// =============================================================================

/**
 * User-configurable PDF reading settings.
 */
export const PDFSettingsSchema = z.object({
  /** Enable OCR for scanned PDFs */
  ocrEnabled: z.boolean().default(true),
  /** Automatically detect scanned PDFs */
  autoDetectScanned: z.boolean().default(true),
  /** Skip headers and footers during reading */
  headerFooterSkip: z.boolean().default(true),
  /** Enable multi-column layout detection */
  columnDetectionEnabled: z.boolean().default(true),
  /** Number of pages to prefetch during extraction */
  prefetchPages: z.number().int().min(1).max(10).default(3),
});

export type PDFSettings = z.infer<typeof PDFSettingsSchema>;

// =============================================================================
// PDF History Schema
// =============================================================================

/**
 * Entry in reading history.
 */
export const PDFHistoryItemSchema = z.object({
  /** URL hash for lookup */
  urlHash: z.string().length(64),
  /** Document title for display */
  title: z.string(),
  /** ISO string of last read time */
  lastReadAt: z.string(),
});

export type PDFHistoryItem = z.infer<typeof PDFHistoryItemSchema>;

/**
 * Reading history with LRU eviction.
 */
export const PDFHistorySchema = z.object({
  /** History entries (most recent first) */
  items: z.array(PDFHistoryItemSchema),
  /** Maximum entries to keep */
  maxItems: z.number().int().positive().default(100),
});

export type PDFHistory = z.infer<typeof PDFHistorySchema>;

// =============================================================================
// Text Item (from pdfjs-dist)
// =============================================================================

/**
 * Raw text item from pdfjs-dist getTextContent().
 * This interface matches the TextItem type from pdfjs-dist.
 */
export interface PDFTextItem {
  /** Text content */
  str: string;
  /** Text direction */
  dir: 'ltr' | 'rtl';
  /** Width in page units */
  width: number;
  /** Height in page units */
  height: number;
  /** [a, b, c, d, e, f] affine transform matrix */
  transform: number[];
  /** Font identifier */
  fontName: string;
  /** Line break after this item */
  hasEOL?: boolean;
}

// =============================================================================
// Extraction Result
// =============================================================================

/**
 * Result of PDF text extraction.
 */
export interface PDFExtractionResult {
  /** Document metadata */
  meta: PDFDocumentMeta;
  /** Extracted paragraphs in reading order */
  paragraphs: PDFParagraph[];
}

// =============================================================================
// PDF Page Info
// =============================================================================

/**
 * Information about a single PDF page.
 */
export interface PDFPageInfo {
  /** Page number (1-indexed) */
  pageNumber: number;
  /** Page width in PDF units (72 DPI) */
  width: number;
  /** Page height in PDF units */
  height: number;
  /** Page rotation in degrees (0, 90, 180, 270) */
  rotation: number;
}
