/**
 * Footer State Message Contract
 *
 * Defines the message schema for FOOTER_STATE_UPDATE messages
 * sent from background to content script.
 *
 * @module contracts/footer-state
 */

import { z } from 'zod';

/**
 * Schema for the footer state update payload.
 *
 * IMPORTANT: currentTime and totalTime are pre-formatted strings.
 * The background script formats these using the formatTime() function.
 */
export const FooterStateUpdateSchema = z.object({
  /** Whether audio is currently playing */
  isPlaying: z.boolean(),

  /** Current playback time formatted as "M:SS" (e.g., "1:30") */
  currentTime: z.string().regex(/^\d+:\d{2}$/, 'Must be in M:SS format'),

  /** Total duration formatted as "M:SS" (e.g., "5:00") */
  totalTime: z.string().regex(/^\d+:\d{2}$/, 'Must be in M:SS format'),

  /** Progress percentage (0-100) */
  progress: z.number().min(0).max(100),

  /** Current paragraph number (1-indexed for display) */
  currentParagraph: z.number().int().min(1),

  /** Total number of paragraphs */
  totalParagraphs: z.number().int().min(1),
});

export type FooterStateUpdate = z.infer<typeof FooterStateUpdateSchema>;

/**
 * Schema for paragraph click payload.
 *
 * Sent from content script to background when user clicks a paragraph.
 */
export const ParagraphClickedSchema = z.object({
  /** Zero-based index of clicked paragraph */
  index: z.number().int().min(0),

  /** Timestamp of click for debounce/dedup */
  timestamp: z.number().int().positive(),
});

export type ParagraphClicked = z.infer<typeof ParagraphClickedSchema>;

/**
 * Schema for highlight update payload.
 *
 * Sent from background to content script to update visual highlighting.
 */
export const HighlightUpdateSchema = z.object({
  /** Currently active paragraph index (0-based) */
  activeIndex: z.number().int().min(0),

  /** Optional: word-level highlight start position */
  wordStart: z.number().int().min(0).optional(),

  /** Optional: word-level highlight end position */
  wordEnd: z.number().int().min(0).optional(),
});

export type HighlightUpdate = z.infer<typeof HighlightUpdateSchema>;

/**
 * Utility: Format seconds to "M:SS" string.
 *
 * This should be the ONLY place time formatting happens to ensure consistency.
 *
 * @param seconds - Time in seconds (can be fractional)
 * @returns Formatted string like "1:30" or "0:05"
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const totalSeconds = Math.floor(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Utility: Parse "M:SS" string back to seconds.
 *
 * Inverse of formatTime for testing/validation.
 *
 * @param timeStr - Formatted time string like "1:30"
 * @returns Time in seconds, or 0 if invalid
 */
export function parseTime(timeStr: string): number {
  const match = timeStr.match(/^(\d+):(\d{2})$/);
  if (!match) {
    return 0;
  }

  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);

  return mins * 60 + secs;
}
