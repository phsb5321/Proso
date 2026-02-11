// Subscription service — pure domain logic for license validation and subscription management
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces:
//   INV-001: Free tier never requires account creation (unknown keys → free tier defaults)

import {
  SubscriptionTier,
  SubscriptionStatus,
  ErrorCode,
  TIER_CREDITS,
} from '@voxpage/shared';
import type { LicenseValidateResponse } from '@voxpage/shared';
import type { Result } from '@voxpage/shared';
import { Ok, Err } from '@voxpage/shared';
import { getFreeTierDefaults, getFeatureEntitlements } from './feature-gate.js';
import type { LicenseError, SubscriptionError } from '../shared/domain-errors.js';
import { subscriptionError } from '../shared/domain-errors.js';
import type { SubscriptionRepositoryPort, SubscriptionRecord } from '../../ports/subscription-repository.port.js';
import type { CreditRepositoryPort, CreditAllocationRecord } from '../../ports/credit-repository.port.js';

/**
 * Subscription data as stored in persistence layer.
 * This is the shape returned by the subscription repository port.
 */
export interface PersistedSubscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  remainingCredits: number;
  totalCredits: number;
}

/**
 * License key data as stored in persistence layer.
 */
export interface PersistedLicenseKey {
  id: string;
  keyHash: string;
  userId: string;
  isActive: boolean;
  activatedAt: Date;
  subscription?: PersistedSubscription;
}

/**
 * Validate a license key and return the user's tier, features, and credits.
 *
 * INV-001: Unknown or invalid keys return free-tier defaults without error.
 * This ensures free-tier users never need to create an account.
 */
export function validateLicense(
  licenseKey: PersistedLicenseKey | null,
): Result<LicenseValidateResponse, LicenseError> {
  // INV-001: No key → free tier defaults (no error, just free tier)
  if (!licenseKey) {
    const defaults = getFreeTierDefaults();
    return Ok({
      valid: false,
      tier: defaults.tier,
      features: defaults.features,
      credits: defaults.credits,
    });
  }

  // Inactive key → free tier defaults
  if (!licenseKey.isActive) {
    const defaults = getFreeTierDefaults();
    return Ok({
      valid: false,
      tier: defaults.tier,
      features: defaults.features,
      credits: defaults.credits,
    });
  }

  // No subscription linked → key is active but no subscription
  if (!licenseKey.subscription) {
    const defaults = getFreeTierDefaults();
    return Ok({
      valid: true,
      tier: defaults.tier,
      features: defaults.features,
      credits: defaults.credits,
    });
  }

  const sub = licenseKey.subscription;

  // Expired subscription → return free tier but signal expiry
  if (
    sub.status === SubscriptionStatus.Expired ||
    sub.status === SubscriptionStatus.Cancelled
  ) {
    if (
      sub.status === SubscriptionStatus.Cancelled &&
      isInGracePeriod(sub)
    ) {
      // Cancel-at-period-end: still active until period ends (INV-004)
      return Ok(buildActiveResponse(sub));
    }

    const defaults = getFreeTierDefaults();
    return Ok({
      valid: true,
      tier: defaults.tier,
      status: sub.status,
      features: defaults.features,
      credits: defaults.credits,
    });
  }

  // Past due → still return current tier but flag status
  if (sub.status === SubscriptionStatus.PastDue) {
    return Ok(buildActiveResponse(sub));
  }

  // Active or trialing subscription
  return Ok(buildActiveResponse(sub));
}

/**
 * Check if a cancelled subscription is still within its paid period.
 * INV-004: No credit expiration mid-billing cycle.
 */
function isInGracePeriod(sub: PersistedSubscription): boolean {
  return sub.currentPeriodEnd.getTime() > Date.now();
}

/**
 * Build response for an active subscription.
 */
function buildActiveResponse(sub: PersistedSubscription): LicenseValidateResponse {
  const total = sub.totalCredits;
  const remaining = sub.remainingCredits;
  const usagePercent = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;

  return {
    valid: true,
    tier: sub.tier,
    status: sub.status,
    features: getFeatureEntitlements(sub.tier),
    credits: {
      total,
      remaining,
      usagePercent,
      periodStart: sub.currentPeriodStart.toISOString(),
      periodEnd: sub.currentPeriodEnd.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Webhook handlers — pure functions for Paddle webhook event processing
// ---------------------------------------------------------------------------

/**
 * Dependency contract for webhook handler functions.
 * Follows the same deps-as-parameter pattern used by tts.service.ts.
 */
export interface WebhookDeps {
  subscriptionRepository: SubscriptionRepositoryPort;
  creditRepository: CreditRepositoryPort;
}

export interface SubscriptionCreatedParams {
  userId: string;
  paddleSubscriptionId: string;
  tier: SubscriptionTier;
  periodStart: Date;
  periodEnd: Date;
}

export interface SubscriptionUpdatedParams {
  paddleSubscriptionId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  periodStart: Date;
  periodEnd: Date;
}

export interface SubscriptionCanceledParams {
  paddleSubscriptionId: string;
}

export interface RenewalParams {
  paddleSubscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Handle a new subscription created via Paddle webhook.
 *
 * Creates a subscription record and allocates initial credits based on
 * `TIER_CREDITS[tier]` from `@voxpage/shared`.
 */
export async function handleSubscriptionCreated(
  params: SubscriptionCreatedParams,
  deps: WebhookDeps,
): Promise<Result<{ subscription: SubscriptionRecord; allocation: CreditAllocationRecord }, SubscriptionError>> {
  const now = new Date();

  const subscription = await deps.subscriptionRepository.save({
    id: '', // Generated by persistence layer
    userId: params.userId,
    paddleSubscriptionId: params.paddleSubscriptionId,
    tier: params.tier,
    status: SubscriptionStatus.Active,
    currentPeriodStart: params.periodStart,
    currentPeriodEnd: params.periodEnd,
    createdAt: now,
    updatedAt: now,
  });

  const credits = TIER_CREDITS[params.tier];

  const allocation = await deps.creditRepository.createAllocation({
    userId: params.userId,
    subscriptionId: subscription.id,
    totalCredits: credits,
    remainingCredits: credits,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  return Ok({ subscription, allocation });
}

/**
 * Handle a subscription update event from Paddle.
 *
 * Finds the existing subscription by Paddle ID, updates tier/status/period,
 * and allocates new credits if the tier changed.
 */
export async function handleSubscriptionUpdated(
  params: SubscriptionUpdatedParams,
  deps: WebhookDeps,
): Promise<Result<SubscriptionRecord, SubscriptionError>> {
  const existing = await deps.subscriptionRepository.findByPaddleId(params.paddleSubscriptionId);

  if (!existing) {
    return Err(
      subscriptionError(
        ErrorCode.SubscriptionNotFound,
        `No subscription found for Paddle ID: ${params.paddleSubscriptionId}`,
      ),
    );
  }

  const tierChanged = existing.tier !== params.tier;

  const updated = await deps.subscriptionRepository.update(existing.id, {
    tier: params.tier,
    status: params.status,
    currentPeriodStart: params.periodStart,
    currentPeriodEnd: params.periodEnd,
    updatedAt: new Date(),
  });

  // If tier changed, allocate new credits at the new tier level
  if (tierChanged) {
    const credits = TIER_CREDITS[params.tier];

    await deps.creditRepository.createAllocation({
      userId: existing.userId,
      subscriptionId: existing.id,
      totalCredits: credits,
      remainingCredits: credits,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
    });
  }

  return Ok(updated);
}

/**
 * Handle a subscription cancellation from Paddle.
 *
 * INV-004: Sets status to 'cancelled' but does NOT revoke credits.
 * The user retains access until `currentPeriodEnd`. The `validateLicense`
 * function checks `isInGracePeriod()` to honor this invariant.
 */
export async function handleSubscriptionCanceled(
  params: SubscriptionCanceledParams,
  deps: WebhookDeps,
): Promise<Result<SubscriptionRecord, SubscriptionError>> {
  const existing = await deps.subscriptionRepository.findByPaddleId(params.paddleSubscriptionId);

  if (!existing) {
    return Err(
      subscriptionError(
        ErrorCode.SubscriptionNotFound,
        `No subscription found for Paddle ID: ${params.paddleSubscriptionId}`,
      ),
    );
  }

  const updated = await deps.subscriptionRepository.update(existing.id, {
    status: SubscriptionStatus.Cancelled,
    cancelledAt: new Date(),
    updatedAt: new Date(),
  });

  // INV-004: Credits remain active until currentPeriodEnd.
  // No credit revocation here — validateLicense + isInGracePeriod handles access.

  return Ok(updated);
}

/**
 * Handle a subscription renewal from Paddle.
 *
 * Creates a new credit allocation for the renewed billing period.
 * The subscription's period dates are updated to reflect the new cycle.
 */
export async function handleRenewal(
  params: RenewalParams,
  deps: WebhookDeps,
): Promise<Result<{ subscription: SubscriptionRecord; allocation: CreditAllocationRecord }, SubscriptionError>> {
  const existing = await deps.subscriptionRepository.findByPaddleId(params.paddleSubscriptionId);

  if (!existing) {
    return Err(
      subscriptionError(
        ErrorCode.SubscriptionNotFound,
        `No subscription found for Paddle ID: ${params.paddleSubscriptionId}`,
      ),
    );
  }

  const updated = await deps.subscriptionRepository.update(existing.id, {
    currentPeriodStart: params.periodStart,
    currentPeriodEnd: params.periodEnd,
    status: SubscriptionStatus.Active,
    updatedAt: new Date(),
  });

  const credits = TIER_CREDITS[existing.tier as SubscriptionTier];

  const allocation = await deps.creditRepository.createAllocation({
    userId: existing.userId,
    subscriptionId: existing.id,
    totalCredits: credits,
    remainingCredits: credits,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  return Ok({ subscription: updated, allocation });
}
