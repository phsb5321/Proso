// Tier credit allocations and feature matrix
// Source of truth for subscription business rules

import { SubscriptionTier } from '../domain/subscription.js';

/** Credits allocated per billing period (monthly) */
export const TIER_CREDITS: Record<SubscriptionTier, number> = {
  [SubscriptionTier.Free]: 0,
  [SubscriptionTier.Pro]: 500_000,
  [SubscriptionTier.Enterprise]: 2_000_000,
};

/** Feature availability by tier */
export const FEATURE_MATRIX: Record<
  SubscriptionTier,
  { managedTts: boolean; premiumVoices: boolean; prioritySupport: boolean }
> = {
  [SubscriptionTier.Free]: {
    managedTts: false,
    premiumVoices: false,
    prioritySupport: false,
  },
  [SubscriptionTier.Pro]: {
    managedTts: true,
    premiumVoices: true,
    prioritySupport: false,
  },
  [SubscriptionTier.Enterprise]: {
    managedTts: true,
    premiumVoices: true,
    prioritySupport: true,
  },
};
