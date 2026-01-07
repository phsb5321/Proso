/**
 * PDF Message Protocol Schemas
 *
 * Feature: 033-pdf-reading-support
 * Source: contracts/pdf-messages.ts
 *
 * Defines Zod schemas for all PDF-related message types used in
 * communication between content scripts, background script, and popup.
 */

import { z } from 'zod';
import {
  BoundingBoxSchema,
  PDFDocumentMetaSchema,
  PDFParagraphSchema,
  PDFReadingStateSchema,
} from '../../pdf/types';

// =============================================================================
// PDF Detection Messages
// =============================================================================

export const PDFDetectedRequestSchema = z.object({
  url: z.string().url(),
  tabId: z.number().int(),
});

export const PDFDetectedResponseSchema = z.object({
  detected: z.boolean(),
  meta: PDFDocumentMetaSchema.optional(),
});

// =============================================================================
// Text Extraction Messages
// =============================================================================

export const PDFExtractRequestSchema = z.object({
  url: z.string().url(),
  password: z.string().optional(),
  pageRange: z
    .object({
      start: z.number().int().positive(),
      end: z.number().int().positive(),
    })
    .optional(),
});

export const PDFExtractResponseSchema = z.object({
  success: z.boolean(),
  meta: PDFDocumentMetaSchema.optional(),
  paragraphs: z.array(PDFParagraphSchema).optional(),
  error: z.string().optional(),
  requiresPassword: z.boolean().optional(),
});

// =============================================================================
// OCR Processing Messages
// =============================================================================

export const PDFOCRRequestSchema = z.object({
  url: z.string().url(),
  /** Specific pages to OCR, or all if omitted */
  pageNumbers: z.array(z.number().int().positive()).optional(),
  language: z.string().default('eng'),
});

export const PDFOCRProgressSchema = z.object({
  url: z.string().url(),
  currentPage: z.number().int().positive(),
  totalPages: z.number().int().positive(),
  percentComplete: z.number().min(0).max(100),
  estimatedSecondsRemaining: z.number().optional(),
});

export const PDFOCRResponseSchema = z.object({
  success: z.boolean(),
  paragraphs: z.array(PDFParagraphSchema).optional(),
  averageConfidence: z.number().min(0).max(100).optional(),
  error: z.string().optional(),
});

// =============================================================================
// Reading State Messages
// =============================================================================

export const PDFGetStateRequestSchema = z.object({
  url: z.string().url(),
});

export const PDFGetStateResponseSchema = z.object({
  found: z.boolean(),
  state: PDFReadingStateSchema.optional(),
});

export const PDFSaveStateRequestSchema = PDFReadingStateSchema;

export const PDFSaveStateResponseSchema = z.object({
  success: z.boolean(),
});

// =============================================================================
// Playback Control Messages
// =============================================================================

export const PDFPlayRequestSchema = z.object({
  url: z.string().url(),
  startParagraph: z.number().int().nonnegative().optional(),
  password: z.string().optional(),
  resumeFromSaved: z.boolean().optional(),
});

export const PDFPlayResponseSchema = z.object({
  success: z.boolean(),
  paragraphs: z.array(z.string()).optional(),
  startIndex: z.number().int().nonnegative().optional(),
  meta: PDFDocumentMetaSchema.optional(),
  totalParagraphs: z.number().int().positive().optional(),
  error: z.string().optional(),
  requiresPassword: z.boolean().optional(),
});

export const PDFSeekRequestSchema = z.object({
  url: z.string().url(),
  paragraphIndex: z.number().int().nonnegative(),
});

export const PDFSeekResponseSchema = z.object({
  success: z.boolean(),
  currentParagraph: z.number().int().positive().optional(),
  currentPage: z.number().int().positive().optional(),
  error: z.string().optional(),
});

// =============================================================================
// Highlight/Navigation Messages
// =============================================================================

export const PDFHighlightRequestSchema = z.object({
  paragraphIndex: z.number().int().nonnegative(),
  boundingBox: BoundingBoxSchema,
});

export const PDFHighlightResponseSchema = z.object({
  success: z.boolean(),
});

export const PDFScrollToPageRequestSchema = z.object({
  pageNumber: z.number().int().positive(),
});

export const PDFScrollToPageResponseSchema = z.object({
  success: z.boolean(),
});

// =============================================================================
// Inferred Types
// =============================================================================

export type PDFDetectedRequest = z.infer<typeof PDFDetectedRequestSchema>;
export type PDFDetectedResponse = z.infer<typeof PDFDetectedResponseSchema>;
export type PDFExtractRequest = z.infer<typeof PDFExtractRequestSchema>;
export type PDFExtractResponse = z.infer<typeof PDFExtractResponseSchema>;
export type PDFOCRRequest = z.infer<typeof PDFOCRRequestSchema>;
export type PDFOCRProgress = z.infer<typeof PDFOCRProgressSchema>;
export type PDFOCRResponse = z.infer<typeof PDFOCRResponseSchema>;
export type PDFGetStateRequest = z.infer<typeof PDFGetStateRequestSchema>;
export type PDFGetStateResponse = z.infer<typeof PDFGetStateResponseSchema>;
export type PDFPlayRequest = z.infer<typeof PDFPlayRequestSchema>;
export type PDFPlayResponse = z.infer<typeof PDFPlayResponseSchema>;
export type PDFSeekRequest = z.infer<typeof PDFSeekRequestSchema>;
export type PDFSeekResponse = z.infer<typeof PDFSeekResponseSchema>;
export type PDFHighlightRequest = z.infer<typeof PDFHighlightRequestSchema>;
export type PDFScrollToPageRequest = z.infer<typeof PDFScrollToPageRequestSchema>;
