import { SubscriptionTier, SubscriptionStatus, isOk } from '@voxpage/shared';
import { validateLicenseKey, type LicenseValidationDeps } from '../../../../src/core/subscription/license-validation.service';
import type { UserRepositoryPort, UserRecord } from '../../../../src/ports/user-repository.port';
import type { SubscriptionRepositoryPort, SubscriptionRecord } from '../../../../src/ports/subscription-repository.port';
import type { CreditRepositoryPort, CreditAllocationRecord } from '../../../../src/ports/credit-repository.port';

function makeMockDeps(overrides: {
  user?: UserRecord | null;
  subscription?: SubscriptionRecord | null;
  allocation?: CreditAllocationRecord | null;
} = {}): LicenseValidationDeps {
  return {
    userRepository: {
      findByLicenseKeyHash: jest.fn().mockResolvedValue(overrides.user ?? null),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as UserRepositoryPort,
    subscriptionRepository: {
      findActiveByUserId: jest.fn().mockResolvedValue(overrides.subscription ?? null),
      findById: jest.fn().mockResolvedValue(null),
      findByUserId: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as SubscriptionRepositoryPort,
    creditRepository: {
      findCurrentAllocation: jest.fn().mockResolvedValue(overrides.allocation ?? null),
      deductCredits: jest.fn(),
      getAllocationHistory: jest.fn().mockResolvedValue([]),
      createAllocation: jest.fn(),
    } as unknown as CreditRepositoryPort,
  };
}

const mockUser: UserRecord = {
  id: 'user-1',
  email: 'test@example.com',
  tier: 'pro',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSubscription: SubscriptionRecord = {
  id: 'sub-1',
  userId: 'user-1',
  tier: SubscriptionTier.Pro,
  status: SubscriptionStatus.Active,
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2026-02-01'),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAllocation: CreditAllocationRecord = {
  id: 'alloc-1',
  userId: 'user-1',
  subscriptionId: 'sub-1',
  totalCredits: 500_000,
  remainingCredits: 350_000,
  periodStart: new Date('2026-01-01'),
  periodEnd: new Date('2026-02-01'),
  createdAt: new Date(),
};

describe('validateLicenseKey', () => {
  describe('INV-001: Unknown key returns free tier', () => {
    it('returns free tier for nonexistent user', async () => {
      const deps = makeMockDeps();
      const result = await validateLicenseKey('unknown-hash', deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.valid).toBe(false);
      expect(result.value.tier).toBe(SubscriptionTier.Free);
      expect(result.value.features.managedTts).toBe(false);
      expect(result.value.credits.total).toBe(0);
    });
  });

  describe('User with no subscription', () => {
    it('returns free tier with valid=true', async () => {
      const deps = makeMockDeps({ user: mockUser });
      const result = await validateLicenseKey('known-hash', deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Free);
    });
  });

  describe('Active subscription', () => {
    it('returns pro tier with credits', async () => {
      const deps = makeMockDeps({
        user: mockUser,
        subscription: mockSubscription,
        allocation: mockAllocation,
      });
      const result = await validateLicenseKey('valid-hash', deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Pro);
      expect(result.value.features.managedTts).toBe(true);
      expect(result.value.credits.total).toBe(500_000);
      expect(result.value.credits.remaining).toBe(350_000);
      expect(result.value.credits.usagePercent).toBe(30);
    });

    it('returns zero credits when no allocation found', async () => {
      const deps = makeMockDeps({
        user: mockUser,
        subscription: mockSubscription,
        allocation: null,
      });
      const result = await validateLicenseKey('valid-hash', deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.credits.total).toBe(0);
      expect(result.value.credits.remaining).toBe(0);
    });
  });

  describe('Cancelled subscription in grace period (INV-004)', () => {
    it('returns active entitlements during grace period', async () => {
      const futureEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const deps = makeMockDeps({
        user: mockUser,
        subscription: {
          ...mockSubscription,
          status: SubscriptionStatus.Cancelled,
          currentPeriodEnd: futureEnd,
        },
        allocation: mockAllocation,
      });
      const result = await validateLicenseKey('cancelled-hash', deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Pro);
      expect(result.value.features.managedTts).toBe(true);
    });

    it('returns free tier after grace period expires', async () => {
      const pastEnd = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const deps = makeMockDeps({
        user: mockUser,
        subscription: {
          ...mockSubscription,
          status: SubscriptionStatus.Cancelled,
          currentPeriodEnd: pastEnd,
        },
      });
      const result = await validateLicenseKey('expired-cancel-hash', deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.valid).toBe(true);
      expect(result.value.tier).toBe(SubscriptionTier.Free);
      expect(result.value.features.managedTts).toBe(false);
    });
  });

  describe('Expired subscription', () => {
    it('returns free tier', async () => {
      const deps = makeMockDeps({
        user: mockUser,
        subscription: {
          ...mockSubscription,
          status: SubscriptionStatus.Expired,
          currentPeriodEnd: new Date(Date.now() - 1000),
        },
      });
      const result = await validateLicenseKey('expired-hash', deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.tier).toBe(SubscriptionTier.Free);
    });
  });
});
