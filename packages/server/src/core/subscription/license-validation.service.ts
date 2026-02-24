// License validation service — orchestrates license key lookup and validation
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces INV-001: Free tier never requires account creation

import { SubscriptionTier, SubscriptionStatus } from '@proso/shared';
import type { LicenseValidateResponse } from '@proso/shared';
import type { Result } from '@proso/shared';
import { Ok } from '@proso/shared';
import { getFreeTierDefaults, getFeatureEntitlements } from './feature-gate.js';
import type { LicenseError } from '../shared/domain-errors.js';
import type { UserRepositoryPort, UserRecord } from '../../ports/user-repository.port.js';
import type { SubscriptionRepositoryPort, SubscriptionRecord } from '../../ports/subscription-repository.port.js';
import type { CreditRepositoryPort } from '../../ports/credit-repository.port.js';

export interface LicenseValidationDeps {
  userRepository: UserRepositoryPort;
  subscriptionRepository: SubscriptionRepositoryPort;
  creditRepository: CreditRepositoryPort;
}

/**
 * Validate a license key hash and return the user's entitlements.
 *
 * INV-001: If no user is found for the key hash, return free tier defaults
 * without creating any account. Free tier never requires registration.
 */
export async function validateLicenseKey(
  keyHash: string,
  deps: LicenseValidationDeps,
): Promise<Result<LicenseValidateResponse, LicenseError>> {
  // Look up user by license key hash
  const user = await deps.userRepository.findByLicenseKeyHash(keyHash);

  // INV-001: Unknown key → free tier defaults (no error)
  if (!user) {
    const defaults = getFreeTierDefaults();
    return Ok({
      valid: false,
      tier: defaults.tier,
      features: defaults.features,
      credits: defaults.credits,
    });
  }

  // Find active subscription
  const subscription = await deps.subscriptionRepository.findActiveByUserId(user.id);

  if (!subscription) {
    // User exists but no active subscription → free tier
    const defaults = getFreeTierDefaults();
    return Ok({
      valid: true,
      tier: defaults.tier,
      features: defaults.features,
      credits: defaults.credits,
    });
  }

  // Check grace period for cancelled subscriptions (INV-004)
  const tier = subscription.tier as SubscriptionTier;
  const status = subscription.status as SubscriptionStatus;

  if (status === SubscriptionStatus.Cancelled || status === SubscriptionStatus.Expired) {
    const isGrace = subscription.currentPeriodEnd.getTime() > Date.now();
    if (status === SubscriptionStatus.Cancelled && isGrace) {
      return Ok(await buildActiveResponse(tier, status, subscription, user, deps));
    }
    // Expired or past grace → free tier
    const defaults = getFreeTierDefaults();
    return Ok({
      valid: true,
      tier: defaults.tier,
      status,
      features: defaults.features,
      credits: defaults.credits,
    });
  }

  // Active, trialing, or past_due → full entitlements
  return Ok(await buildActiveResponse(tier, status, subscription, user, deps));
}

async function buildActiveResponse(
  tier: SubscriptionTier,
  status: SubscriptionStatus,
  subscription: SubscriptionRecord,
  user: UserRecord,
  deps: LicenseValidationDeps,
): Promise<LicenseValidateResponse> {
  // Get credit allocation
  const allocation = await deps.creditRepository.findCurrentAllocation(user.id);

  const total = allocation?.totalCredits ?? 0;
  const remaining = allocation?.remainingCredits ?? 0;
  const usagePercent = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;

  return {
    valid: true,
    tier,
    status,
    features: getFeatureEntitlements(tier),
    credits: {
      total,
      remaining,
      usagePercent,
      periodStart: subscription.currentPeriodStart.toISOString(),
      periodEnd: subscription.currentPeriodEnd.toISOString(),
    },
  };
}
