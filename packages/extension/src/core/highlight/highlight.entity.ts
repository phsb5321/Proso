// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Highlight Domain Entity
 *
 * Core domain model for text highlights following W3C Web Annotation spec.
 * Wraps the Zod schema with domain logic for validation and creation.
 *
 * @module core/highlight/highlight.entity
 */

import {
  type Highlight,
  type HighlightColor,
  type TextQuoteSelector,
  HighlightSchema,
  createHighlight as createHighlightFromSchema,
} from '../../utils/schemas/highlight.schema';

// Re-export types from schema
export type { Highlight, HighlightColor, TextQuoteSelector };

/**
 * Parameters for creating a new highlight
 */
export interface CreateHighlightParams {
  /** Page URL where highlight was created */
  url: string;

  /** The exact highlighted text */
  exact: string;

  /** Context before the quote (32 chars recommended) */
  prefix?: string;

  /** Context after the quote (32 chars recommended) */
  suffix?: string;

  /** Highlight color */
  color?: HighlightColor;

  /** Optional user note */
  note?: string;
}

/**
 * Create a new Highlight entity.
 *
 * Generates UUID and timestamps automatically.
 * Validates against Zod schema.
 *
 * @param params - Creation parameters
 * @returns Validated Highlight entity
 * @throws ZodError if validation fails
 */
export function createHighlight(params: CreateHighlightParams): Highlight {
  return createHighlightFromSchema(params);
}

/**
 * Validate an object as a Highlight entity.
 *
 * @param data - Data to validate
 * @returns Validated Highlight or null if invalid
 */
export function validateHighlight(data: unknown): Highlight | null {
  const result = HighlightSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Check if a highlight is orphaned (failed to re-anchor).
 */
export function isOrphaned(highlight: Highlight): boolean {
  return highlight.orphaned === true;
}

/**
 * Check if a highlight has a note attached.
 */
export function hasNote(highlight: Highlight): boolean {
  return highlight.body?.value !== undefined && highlight.body.value.length > 0;
}

/**
 * Get the note text from a highlight, if any.
 */
export function getNote(highlight: Highlight): string | null {
  return highlight.body?.value ?? null;
}

/**
 * Get the exact text from the first selector.
 */
export function getExactText(highlight: Highlight): string {
  return highlight.target.selector[0].exact;
}

/**
 * Get all selectors from a highlight.
 */
export function getSelectors(highlight: Highlight): TextQuoteSelector[] {
  return highlight.target.selector;
}

/**
 * Create an updated highlight with a new color.
 */
export function withColor(highlight: Highlight, color: HighlightColor): Highlight {
  return {
    ...highlight,
    color,
    modified: new Date().toISOString(),
  };
}

/**
 * Create an updated highlight with a new note.
 */
export function withNote(highlight: Highlight, note: string | null): Highlight {
  const modified = new Date().toISOString();

  if (note === null || note.length === 0) {
    // Remove note
    const { body: _removed, ...rest } = highlight;
    return { ...rest, modified };
  }

  return {
    ...highlight,
    body: {
      type: 'TextualBody',
      value: note,
      format: 'text/plain',
    },
    modified,
  };
}

/**
 * Create an updated highlight with orphaned status.
 */
export function withOrphanedStatus(highlight: Highlight, orphaned: boolean): Highlight {
  return {
    ...highlight,
    orphaned,
    modified: new Date().toISOString(),
  };
}

/**
 * Compare highlights by creation date (newest first).
 */
export function compareByCreated(a: Highlight, b: Highlight): number {
  return new Date(b.created).getTime() - new Date(a.created).getTime();
}

/**
 * Compare highlights by modified date (newest first).
 */
export function compareByModified(a: Highlight, b: Highlight): number {
  const aModified = a.modified ?? a.created;
  const bModified = b.modified ?? b.created;
  return new Date(bModified).getTime() - new Date(aModified).getTime();
}
