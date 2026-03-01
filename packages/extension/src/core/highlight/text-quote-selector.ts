// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * TextQuoteSelector Domain Logic
 *
 * W3C Web Annotation compatible text selector for robust text re-anchoring.
 * Captures exact text with surrounding context for fuzzy matching.
 *
 * @see https://www.w3.org/TR/annotation-model/#text-quote-selector
 * @module core/highlight/text-quote-selector
 */

import {
  type TextQuoteSelector,
  TextQuoteSelectorSchema,
} from '../../utils/schemas/highlight.schema';

// Re-export type
export type { TextQuoteSelector };

/**
 * Default context length for prefix/suffix (chars)
 */
export const DEFAULT_CONTEXT_LENGTH = 32;

/**
 * Maximum context length (per schema)
 */
export const MAX_CONTEXT_LENGTH = 64;

/**
 * Parameters for creating a TextQuoteSelector from a selection
 */
export interface CreateSelectorParams {
  /** The exact selected text */
  exact: string;

  /** Text before the selection (will be truncated to MAX_CONTEXT_LENGTH) */
  textBefore?: string;

  /** Text after the selection (will be truncated to MAX_CONTEXT_LENGTH) */
  textAfter?: string;

  /** Context length for prefix/suffix (default: 32) */
  contextLength?: number;
}

/**
 * Create a TextQuoteSelector from selection context.
 *
 * Automatically truncates prefix/suffix to the specified context length.
 * Validates against Zod schema.
 *
 * @param params - Selection parameters
 * @returns Validated TextQuoteSelector
 * @throws ZodError if validation fails
 */
export function createTextQuoteSelector(params: CreateSelectorParams): TextQuoteSelector {
  const contextLength = Math.min(params.contextLength ?? DEFAULT_CONTEXT_LENGTH, MAX_CONTEXT_LENGTH);

  // Extract prefix (last N characters before selection)
  const prefix = params.textBefore
    ? params.textBefore.slice(-contextLength)
    : undefined;

  // Extract suffix (first N characters after selection)
  const suffix = params.textAfter
    ? params.textAfter.slice(0, contextLength)
    : undefined;

  const selector: TextQuoteSelector = {
    type: 'TextQuoteSelector',
    exact: params.exact,
    prefix: prefix && prefix.length > 0 ? prefix : undefined,
    suffix: suffix && suffix.length > 0 ? suffix : undefined,
  };

  return TextQuoteSelectorSchema.parse(selector);
}

/**
 * Create a TextQuoteSelector from a browser Selection object.
 *
 * Extracts context from the surrounding text content.
 *
 * @param selection - Browser Selection object
 * @param contextLength - Context length for prefix/suffix
 * @returns TextQuoteSelector or null if selection is empty
 */
export function createFromSelection(
  selection: Selection,
  contextLength: number = DEFAULT_CONTEXT_LENGTH,
): TextQuoteSelector | null {
  const exact = selection.toString().trim();

  if (!exact || exact.length === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!range) {
    return createTextQuoteSelector({ exact });
  }

  // Get text content from the common ancestor container
  const container = range.commonAncestorContainer;
  const fullText = container.textContent ?? '';

  // Find the position of the selection in the container text
  const selectionText = range.toString();
  const startOffset = fullText.indexOf(selectionText);

  if (startOffset === -1) {
    // Fallback: just use exact text without context
    return createTextQuoteSelector({ exact });
  }

  const textBefore = fullText.slice(0, startOffset);
  const textAfter = fullText.slice(startOffset + selectionText.length);

  return createTextQuoteSelector({
    exact,
    textBefore,
    textAfter,
    contextLength,
  });
}

/**
 * Validate data as a TextQuoteSelector.
 *
 * @param data - Data to validate
 * @returns Validated TextQuoteSelector or null
 */
export function validateTextQuoteSelector(data: unknown): TextQuoteSelector | null {
  const result = TextQuoteSelectorSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Build a search pattern from a selector for fuzzy matching.
 *
 * Combines prefix + exact + suffix for context-aware matching.
 *
 * @param selector - TextQuoteSelector
 * @returns Combined pattern string
 */
export function buildSearchPattern(selector: TextQuoteSelector): string {
  const parts: string[] = [];

  if (selector.prefix) {
    parts.push(selector.prefix);
  }

  parts.push(selector.exact);

  if (selector.suffix) {
    parts.push(selector.suffix);
  }

  return parts.join('');
}

/**
 * Calculate the expected length of text to search.
 *
 * Used for range estimation during re-anchoring.
 */
export function getExpectedLength(selector: TextQuoteSelector): number {
  return (
    (selector.prefix?.length ?? 0) +
    selector.exact.length +
    (selector.suffix?.length ?? 0)
  );
}

/**
 * Normalize text for matching (lowercase, collapse whitespace).
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Check if two selectors match the same text.
 */
export function selectorsMatch(a: TextQuoteSelector, b: TextQuoteSelector): boolean {
  return normalizeText(a.exact) === normalizeText(b.exact);
}
