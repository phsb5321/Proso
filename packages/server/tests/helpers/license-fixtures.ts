/**
 * Shared fixtures for the licence claim path (Feature 148).
 *
 * Dates are fixed rather than derived from `Date.now()`: a purchase's billing
 * period is data under test, and a fixture that drifts with the clock hides
 * period-boundary defects instead of exposing them.
 */

import { SubscriptionStatus, SubscriptionTier } from '@proso/shared';
import { hashClaimSecret } from '../../src/core/subscription/license-key';
import type { SubscriptionRecord } from '../../src/ports/subscription-repository.port';

/** base64url of the 32 bytes the site's buy click generates. */
export const CLAIM_SECRET = Buffer.alloc(32, 7).toString('base64url');

/** Paddle's `_ptxn` — routing metadata, never a credential. */
export const TRANSACTION_ID = 'txn_01hv8k2p9r7tnz4lcw9ybs1dgf';

export const PADDLE_SUBSCRIPTION_ID = 'sub_01hv8k2p9r7tnz4l';

export const PERIOD_START = '2026-08-12T18:00:00Z';
export const PERIOD_END = '2026-09-12T18:00:00Z';

/** Lowercase hex SHA-256, the shape `LicenseClaimHashSchema` accepts. */
export const CLAIM_HASH = hashClaimSecret(CLAIM_SECRET);

/**
 * The persisted purchase state consumed by the claim foundation. Plane #38
 * will make the corrected Paddle boundary write this shape atomically.
 */
export function makeSubscriptionRecord(
  overrides: Partial<SubscriptionRecord> = {},
): SubscriptionRecord {
  return {
    id: 'sub-existing',
    userId: 'user-1',
    paddleSubscriptionId: PADDLE_SUBSCRIPTION_ID,
    paddleTransactionId: TRANSACTION_ID,
    licenseClaimHash: CLAIM_HASH,
    tier: SubscriptionTier.Pro,
    status: SubscriptionStatus.Active,
    currentPeriodStart: new Date(PERIOD_START),
    currentPeriodEnd: new Date(PERIOD_END),
    createdAt: new Date(PERIOD_START),
    updatedAt: new Date(PERIOD_START),
    ...overrides,
  };
}

/** A ConfigService stand-in carrying the licence derivation secret. */
export function makeConfig(overrides: Record<string, string> = {}): { get: (k: string) => string } {
  const settings: Record<string, string> = {
    LICENSE_KEY_SECRET: 'f'.repeat(32),
    NODE_ENV: 'test',
    ...overrides,
  };
  return { get: (key: string) => settings[key] };
}
