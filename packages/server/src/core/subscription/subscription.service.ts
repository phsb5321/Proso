// Subscription service — pure domain logic for license validation and subscription management
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces:
//   INV-001: Free tier never requires account creation (unknown keys → free tier defaults)

import {
  SubscriptionTier,
  SubscriptionStatus,
} from '@voxpage/shared';
import type { LicenseValidateResponse } from '@voxpage/shared';
import type { Result } from '@voxpage/shared';
import { Ok } from '@voxpage/shared';
import { getFreeTierDefaults, getFeatureEntitlements } from './feature-gate.js';
import type { LicenseError } from '../shared/domain-errors.js';

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
