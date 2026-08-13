/**
 * Licence status — the one shape the settings UI is allowed to describe, and
 * the sentences it describes it with.
 *
 * Two rules are load-bearing and live here rather than in the page, so both
 * the background (which holds the raw key) and the options page (which must
 * never receive it) agree by construction:
 *
 * 1. A configured key is reported as a mask, never as the key. The mask is a
 *    fixed width, so it discloses neither the key nor its length; two keys
 *    that share a suffix are indistinguishable in the UI, which is the point —
 *    it is a "yes, something is saved" signal, not a credential display.
 * 2. Only a paid tier confirmed by the server is described as a plan. An
 *    unknown key answers `{valid:false, tier:'free'}` (INV-001,
 *    `license-validation.service.ts:39-47`), and Free is not success.
 *
 * @module utils/license/license-status
 */

/** Fixed-width mask. Never varies with the key, so it leaks no length. */
const MASK = '••••';

/** How many trailing characters a long key reveals. */
const REVEALED = 4;

/**
 * Below this length a key reveals nothing: four characters of a six-character
 * secret is most of it.
 */
const MIN_LENGTH_TO_REVEAL = 8;

/**
 * What the settings page knows about the reader's licence.
 *
 * `serverReachable` separates "the server says you have no paid plan" from
 * "we could not ask", because the honest sentence differs and a configured key
 * must not be reported as rejected just because the network was down.
 */
export interface LicenseStatus {
  /** A key is stored in this browser. */
  readonly configured: boolean;
  /** Masked suffix of the stored key, or null when nothing is stored. */
  readonly maskedKey: string | null;
  /** Tier the server reported for the stored key, when it could be asked. */
  readonly tier: string | null;
  /** Credit balance the server reported, when it could be asked. */
  readonly credits: { readonly total: number; readonly remaining: number } | null;
  /** The server answered the last time its subscription route was asked. */
  readonly serverReachable: boolean;
}

/** The status of a browser with no licence key. */
export const NO_LICENSE_STATUS: LicenseStatus = {
  configured: false,
  maskedKey: null,
  tier: null,
  credits: null,
  serverReachable: false,
};

/**
 * Mask a licence key for display.
 *
 * @returns The mask, or null when there is no key to describe.
 */
export function maskLicenseKey(key: string | null | undefined): string | null {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length < MIN_LENGTH_TO_REVEAL) return MASK;
  return `${MASK} ${trimmed.slice(-REVEALED)}`;
}

/** Tier ids the server can report. Anything else is not a paid plan. */
const TIER_LABELS: Record<string, string> = {
  pro: 'Pro',
  enterprise: 'Enterprise',
};

/** Whether a reported tier entitles the reader to managed synthesis. */
export function isPaidTier(tier: string | null | undefined): boolean {
  return typeof tier === 'string' && tier in TIER_LABELS;
}

function tierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? tier;
}

function count(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

function creditsSentence(credits: LicenseStatus['credits']): string {
  if (!credits) return 'The server reported no credit balance.';
  return `${count(credits.remaining)} of ${count(credits.total)} credits remaining.`;
}

/**
 * The sentence the settings page shows for a status.
 *
 * Every branch says what is true right now, including the two that are easy to
 * paper over: a saved key the server could not be asked about, and a saved key
 * the server does not recognise as paid.
 */
export function describeLicenseStatus(status: LicenseStatus): string {
  if (!status.configured || !status.maskedKey) {
    return 'No licence key saved. Reading with your own synthesis host or your own provider key needs no key and no account.';
  }

  const saved = `Key ending ${status.maskedKey} is saved.`;

  if (!status.serverReachable) {
    return `${saved} The Proso server could not be reached, so the plan it holds for this key is unknown.`;
  }

  if (!isPaidTier(status.tier)) {
    return `${saved} The server reports no paid plan for it.`;
  }

  return `${saved} Plan: ${tierLabel(status.tier as string)}. ${creditsSentence(status.credits)}`;
}

/**
 * The sentence shown after a successful "Save & validate".
 */
export function describeLicenseAccepted(status: LicenseStatus): string {
  return `Licence validated. ${describeLicenseStatus(status)}`;
}

/**
 * The sentence shown after a failed "Save & validate".
 *
 * The second half is the promise the failure path has to keep: a validation
 * that did not succeed never touches a key that already worked.
 */
export function describeLicenseFailure(message: string, previous: LicenseStatus): string {
  const kept =
    previous.configured && previous.maskedKey
      ? `The key already saved (ending ${previous.maskedKey}) was left unchanged.`
      : 'Nothing was saved.';
  return `${message} ${kept}`;
}
