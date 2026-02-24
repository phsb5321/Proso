import { SubscriptionTier, SubscriptionStatus } from '@proso/shared';
import { Subscription, type SubscriptionProps } from '../../../../src/core/subscription/subscription.entity';

function makeProps(overrides: Partial<SubscriptionProps> = {}): SubscriptionProps {
  const now = new Date('2026-01-15');
  return {
    id: 'sub-1',
    userId: 'user-1',
    tier: SubscriptionTier.Pro,
    status: SubscriptionStatus.Active,
    currentPeriodStart: new Date('2026-01-01'),
    currentPeriodEnd: new Date('2026-02-01'),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Subscription Entity', () => {
  describe('isActive', () => {
    it('returns true for active subscription', () => {
      const sub = new Subscription(makeProps({ status: SubscriptionStatus.Active }));
      expect(sub.isActive()).toBe(true);
    });

    it('returns true for trialing subscription', () => {
      const sub = new Subscription(makeProps({ status: SubscriptionStatus.Trialing }));
      expect(sub.isActive()).toBe(true);
    });

    it('returns true for past_due subscription', () => {
      const sub = new Subscription(makeProps({ status: SubscriptionStatus.PastDue }));
      expect(sub.isActive()).toBe(true);
    });

    it('returns true for cancelled subscription in grace period (INV-004)', () => {
      const futureEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const sub = new Subscription(makeProps({
        status: SubscriptionStatus.Cancelled,
        currentPeriodEnd: futureEnd,
      }));
      expect(sub.isActive()).toBe(true);
    });

    it('returns false for cancelled subscription past grace period', () => {
      const pastEnd = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const sub = new Subscription(makeProps({
        status: SubscriptionStatus.Cancelled,
        currentPeriodEnd: pastEnd,
      }));
      expect(sub.isActive()).toBe(false);
    });

    it('returns false for expired subscription', () => {
      const sub = new Subscription(makeProps({ status: SubscriptionStatus.Expired }));
      expect(sub.isActive()).toBe(false);
    });
  });

  describe('isInGracePeriod', () => {
    it('returns true when period end is in the future', () => {
      const futureEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const sub = new Subscription(makeProps({ currentPeriodEnd: futureEnd }));
      expect(sub.isInGracePeriod()).toBe(true);
    });

    it('returns false when period end is in the past', () => {
      const pastEnd = new Date(Date.now() - 1000);
      const sub = new Subscription(makeProps({ currentPeriodEnd: pastEnd }));
      expect(sub.isInGracePeriod()).toBe(false);
    });
  });

  describe('cancel', () => {
    it('sets status to cancelled', () => {
      const sub = new Subscription(makeProps());
      const cancelled = sub.cancel();
      expect(cancelled.status).toBe(SubscriptionStatus.Cancelled);
    });

    it('sets cancelledAt timestamp', () => {
      const now = new Date('2026-01-20');
      const sub = new Subscription(makeProps());
      const cancelled = sub.cancel(now);
      expect(cancelled.cancelledAt).toEqual(now);
    });

    it('preserves original subscription immutably', () => {
      const sub = new Subscription(makeProps());
      const cancelled = sub.cancel();
      expect(sub.status).toBe(SubscriptionStatus.Active);
      expect(cancelled.status).toBe(SubscriptionStatus.Cancelled);
    });

    it('keeps tier unchanged (INV-004: credits valid until period end)', () => {
      const sub = new Subscription(makeProps({ tier: SubscriptionTier.Pro }));
      const cancelled = sub.cancel();
      expect(cancelled.tier).toBe(SubscriptionTier.Pro);
    });
  });

  describe('upgrade', () => {
    it('changes tier to new tier', () => {
      const sub = new Subscription(makeProps({ tier: SubscriptionTier.Pro }));
      const upgraded = sub.upgrade(SubscriptionTier.Enterprise);
      expect(upgraded.tier).toBe(SubscriptionTier.Enterprise);
    });

    it('sets status to active', () => {
      const sub = new Subscription(makeProps({
        tier: SubscriptionTier.Pro,
        status: SubscriptionStatus.PastDue,
      }));
      const upgraded = sub.upgrade(SubscriptionTier.Enterprise);
      expect(upgraded.status).toBe(SubscriptionStatus.Active);
    });

    it('returns same instance if tier unchanged', () => {
      const sub = new Subscription(makeProps({ tier: SubscriptionTier.Pro }));
      const same = sub.upgrade(SubscriptionTier.Pro);
      expect(same).toBe(sub);
    });

    it('preserves original subscription immutably', () => {
      const sub = new Subscription(makeProps({ tier: SubscriptionTier.Pro }));
      const upgraded = sub.upgrade(SubscriptionTier.Enterprise);
      expect(sub.tier).toBe(SubscriptionTier.Pro);
      expect(upgraded.tier).toBe(SubscriptionTier.Enterprise);
    });
  });

  describe('renew', () => {
    it('sets new period dates', () => {
      const sub = new Subscription(makeProps());
      const newStart = new Date('2026-02-01');
      const newEnd = new Date('2026-03-01');
      const renewed = sub.renew(newStart, newEnd);
      expect(renewed.currentPeriodStart).toEqual(newStart);
      expect(renewed.currentPeriodEnd).toEqual(newEnd);
    });

    it('resets status to active', () => {
      const sub = new Subscription(makeProps({ status: SubscriptionStatus.PastDue }));
      const renewed = sub.renew(new Date(), new Date());
      expect(renewed.status).toBe(SubscriptionStatus.Active);
    });

    it('clears cancelledAt', () => {
      const sub = new Subscription(makeProps({
        status: SubscriptionStatus.Cancelled,
        cancelledAt: new Date(),
      }));
      const renewed = sub.renew(new Date(), new Date());
      expect(renewed.cancelledAt).toBeUndefined();
    });
  });

  describe('expire', () => {
    it('sets status to expired', () => {
      const sub = new Subscription(makeProps());
      const expired = sub.expire();
      expect(expired.status).toBe(SubscriptionStatus.Expired);
    });
  });

  describe('toProps', () => {
    it('returns a copy of the props', () => {
      const props = makeProps();
      const sub = new Subscription(props);
      const exported = sub.toProps();
      expect(exported).toEqual(props);
      expect(exported).not.toBe(props);
    });
  });
});
