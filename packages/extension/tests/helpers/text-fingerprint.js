/**
 * Shared test double for the text-fingerprinting logic in
 * `utils/content/content-extractor`.
 *
 * These specs deliberately RE-CREATE the production algorithm rather than
 * importing it: that is what makes them regression tests — if the production
 * implementation drifts, the recreated copy stops agreeing with it and the
 * assertions fail. The recreation is intentional; having it three times over
 * two files was not, and jscpd flagged the clone once the surrounding test
 * bodies grew (24/08/2026). One copy keeps the regression property while
 * removing the duplication.
 */

/**
 * Normalize text into a comparison fingerprint: lowercase, collapse
 * whitespace, drop punctuation, trim, and cap at 50 characters.
 *
 * @param {string|null|undefined} text
 * @returns {string} fingerprint, or '' for empty/nullish input
 */
export function createTextFingerprint(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
    .substring(0, 50);
}

/**
 * Decide whether two texts refer to the same paragraph: exact fingerprint
 * match, prefix containment, or >=80% positional character agreement. Texts
 * whose fingerprint is shorter than 15 characters are too weak to compare and
 * never match.
 *
 * @param {string|null|undefined} text1
 * @param {string|null|undefined} text2
 * @returns {boolean}
 */
export function textsMatch(text1, text2) {
  if (!text1 || !text2) return false;
  const fp1 = createTextFingerprint(text1);
  const fp2 = createTextFingerprint(text2);
  if (fp1.length < 15 || fp2.length < 15) return false;
  if (fp1 === fp2) return true;
  if (fp1.startsWith(fp2) || fp2.startsWith(fp1)) return true;
  const minLen = Math.min(fp1.length, fp2.length);
  let matches = 0;
  for (let i = 0; i < minLen; i++) {
    if (fp1[i] === fp2[i]) matches++;
  }
  return matches / minLen >= 0.8;
}
