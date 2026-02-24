// Feature gate — determines feature availability by subscription tier
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces:
//   INV-001: Free tier never requires account creation
//   INV-002: BYOK always available on all tiers
//   INV-005: Browser TTS always unlimited

import {
  SubscriptionTier,
  FEATURE_MATRIX,
  TIER_CREDITS,
} from '@proso/shared';
import type { FeatureEntitlements, CreditBalance } from '@proso/shared';

export type Feature = keyof FeatureEntitlements;

/**
 * Check if a specific feature is enabled for a tier.
 * Unknown tiers default to free tier (INV-001).
 */
export function isFeatureEnabled(tier: SubscriptionTier, feature: Feature): boolean {
  const matrix = FEATURE_MATRIX[tier];
  if (!matrix) {
    // Unknown tier → free tier defaults (INV-001)
    return FEATURE_MATRIX[SubscriptionTier.Free][feature];
  }
  return matrix[feature];
}

/**
 * Get all feature entitlements for a tier.
 * Unknown tiers default to free tier (INV-001).
 */
export function getFeatureEntitlements(tier: SubscriptionTier): FeatureEntitlements {
  const matrix = FEATURE_MATRIX[tier];
  if (!matrix) {
    return { ...FEATURE_MATRIX[SubscriptionTier.Free] };
  }
  return { ...matrix };
}

/**
 * Get the default credit balance for a tier.
 * Free tier gets zero managed credits (INV-001: no account needed).
 */
export function getDefaultCreditBalance(tier: SubscriptionTier): CreditBalance {
  const total = TIER_CREDITS[tier] ?? TIER_CREDITS[SubscriptionTier.Free];
  return {
    total,
    remaining: total,
    usagePercent: 0,
  };
}

/**
 * Build the default free-tier response for unknown/unvalidated keys.
 * This is the canonical "no account needed" response (INV-001).
 */
export function getFreeTierDefaults(): {
  tier: SubscriptionTier;
  features: FeatureEntitlements;
  credits: CreditBalance;
} {
  return {
    tier: SubscriptionTier.Free,
    features: getFeatureEntitlements(SubscriptionTier.Free),
    credits: getDefaultCreditBalance(SubscriptionTier.Free),
  };
}
