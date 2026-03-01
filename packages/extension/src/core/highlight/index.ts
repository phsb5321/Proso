// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Highlight Core Domain Module
 *
 * Exports all highlight domain entities and services.
 *
 * @module core/highlight
 */

// Entity and types
export {
  type Highlight,
  type HighlightColor,
  type TextQuoteSelector,
  type CreateHighlightParams,
  createHighlight,
  validateHighlight,
  isOrphaned,
  hasNote,
  getNote,
  getExactText,
  getSelectors,
  withColor,
  withNote,
  withOrphanedStatus,
  compareByCreated,
  compareByModified,
} from './highlight.entity';

// TextQuoteSelector utilities
export {
  DEFAULT_CONTEXT_LENGTH,
  MAX_CONTEXT_LENGTH,
  type CreateSelectorParams,
  createTextQuoteSelector,
  createFromSelection,
  validateTextQuoteSelector,
  buildSearchPattern,
  getExpectedLength,
  normalizeText,
  selectorsMatch,
} from './text-quote-selector';

// Anchoring service
export {
  type AnchoringError,
  type AnchorPosition,
  type AnchorResult,
  type AnchoringConfig,
  type AnchoringService,
  levenshteinDistance,
  similarityRatio,
  anchorToText,
  createRangeFromPosition,
  anchor,
  anchorAll,
  createAnchoringService,
} from './anchoring.service';
