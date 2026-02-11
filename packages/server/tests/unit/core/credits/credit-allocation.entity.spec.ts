import {
  CreditAllocation,
  type CreditAllocationProps,
} from '../../../../src/core/credits/credit-allocation.entity';

function makeProps(
  overrides: Partial<CreditAllocationProps> = {},
): CreditAllocationProps {
  return {
    id: 'alloc-1',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    totalCredits: 500000,
    remainingCredits: 350000,
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-03-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('CreditAllocation Entity', () => {
  describe('constructor & getters', () => {
    it('exposes all properties via getters', () => {
      const props = makeProps();
      const alloc = new CreditAllocation(props);

      expect(alloc.id).toBe('alloc-1');
      expect(alloc.userId).toBe('user-1');
      expect(alloc.subscriptionId).toBe('sub-1');
      expect(alloc.totalCredits).toBe(500000);
      expect(alloc.remainingCredits).toBe(350000);
      expect(alloc.periodStart).toEqual(new Date('2026-01-01'));
      expect(alloc.periodEnd).toEqual(new Date('2026-03-01'));
      expect(alloc.createdAt).toEqual(new Date('2026-01-01'));
    });
  });

  describe('hasCredits', () => {
    it('returns true when remaining credits exceed requested amount', () => {
      const alloc = new CreditAllocation(makeProps({ remainingCredits: 1000 }));
      expect(alloc.hasCredits(500)).toBe(true);
    });

    it('returns true when remaining credits exactly equal requested amount', () => {
      const alloc = new CreditAllocation(makeProps({ remainingCredits: 1000 }));
      expect(alloc.hasCredits(1000)).toBe(true);
    });

    it('returns false when remaining credits are less than requested amount', () => {
      const alloc = new CreditAllocation(makeProps({ remainingCredits: 100 }));
      expect(alloc.hasCredits(500)).toBe(false);
    });

    it('returns true for zero amount when remaining is zero', () => {
      const alloc = new CreditAllocation(makeProps({ remainingCredits: 0 }));
      expect(alloc.hasCredits(0)).toBe(true);
    });
  });

  describe('deduct', () => {
    it('returns a new CreditAllocation with reduced remaining credits', () => {
      const alloc = new CreditAllocation(makeProps({ remainingCredits: 1000 }));
      const deducted = alloc.deduct(300);

      expect(deducted.remainingCredits).toBe(700);
    });

    it('does not mutate the original instance (immutable)', () => {
      const alloc = new CreditAllocation(makeProps({ remainingCredits: 1000 }));
      const deducted = alloc.deduct(300);

      expect(alloc.remainingCredits).toBe(1000);
      expect(deducted.remainingCredits).toBe(700);
    });

    it('preserves all other props on the new instance', () => {
      const props = makeProps();
      const alloc = new CreditAllocation(props);
      const deducted = alloc.deduct(100);

      expect(deducted.id).toBe(props.id);
      expect(deducted.userId).toBe(props.userId);
      expect(deducted.subscriptionId).toBe(props.subscriptionId);
      expect(deducted.totalCredits).toBe(props.totalCredits);
      expect(deducted.periodStart).toEqual(props.periodStart);
      expect(deducted.periodEnd).toEqual(props.periodEnd);
      expect(deducted.createdAt).toEqual(props.createdAt);
    });

    it('returns a distinct object (not the same reference)', () => {
      const alloc = new CreditAllocation(makeProps());
      const deducted = alloc.deduct(100);

      expect(deducted).not.toBe(alloc);
    });

    it('handles deducting zero credits', () => {
      const alloc = new CreditAllocation(makeProps({ remainingCredits: 5000 }));
      const deducted = alloc.deduct(0);

      expect(deducted.remainingCredits).toBe(5000);
    });

    it('allows deducting more than remaining (produces negative remaining)', () => {
      const alloc = new CreditAllocation(makeProps({ remainingCredits: 100 }));
      const deducted = alloc.deduct(500);

      expect(deducted.remainingCredits).toBe(-400);
    });
  });

  describe('isExpired', () => {
    it('returns false when periodEnd is in the future', () => {
      const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const alloc = new CreditAllocation(makeProps({ periodEnd: futureEnd }));

      expect(alloc.isExpired()).toBe(false);
    });

    it('returns true when periodEnd is in the past', () => {
      const pastEnd = new Date(Date.now() - 1000);
      const alloc = new CreditAllocation(makeProps({ periodEnd: pastEnd }));

      expect(alloc.isExpired()).toBe(true);
    });

    it('uses the provided now parameter instead of current time', () => {
      const periodEnd = new Date('2026-02-15');
      const alloc = new CreditAllocation(makeProps({ periodEnd }));

      const beforeExpiry = new Date('2026-02-14');
      const afterExpiry = new Date('2026-02-16');

      expect(alloc.isExpired(beforeExpiry)).toBe(false);
      expect(alloc.isExpired(afterExpiry)).toBe(true);
    });

    it('returns true when now is exactly equal to periodEnd (strict less-than)', () => {
      const periodEnd = new Date('2026-03-01T00:00:00.000Z');
      const alloc = new CreditAllocation(makeProps({ periodEnd }));

      // periodEnd.getTime() < now.getTime() is false when equal
      expect(alloc.isExpired(new Date('2026-03-01T00:00:00.000Z'))).toBe(false);
    });
  });

  describe('usagePercent', () => {
    it('returns 0 when no credits have been used', () => {
      const alloc = new CreditAllocation(
        makeProps({ totalCredits: 1000, remainingCredits: 1000 }),
      );
      expect(alloc.usagePercent).toBe(0);
    });

    it('returns 100 when all credits have been used', () => {
      const alloc = new CreditAllocation(
        makeProps({ totalCredits: 1000, remainingCredits: 0 }),
      );
      expect(alloc.usagePercent).toBe(100);
    });

    it('calculates correct percentage for partial usage', () => {
      const alloc = new CreditAllocation(
        makeProps({ totalCredits: 500000, remainingCredits: 350000 }),
      );
      // (500000 - 350000) / 500000 * 100 = 30
      expect(alloc.usagePercent).toBe(30);
    });

    it('rounds to the nearest integer', () => {
      const alloc = new CreditAllocation(
        makeProps({ totalCredits: 3, remainingCredits: 1 }),
      );
      // (3 - 1) / 3 * 100 = 66.666... -> rounds to 67
      expect(alloc.usagePercent).toBe(67);
    });

    it('returns 0 when totalCredits is 0 (edge case)', () => {
      const alloc = new CreditAllocation(
        makeProps({ totalCredits: 0, remainingCredits: 0 }),
      );
      expect(alloc.usagePercent).toBe(0);
    });
  });

  describe('toProps', () => {
    it('returns an object equal to the original props', () => {
      const props = makeProps();
      const alloc = new CreditAllocation(props);
      const exported = alloc.toProps();

      expect(exported).toEqual(props);
    });

    it('returns a different reference (shallow copy)', () => {
      const props = makeProps();
      const alloc = new CreditAllocation(props);
      const exported = alloc.toProps();

      expect(exported).not.toBe(props);
    });

    it('does not affect the entity when the returned copy is modified', () => {
      const alloc = new CreditAllocation(makeProps());
      const exported = alloc.toProps();

      exported.remainingCredits = 0;
      exported.userId = 'mutated-user';

      expect(alloc.remainingCredits).toBe(350000);
      expect(alloc.userId).toBe('user-1');
    });
  });
});
