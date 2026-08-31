// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Ambient hover-play support (Feature 229).
 *
 * Pure/testable helpers behind the paragraph hover affordance: the
 * ambient-extraction gate, the paint-only hover marker, and the shared
 * paragraph-click guard. The entrypoint wires these; playback itself goes
 * through the existing PARAGRAPH_CLICKED path.
 *
 * @module utils/content/hover-play
 */

/**
 * Class added to extracted paragraphs for the hover-only affordance.
 * Styled exclusively with paint-safe properties (cursor/background/box-shadow)
 * so adding it never reflows the page.
 */
export const HOVERABLE_CLASS = 'proso-hoverable';

/**
 * Pages whose body text is below this many characters are not ambient
 * extraction candidates (login shells, empty app frames). The popup and the
 * first playback start keep extracting regardless.
 */
const MIN_BODY_TEXT_CHARS = 500;

/**
 * Selector matching interactive elements whose clicks must keep their native
 * behavior instead of starting or seeking playback.
 */
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, [contenteditable], [role="button"], [role="link"]';

/**
 * Cheap page-suitability gate for ambient extraction.
 * Reads body text length only — no scoring, no layout forcing.
 */
export function isAmbientExtractionCandidate(doc: Document): boolean {
  const body = doc.body;
  if (!body) return false;
  return (body.textContent?.length ?? 0) >= MIN_BODY_TEXT_CHARS;
}

/**
 * Add the hover-affordance class to every extracted paragraph.
 * Class-only mutation; returns how many paragraphs were marked.
 */
export function markHoverAffordance(paragraphs: readonly Element[]): number {
  let marked = 0;
  for (const el of paragraphs) {
    if (!el.classList.contains(HOVERABLE_CLASS)) {
      el.classList.add(HOVERABLE_CLASS);
    }
    marked += 1;
  }
  return marked;
}

/**
 * Shared guard for paragraph clicks: a click on (or inside) an interactive
 * element, or the terminating click of a drag text-selection, must not start
 * or seek playback.
 */
export function shouldIgnoreParagraphClick(target: Element, selection: Selection | null): boolean {
  if (target.closest(INTERACTIVE_SELECTOR)) {
    return true;
  }
  return selection !== null && !selection.isCollapsed;
}
