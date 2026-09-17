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
const MIN_PROSE_TEXT_CHARS = 500;

/**
 * Selector matching interactive elements whose clicks must keep their native
 * behavior instead of starting or seeking playback.
 */
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, [role="button"], [role="link"]';
const PROSE_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, blockquote, li';
const NON_READING_CONTAINER_SELECTOR = 'nav, aside, footer, [aria-hidden="true"]';

/** Proso's own injected surfaces, whose churn is never page content. */
const PROSO_UI_SELECTOR = '#proso-sticky-footer, .proso-w, .proso-play-icon';

/**
 * Cheap page-suitability gate for ambient extraction.
 * Counts prose-like elements only — no script/style payloads, scoring, or
 * layout forcing — and stops as soon as the threshold is reached.
 */
export function isAmbientExtractionCandidate(doc: Document): boolean {
  const body = doc.body;
  if (!body) return false;

  let textChars = 0;
  for (const element of body.querySelectorAll(PROSE_SELECTOR)) {
    if (element.closest(NON_READING_CONTAINER_SELECTOR)) continue;
    textChars += element.textContent?.trim().length ?? 0;
    if (textChars >= MIN_PROSE_TEXT_CHARS) return true;
  }
  return false;
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
 * Does this batch of DOM changes contain prose the affordance has not reached?
 *
 * A client-side router replaces the article without a document load, so the
 * one idle marking pass at content-script start is the only one that ever
 * runs and every routed paragraph arrives unmarked. Re-extracting on any
 * mutation would be far too expensive, so the answer is true only for an added
 * element that is, or contains, an unmarked prose element: the word spans the
 * highlighter writes into a paragraph already marked, footer chrome, and
 * attribute churn all answer false, and a page being read does not re-extract
 * on its own repaints.
 */
export function hasUnmarkedProse(records: readonly MutationRecord[]): boolean {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.closest(PROSO_UI_SELECTOR)) continue;
      if (node.matches(PROSE_SELECTOR) && !node.classList.contains(HOVERABLE_CLASS)) return true;
      for (const candidate of node.querySelectorAll(PROSE_SELECTOR)) {
        if (!candidate.classList.contains(HOVERABLE_CLASS)) return true;
      }
    }
  }
  return false;
}

/**
 * Shared guard for paragraph clicks: a click on (or inside) an interactive
 * element, or the terminating click of a drag text-selection, must not start
 * or seek playback.
 */
export function shouldIgnoreParagraphClick(target: Element, selection: Selection | null): boolean {
  if (target.closest(INTERACTIVE_SELECTOR)) return true;

  const editable = target.closest('[contenteditable]');
  if (editable) {
    const state = editable.getAttribute('contenteditable')?.trim().toLowerCase();
    if (state !== 'false') return true;
  }
  return selection !== null && !selection.isCollapsed;
}
