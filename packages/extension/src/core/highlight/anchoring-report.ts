// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Anchoring Report
 *
 * Decides which highlights the content script should tell storage about after
 * it has tried to place them on the page.
 *
 * @module core/highlight/anchoring-report
 */

/** One highlight's anchoring outcome, as reported to storage. */
export interface AnchoringResult {
  id: string;
  orphaned: boolean;
}

/**
 * Reduce a render pass to the highlights whose anchoring status actually moved.
 *
 * Neither extreme is right. Reporting only the failures would let the flag be
 * set but never cleared, so a page edited back into matching would keep an
 * orphan mark forever. Reporting every result is worse in a quieter way: each
 * write restamps the highlight's `modified` time, which would turn "last time
 * the reader touched this" into "last time the page was opened" — and rewrite
 * every highlight on the page on every single load.
 *
 * @param stored - Highlights as storage has them, with the flag it holds now
 * @param observed - What the render pass found, by highlight id
 * @returns Only the highlights whose flag needs changing
 */
export function toAnchoringReport(
  stored: readonly { id: string; orphaned: boolean }[],
  observed: ReadonlyMap<string, boolean>,
): AnchoringResult[] {
  return stored.flatMap((highlight) => {
    const orphaned = observed.get(highlight.id);

    // A highlight the render pass never reported on has no new status to
    // write. Defaulting it either way would be inventing a measurement.
    if (orphaned === undefined || orphaned === highlight.orphaned) return [];

    return [{ id: highlight.id, orphaned }];
  });
}
