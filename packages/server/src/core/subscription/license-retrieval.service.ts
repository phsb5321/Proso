// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Account-free licence claim — pure domain logic, ZERO NestJS imports.
 *
 * The Paddle transaction id is routing metadata: Paddle publishes it in the
 * success URL. The buyer-generated claim secret authorises retrieval; only its
 * SHA-256 digest is persisted. Unknown purchases, purchases not recorded yet,
 * missing/malformed credentials, and wrong secrets all take the same
 * application-level digest path and return the same pending value.
 *
 * The claim hash is chosen by the buyer. Paddle's signature later provides
 * transport integrity for that chosen value; it does not make the value
 * unforgeable by its author.
 *
 * @module core/subscription/license-retrieval.service
 */

import type { LicenseClaimResponseParsed, Result, SubscriptionTier } from '@proso/shared';
import { Err, LicenseClaimHashSchema, Ok, isOk, unwrapErr } from '@proso/shared';
import type { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port.js';
import type { LicenseError } from '../shared/domain-errors.js';
import { type LicenseIssuanceDeps, ensureLicenseKey } from './license-issuance.service.js';
import { constantTimeHashMatches, hashClaimSecret } from './license-key.js';

export interface LicenseClaimDeps extends LicenseIssuanceDeps {
  subscriptionRepository: SubscriptionRepositoryPort;
}

/** How long a caller should wait before polling again. */
export const CLAIM_RETRY_AFTER_MS = 2_000;

/** Valid SHA-256 shape used only to equalise the unavailable comparison path. */
const DUMMY_CLAIM_HASH = '0'.repeat(64);

function pending(): LicenseClaimResponseParsed {
  return { status: 'pending', retryAfterMs: CLAIM_RETRY_AFTER_MS };
}

/**
 * Exchange a transaction id plus its claim secret for the purchase's licence
 * key. Only server-side issuance faults return `Err`; every unproven claim is
 * the canonical `Ok(pending)` response.
 */
export async function claimLicenseByTransaction(
  transactionId: string,
  claimSecret: string,
  deps: LicenseClaimDeps,
): Promise<Result<LicenseClaimResponseParsed, LicenseError>> {
  const subscription = await deps.subscriptionRepository.findByPaddleTransactionId(transactionId);

  // Keep unknown/in-flight and known-but-wrong claims on the same digest and
  // constant-time comparison path. The database lookup is identical; no
  // application branch returns before hashing the presented secret.
  const storedClaimHash = subscription?.licenseClaimHash;
  const hasStoredClaimHash = storedClaimHash !== undefined;
  const parsedStoredHash = LicenseClaimHashSchema.safeParse(
    hasStoredClaimHash ? storedClaimHash : DUMMY_CLAIM_HASH,
  );
  const comparisonHash = parsedStoredHash.success ? parsedStoredHash.data : DUMMY_CLAIM_HASH;
  const claimMatches = constantTimeHashMatches(hashClaimSecret(claimSecret), comparisonHash);

  if (!subscription || !hasStoredClaimHash || !parsedStoredHash.success || !claimMatches) {
    return Ok(pending());
  }

  const issued = await ensureLicenseKey(subscription.userId, deps);
  if (!isOk(issued)) {
    return Err(unwrapErr(issued));
  }

  return Ok({
    status: 'issued',
    licenseKey: issued.value.licenseKey,
    tier: subscription.tier as SubscriptionTier,
    issuedAt: issued.value.record.activatedAt.toISOString(),
  });
}
