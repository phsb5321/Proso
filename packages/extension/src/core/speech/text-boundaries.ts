/**
 * Unicode text-boundary helpers shared by speech normalizers.
 *
 * JavaScript's `\b` is ASCII-only and reads single UTF-16 code units, so
 * `caféAPI`, decomposed `cafe\u0301API`, and non-BMP neighbours all slip past
 * it. These helpers inspect complete code points and treat combining marks as
 * token constituents.
 *
 * @module core/speech/text-boundaries
 */

/** The full code point ending at `index` (surrogate-pair aware). */
export function codePointBefore(text: string, index: number): string {
  if (index <= 0) return '';
  const unit = text.charCodeAt(index - 1);
  if (unit >= 0xdc00 && unit <= 0xdfff && index - 2 >= 0) {
    const lead = text.charCodeAt(index - 2);
    if (lead >= 0xd800 && lead <= 0xdbff) return text.slice(index - 2, index);
  }
  return text.slice(index - 1, index);
}

/** The full code point starting at `index` (surrogate-pair aware). */
export function codePointAt(text: string, index: number): string {
  if (index >= text.length) return '';
  const unit = text.charCodeAt(index);
  if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
    const trail = text.charCodeAt(index + 1);
    if (trail >= 0xdc00 && trail <= 0xdfff) return text.slice(index, index + 2);
  }
  return text.slice(index, index + 1);
}

/** True when `[start,end)` is a standalone token (no letter/number/mark/underscore neighbour). */
export function isStandaloneAt(text: string, start: number, end: number): boolean {
  const letterish = (ch: string): boolean => /[\p{L}\p{N}\p{M}_]/u.test(ch);
  return !letterish(codePointBefore(text, start)) && !letterish(codePointAt(text, end));
}
