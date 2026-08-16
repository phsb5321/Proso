/**
 * Strict validation for the review metadata every quality baseline carries.
 *
 * Why this exists: each ratchet expired its baseline with
 * `Date.parse(`${expires}T00:00:00Z`) < Date.now()`. When `expires` is absent
 * or malformed that comparison is `NaN < Date.now()`, which is `false` — so a
 * baseline with no expiry date never expires and the ratchet silently stops
 * ratcheting. The accompanying metadata checks had the same shape: `typeof x
 * !== 'string'` accepts `''`, so an entry could carry a blank owner and reason
 * and still satisfy the contract that says every baselined finding is owned.
 *
 * Both holes fail open, which is the one direction a ratchet must never fail.
 * Found by the different-family adversarial review of Feature 175.
 */

const REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @returns {string | null} a failure message, or null when `value` is a real
 * YYYY-MM-DD date.
 *
 * The round-trip is not redundant with the pattern. Measured on this Node: a
 * month out of range (`2026-13-01`) parses to NaN, but a day out of range does
 * not — `2026-02-30` parses finite and rolls forward to `2026-03-02`. Without
 * the round-trip an impossible date is accepted and silently means a different
 * day than the one written, which is the wrong direction for an expiry.
 */
export function reviewDateFailure(value, label) {
  if (typeof value !== 'string' || !REVIEW_DATE_PATTERN.test(value)) {
    return `${label} must be a YYYY-MM-DD review date, got ${JSON.stringify(value)}`;
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    return `${label} is not a real date: ${value}`;
  }
  return null;
}

/** @returns {string | null} a failure message, or null when `value` is non-blank text. */
export function textFailure(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    return `${label} must be a non-empty string`;
  }
  return null;
}

/** @returns {number} the parsed epoch milliseconds. Throws when `value` is not a review date. */
export function requireReviewDate(value, label) {
  const failure = reviewDateFailure(value, label);
  if (failure) throw new Error(failure);
  return Date.parse(`${value}T00:00:00Z`);
}

/** Throws when `value` is absent, not a string, or blank. */
export function requireText(value, label) {
  const failure = textFailure(value, label);
  if (failure) throw new Error(failure);
  return value;
}
