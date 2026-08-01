// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Highlight Export
 *
 * Flattens stored highlights into the shape an external anchoring tool reads:
 * the W3C TextQuoteSelector this extension already stores, plus the page it
 * was taken from. Nothing else — something re-locating a quote in a document
 * needs the quote and its surrounding context, not our storage ids, display
 * colour, or re-anchoring bookkeeping.
 *
 * @module core/highlight/highlight-export
 */

import type { Highlight } from '../../utils/schemas/highlight.schema';

/**
 * The filename the export is written under.
 *
 * Fixed, because the consumer is a script with the path compiled in rather
 * than a person picking a location. Combined with `conflictAction: 'overwrite'`
 * at the download call site, re-exporting replaces the file instead of
 * accumulating `proso-highlights(1).json` beside it.
 */
export const HIGHLIGHT_EXPORT_FILENAME = 'proso-highlights.json';

/** One highlight, flattened for an external anchoring tool. */
export interface HighlightAnchor {
  /** Page the quote was taken from. */
  url: string;

  /** The quoted text, verbatim. */
  exact: string;

  /** Context immediately before the quote; absent at the start of a document. */
  prefix?: string;

  /** Context immediately after the quote; absent at the end of a document. */
  suffix?: string;

  /** The reader's note, when they wrote one. */
  note?: string;

  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * Order two anchors so the exported file is a function of its contents alone.
 *
 * The repository hands back newest-first and leaves same-instant highlights in
 * whatever order the store yields, which would make the file churn between
 * exports that changed nothing. Oldest-first with total tiebreaks means a new
 * highlight appends rather than reshuffling, so a consumer diffing two exports
 * sees only what the reader actually added.
 */
function compareAnchors(a: HighlightAnchor, b: HighlightAnchor): number {
  const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byTime !== 0) return byTime;

  const byUrl = a.url.localeCompare(b.url);
  if (byUrl !== 0) return byUrl;

  return a.exact.localeCompare(b.exact);
}

/**
 * Flatten highlights into export anchors, oldest first.
 *
 * Orphaned highlights are included: re-anchoring failing against the live page
 * says nothing about whether the reader's quote was real, and the consumer
 * anchors against its own copy of the source anyway. Dropping them here would
 * silently lose reader work.
 *
 * @param highlights - Highlights as stored
 * @returns Anchors in a stable order
 */
export function toHighlightAnchors(highlights: readonly Highlight[]): HighlightAnchor[] {
  return highlights
    .map((highlight): HighlightAnchor => {
      // The schema requires at least one selector, so index 0 always exists.
      const selector = highlight.target.selector[0];
      const note = highlight.body?.value.trim();

      // Keys are declared in the order the consumer's format documents them;
      // JSON.stringify drops the undefined ones and preserves the rest.
      return {
        url: highlight.url,
        exact: selector.exact,
        prefix: selector.prefix,
        suffix: selector.suffix,
        note: note ? note : undefined,
        createdAt: highlight.created,
      };
    })
    .sort(compareAnchors);
}

/**
 * Render highlights as the JSON document written to disk.
 *
 * Indented and newline-terminated because the file is read by scripts and
 * people in equal measure, and a text file without a trailing newline is a
 * nuisance to every line-oriented tool that touches it.
 *
 * @param highlights - Highlights as stored
 * @returns The full file contents
 */
export function serializeHighlightAnchors(highlights: readonly Highlight[]): string {
  return `${JSON.stringify(toHighlightAnchors(highlights), null, 2)}\n`;
}
