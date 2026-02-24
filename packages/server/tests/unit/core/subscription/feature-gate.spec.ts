import {
  SubscriptionTier,
  FEATURE_MATRIX,
  TIER_CREDITS,
} from '@proso/shared';
import {
  isFeatureEnabled,
  getFeatureEntitlements,
  getDefaultCreditBalance,
  getFreeTierDefaults,
} from '../../../../src/core/subscription/feature-gate';

describe('FeatureGate', () => {
  describe('isFeatureEnabled', () => {
    it('returns false for managedTts on free tier', () => {
      expect(isFeatureEnabled(SubscriptionTier.Free, 'managedTts')).toBe(false);
    });

    it('returns false for premiumVoices on free tier', () => {
      expect(isFeatureEnabled(SubscriptionTier.Free, 'premiumVoices')).toBe(false);
    });

    it('returns false for prioritySupport on free tier', () => {
      expect(isFeatureEnabled(SubscriptionTier.Free, 'prioritySupport')).toBe(false);
    });

    it('returns true for managedTts on pro tier', () => {
      expect(isFeatureEnabled(SubscriptionTier.Pro, 'managedTts')).toBe(true);
    });

    it('returns true for premiumVoices on pro tier', () => {
      expect(isFeatureEnabled(SubscriptionTier.Pro, 'premiumVoices')).toBe(true);
    });

    it('returns false for prioritySupport on pro tier', () => {
      expect(isFeatureEnabled(SubscriptionTier.Pro, 'prioritySupport')).toBe(false);
    });

    it('returns true for all features on enterprise tier', () => {
      expect(isFeatureEnabled(SubscriptionTier.Enterprise, 'managedTts')).toBe(true);
      expect(isFeatureEnabled(SubscriptionTier.Enterprise, 'premiumVoices')).toBe(true);
      expect(isFeatureEnabled(SubscriptionTier.Enterprise, 'prioritySupport')).toBe(true);
    });

    it('falls back to free tier for unknown tier (INV-001)', () => {
      // Cast to simulate an unknown tier
      const unknownTier = 'unknown' as SubscriptionTier;
      expect(isFeatureEnabled(unknownTier, 'managedTts')).toBe(false);
      expect(isFeatureEnabled(unknownTier, 'premiumVoices')).toBe(false);
      expect(isFeatureEnabled(unknownTier, 'prioritySupport')).toBe(false);
    });
  });

  describe('getFeatureEntitlements', () => {
    it('returns correct entitlements for free tier', () => {
      const entitlements = getFeatureEntitlements(SubscriptionTier.Free);
      expect(entitlements).toEqual({
        managedTts: false,
        premiumVoices: false,
        prioritySupport: false,
      });
    });

    it('returns correct entitlements for pro tier', () => {
      const entitlements = getFeatureEntitlements(SubscriptionTier.Pro);
      expect(entitlements).toEqual({
        managedTts: true,
        premiumVoices: true,
        prioritySupport: false,
      });
    });

    it('returns correct entitlements for enterprise tier', () => {
      const entitlements = getFeatureEntitlements(SubscriptionTier.Enterprise);
      expect(entitlements).toEqual({
        managedTts: true,
        premiumVoices: true,
        prioritySupport: true,
      });
    });

    it('returns a copy, not a reference to FEATURE_MATRIX', () => {
      const entitlements = getFeatureEntitlements(SubscriptionTier.Free);
      entitlements.managedTts = true; // Mutate the copy
      // Original matrix should be unchanged
      expect(FEATURE_MATRIX[SubscriptionTier.Free].managedTts).toBe(false);
    });

    it('defaults to free tier for unknown tier (INV-001)', () => {
      const unknownTier = 'mystery' as SubscriptionTier;
      const entitlements = getFeatureEntitlements(unknownTier);
      expect(entitlements).toEqual({
        managedTts: false,
        premiumVoices: false,
        prioritySupport: false,
      });
    });
  });

  describe('getDefaultCreditBalance', () => {
    it('returns 0 credits for free tier', () => {
      const balance = getDefaultCreditBalance(SubscriptionTier.Free);
      expect(balance.total).toBe(0);
      expect(balance.remaining).toBe(0);
      expect(balance.usagePercent).toBe(0);
    });

    it('returns 500,000 credits for pro tier', () => {
      const balance = getDefaultCreditBalance(SubscriptionTier.Pro);
      expect(balance.total).toBe(500_000);
      expect(balance.remaining).toBe(500_000);
      expect(balance.usagePercent).toBe(0);
    });

    it('returns 2,000,000 credits for enterprise tier', () => {
      const balance = getDefaultCreditBalance(SubscriptionTier.Enterprise);
      expect(balance.total).toBe(2_000_000);
      expect(balance.remaining).toBe(2_000_000);
      expect(balance.usagePercent).toBe(0);
    });

    it('defaults to free tier credits for unknown tier (INV-001)', () => {
      const unknownTier = 'mystery' as SubscriptionTier;
      const balance = getDefaultCreditBalance(unknownTier);
      expect(balance.total).toBe(0);
      expect(balance.remaining).toBe(0);
    });
  });

  describe('getFreeTierDefaults', () => {
    it('returns free tier with zero credits (INV-001)', () => {
      const defaults = getFreeTierDefaults();
      expect(defaults.tier).toBe(SubscriptionTier.Free);
      expect(defaults.credits.total).toBe(0);
      expect(defaults.credits.remaining).toBe(0);
      expect(defaults.credits.usagePercent).toBe(0);
    });

    it('returns no managed TTS features for free tier', () => {
      const defaults = getFreeTierDefaults();
      expect(defaults.features.managedTts).toBe(false);
      expect(defaults.features.premiumVoices).toBe(false);
      expect(defaults.features.prioritySupport).toBe(false);
    });

    it('matches FEATURE_MATRIX free tier values', () => {
      const defaults = getFreeTierDefaults();
      expect(defaults.features).toEqual(FEATURE_MATRIX[SubscriptionTier.Free]);
    });

    it('matches TIER_CREDITS free tier value', () => {
      const defaults = getFreeTierDefaults();
      expect(defaults.credits.total).toBe(TIER_CREDITS[SubscriptionTier.Free]);
    });
  });
});
