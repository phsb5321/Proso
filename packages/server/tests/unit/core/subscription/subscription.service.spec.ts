import {
  SubscriptionTier,
  SubscriptionStatus,
  isOk,
  isErr,
} from '@proso/shared';
import {
  validateLicense,
  type PersistedLicenseKey,
  type PersistedSubscription,
} from '../../../../src/core/subscription/subscription.service';

function makeSubscription(overrides: Partial<PersistedSubscription> = {}): PersistedSubscription {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
  return {
    id: 'sub-1',
    userId: 'user-1',
    tier: SubscriptionTier.Pro,
    status: SubscriptionStatus.Active,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    remainingCredits: 400_000,
    totalCredits: 500_000,
    ...overrides,
  };
}

function makeLicenseKey(overrides: Partial<PersistedLicenseKey> = {}): PersistedLicenseKey {
  return {
    id: 'lic-1',
    keyHash: 'hash-abc-123',
    userId: 'user-1',
    isActive: true,
    activatedAt: new Date(),
    subscription: makeSubscription(),
    ...overrides,
  };
}

describe('SubscriptionService.validateLicense', () => {
  describe('INV-001: Free tier never requires account creation', () => {
    it('returns free tier defaults when license key is null', () => {
      const result = validateLicense(null);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(false);
      expect(result.value.tier).toBe(SubscriptionTier.Free);
      expect(result.value.features.managedTts).toBe(false);
      expect(result.value.credits.total).toBe(0);
      expect(result.value.credits.remaining).toBe(0);
    });

    it('returns free tier defaults when license key is inactive', () => {
      const key = makeLicenseKey({ isActive: false });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(false);
      expect(result.value.tier).toBe(SubscriptionTier.Free);
      expect(result.value.credits.total).toBe(0);
    });

    it('returns free tier for active key with no subscription', () => {
      const key = makeLicenseKey({ subscription: undefined });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Free);
    });

    it('never returns an error for unknown keys', () => {
      // INV-001: free tier is always returned, never an error
      const result = validateLicense(null);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });
  });

  describe('Active subscription', () => {
    it('returns pro tier for active pro subscription', () => {
      const key = makeLicenseKey();
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Pro);
      expect(result.value.features.managedTts).toBe(true);
      expect(result.value.features.premiumVoices).toBe(true);
    });

    it('returns enterprise tier for active enterprise subscription', () => {
      const key = makeLicenseKey({
        subscription: makeSubscription({
          tier: SubscriptionTier.Enterprise,
          totalCredits: 2_000_000,
          remainingCredits: 1_500_000,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.tier).toBe(SubscriptionTier.Enterprise);
      expect(result.value.features.prioritySupport).toBe(true);
      expect(result.value.credits.total).toBe(2_000_000);
      expect(result.value.credits.remaining).toBe(1_500_000);
    });

    it('calculates usage percentage correctly', () => {
      const key = makeLicenseKey({
        subscription: makeSubscription({
          totalCredits: 500_000,
          remainingCredits: 250_000,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.credits.usagePercent).toBe(50);
    });

    it('returns 0% usage when no credits used', () => {
      const key = makeLicenseKey({
        subscription: makeSubscription({
          totalCredits: 500_000,
          remainingCredits: 500_000,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.credits.usagePercent).toBe(0);
    });

    it('includes period dates in response', () => {
      const periodStart = new Date('2026-01-01');
      const periodEnd = new Date('2026-02-01');
      const key = makeLicenseKey({
        subscription: makeSubscription({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.credits.periodStart).toBe(periodStart.toISOString());
      expect(result.value.credits.periodEnd).toBe(periodEnd.toISOString());
    });
  });

  describe('Trialing subscription', () => {
    it('returns active response for trialing subscription', () => {
      const key = makeLicenseKey({
        subscription: makeSubscription({
          status: SubscriptionStatus.Trialing,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(true);
      expect(result.value.status).toBe(SubscriptionStatus.Trialing);
      expect(result.value.features.managedTts).toBe(true);
    });
  });

  describe('Past due subscription', () => {
    it('returns active response with past_due status', () => {
      const key = makeLicenseKey({
        subscription: makeSubscription({
          status: SubscriptionStatus.PastDue,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(true);
      expect(result.value.status).toBe(SubscriptionStatus.PastDue);
      expect(result.value.features.managedTts).toBe(true);
    });
  });

  describe('INV-004: Cancelled subscription grace period', () => {
    it('keeps features active during grace period (cancel-at-period-end)', () => {
      const futureEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
      const key = makeLicenseKey({
        subscription: makeSubscription({
          status: SubscriptionStatus.Cancelled,
          currentPeriodEnd: futureEnd,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Pro);
      expect(result.value.features.managedTts).toBe(true);
    });

    it('reverts to free tier after grace period expires', () => {
      const pastEnd = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const key = makeLicenseKey({
        subscription: makeSubscription({
          status: SubscriptionStatus.Cancelled,
          currentPeriodEnd: pastEnd,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Free);
      expect(result.value.features.managedTts).toBe(false);
      expect(result.value.credits.total).toBe(0);
    });
  });

  describe('Expired subscription', () => {
    it('returns free tier for expired subscription', () => {
      const key = makeLicenseKey({
        subscription: makeSubscription({
          status: SubscriptionStatus.Expired,
        }),
      });
      const result = validateLicense(key);
      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Free);
      expect(result.value.status).toBe(SubscriptionStatus.Expired);
      expect(result.value.features.managedTts).toBe(false);
    });
  });
});
