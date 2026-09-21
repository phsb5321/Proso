/**
 * Progress displayed by the popup.
 *
 * The popup receives two different numbers for the same bar: `playback.getState`
 * reports the fraction of the CURRENT paragraph, while the footer broadcast
 * reports progress through the whole document. Feeding both straight into the
 * bar made it jump backwards (25% -> 0%) whenever a pause triggered a re-read,
 * and nothing repaired it afterwards.
 *
 * Within one paragraph the reading position only moves forward, so the maximum
 * is held. A seek backwards arrives as a different paragraph index (`sameItem`
 * false) and is passed through untouched.
 *
 * @module utils/popup/progress-hold
 */

export function holdProgressWithinItem(previous: number, next: number, sameItem: boolean): number {
  if (!Number.isFinite(next)) return previous;
  if (!sameItem) return next;
  return Math.max(previous, next);
}
