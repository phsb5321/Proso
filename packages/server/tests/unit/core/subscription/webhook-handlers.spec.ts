// Unit tests for pure domain webhook handler functions
// Tests: handleSubscriptionCreated, handleSubscriptionUpdated,
//        handleSubscriptionCanceled, handleRenewal
// from src/core/subscription/subscription.service.ts

import {
  SubscriptionTier,
  SubscriptionStatus,
  TIER_CREDITS,
  ErrorCode,
  isOk,
  isErr,
} from '@voxpage/shared';
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionCanceled,
  handleRenewal,
  type WebhookDeps,
  type SubscriptionCreatedParams,
  type SubscriptionUpdatedParams,
  type SubscriptionCanceledParams,
  type RenewalParams,
} from '../../../../src/core/subscription/subscription.service';
import type { SubscriptionRecord } from '../../../../src/ports/subscription-repository.port';
import type { CreditAllocationRecord } from '../../../../src/ports/credit-repository.port';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockDeps(): WebhookDeps {
  return {
    subscriptionRepository: {
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findActiveByUserId: jest.fn(),
      findByPaddleId: jest.fn(),
      save: jest.fn().mockImplementation(
        (sub: SubscriptionRecord): Promise<SubscriptionRecord> =>
          Promise.resolve({ ...sub, id: sub.id || 'sub-gen-123' }),
      ),
      update: jest.fn().mockImplementation(
        (id: string, data: Partial<SubscriptionRecord>): Promise<SubscriptionRecord> =>
          Promise.resolve({
            id,
            userId: 'user-1',
            paddleSubscriptionId: 'paddle-sub-1',
            tier: SubscriptionTier.Pro,
            status: SubscriptionStatus.Active,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          } as SubscriptionRecord),
      ),
    } as unknown as WebhookDeps['subscriptionRepository'],
    creditRepository: {
      findCurrentAllocation: jest.fn(),
      deductCredits: jest.fn(),
      getAllocationHistory: jest.fn(),
      createAllocation: jest.fn().mockImplementation(
        (alloc: Omit<CreditAllocationRecord, 'id' | 'createdAt'>): Promise<CreditAllocationRecord> =>
          Promise.resolve({
            ...alloc,
            id: 'alloc-gen-123',
            createdAt: new Date(),
          } as CreditAllocationRecord),
      ),
    } as unknown as WebhookDeps['creditRepository'],
  };
}

function makeExistingSubscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  const now = new Date();
  return {
    id: 'sub-existing-1',
    userId: 'user-1',
    paddleSubscriptionId: 'paddle-sub-1',
    tier: SubscriptionTier.Pro,
    status: SubscriptionStatus.Active,
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const periodStart = new Date('2026-02-01T00:00:00Z');
const periodEnd = new Date('2026-03-01T00:00:00Z');

// ---------------------------------------------------------------------------
// handleSubscriptionCreated
// ---------------------------------------------------------------------------

describe('handleSubscriptionCreated', () => {
  let deps: WebhookDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('creates subscription with correct fields', async () => {
    const params: SubscriptionCreatedParams = {
      userId: 'user-42',
      paddleSubscriptionId: 'paddle-sub-99',
      tier: SubscriptionTier.Pro,
      periodStart,
      periodEnd,
    };

    const result = await handleSubscriptionCreated(params, deps);
    expect(isOk(result)).toBe(true);

    expect(deps.subscriptionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-42',
        paddleSubscriptionId: 'paddle-sub-99',
        tier: SubscriptionTier.Pro,
        status: SubscriptionStatus.Active,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      }),
    );
  });

  it('sets status to Active for new subscriptions', async () => {
    const params: SubscriptionCreatedParams = {
      userId: 'user-1',
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Pro,
      periodStart,
      periodEnd,
    };

    await handleSubscriptionCreated(params, deps);

    expect(deps.subscriptionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SubscriptionStatus.Active,
      }),
    );
  });

  it('allocates 500,000 credits for Pro tier', async () => {
    const params: SubscriptionCreatedParams = {
      userId: 'user-1',
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Pro,
      periodStart,
      periodEnd,
    };

    const result = await handleSubscriptionCreated(params, deps);
    expect(isOk(result)).toBe(true);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 500_000,
        remainingCredits: 500_000,
      }),
    );
  });

  it('allocates 2,000,000 credits for Enterprise tier', async () => {
    const params: SubscriptionCreatedParams = {
      userId: 'user-1',
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Enterprise,
      periodStart,
      periodEnd,
    };

    const result = await handleSubscriptionCreated(params, deps);
    expect(isOk(result)).toBe(true);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 2_000_000,
        remainingCredits: 2_000_000,
      }),
    );
  });

  it('allocates 0 credits for Free tier', async () => {
    const params: SubscriptionCreatedParams = {
      userId: 'user-1',
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Free,
      periodStart,
      periodEnd,
    };

    const result = await handleSubscriptionCreated(params, deps);
    expect(isOk(result)).toBe(true);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 0,
        remainingCredits: 0,
      }),
    );
  });

  it('returns Ok with both subscription and allocation', async () => {
    const params: SubscriptionCreatedParams = {
      userId: 'user-1',
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Pro,
      periodStart,
      periodEnd,
    };

    const result = await handleSubscriptionCreated(params, deps);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.subscription).toBeDefined();
    expect(result.value.allocation).toBeDefined();
    expect(result.value.allocation.totalCredits).toBe(TIER_CREDITS[SubscriptionTier.Pro]);
  });

  it('passes correct userId to credit allocation', async () => {
    const params: SubscriptionCreatedParams = {
      userId: 'user-abc',
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Pro,
      periodStart,
      periodEnd,
    };

    await handleSubscriptionCreated(params, deps);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-abc',
      }),
    );
  });

  it('passes period dates to credit allocation', async () => {
    const params: SubscriptionCreatedParams = {
      userId: 'user-1',
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Pro,
      periodStart,
      periodEnd,
    };

    await handleSubscriptionCreated(params, deps);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        periodStart,
        periodEnd,
      }),
    );
  });

  it('sets createdAt timestamp on subscription', async () => {
    const before = new Date();

    const params: SubscriptionCreatedParams = {
      userId: 'user-1',
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Pro,
      periodStart,
      periodEnd,
    };

    await handleSubscriptionCreated(params, deps);

    const savedArg = (deps.subscriptionRepository.save as jest.Mock).mock.calls[0][0];
    const createdAt = savedArg.createdAt as Date;
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(createdAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

// ---------------------------------------------------------------------------
// handleSubscriptionUpdated
// ---------------------------------------------------------------------------

describe('handleSubscriptionUpdated', () => {
  let deps: WebhookDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('updates tier, status, and period dates on existing subscription', async () => {
    const existing = makeExistingSubscription();
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: SubscriptionUpdatedParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Enterprise,
      status: SubscriptionStatus.Active,
      periodStart,
      periodEnd,
    };

    const result = await handleSubscriptionUpdated(params, deps);
    expect(isOk(result)).toBe(true);

    expect(deps.subscriptionRepository.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        tier: SubscriptionTier.Enterprise,
        status: SubscriptionStatus.Active,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      }),
    );
  });

  it('returns Err(SubscriptionNotFound) when paddle ID does not match', async () => {
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(null);

    const params: SubscriptionUpdatedParams = {
      paddleSubscriptionId: 'paddle-sub-unknown',
      tier: SubscriptionTier.Pro,
      status: SubscriptionStatus.Active,
      periodStart,
      periodEnd,
    };

    const result = await handleSubscriptionUpdated(params, deps);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error.code).toBe(ErrorCode.SubscriptionNotFound);
  });

  it('calls findByPaddleId with correct paddle subscription ID', async () => {
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(null);

    const params: SubscriptionUpdatedParams = {
      paddleSubscriptionId: 'paddle-sub-xyz',
      tier: SubscriptionTier.Pro,
      status: SubscriptionStatus.Active,
      periodStart,
      periodEnd,
    };

    await handleSubscriptionUpdated(params, deps);

    expect(deps.subscriptionRepository.findByPaddleId).toHaveBeenCalledWith('paddle-sub-xyz');
  });

  it('allocates new credits when tier changes', async () => {
    const existing = makeExistingSubscription({ tier: SubscriptionTier.Pro });
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: SubscriptionUpdatedParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Enterprise,
      status: SubscriptionStatus.Active,
      periodStart,
      periodEnd,
    };

    await handleSubscriptionUpdated(params, deps);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: TIER_CREDITS[SubscriptionTier.Enterprise],
        remainingCredits: TIER_CREDITS[SubscriptionTier.Enterprise],
      }),
    );
  });

  it('does not allocate credits when tier remains the same', async () => {
    const existing = makeExistingSubscription({ tier: SubscriptionTier.Pro });
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: SubscriptionUpdatedParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Pro,
      status: SubscriptionStatus.Active,
      periodStart,
      periodEnd,
    };

    await handleSubscriptionUpdated(params, deps);

    expect(deps.creditRepository.createAllocation).not.toHaveBeenCalled();
  });

  it('preserves userId when updating subscription', async () => {
    const existing = makeExistingSubscription({ userId: 'user-preserve-me' });
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: SubscriptionUpdatedParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      tier: SubscriptionTier.Pro,
      status: SubscriptionStatus.Active,
      periodStart,
      periodEnd,
    };

    await handleSubscriptionUpdated(params, deps);

    // update is called with existing.id but no userId in the update payload
    const updateCall = (deps.subscriptionRepository.update as jest.Mock).mock.calls[0];
    expect(updateCall[0]).toBe(existing.id);
    // The update data should NOT contain userId (it is not changed)
    expect(updateCall[1]).not.toHaveProperty('userId');
  });
});

// ---------------------------------------------------------------------------
// handleSubscriptionCanceled
// ---------------------------------------------------------------------------

describe('handleSubscriptionCanceled', () => {
  let deps: WebhookDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('sets status to Cancelled with cancelledAt timestamp', async () => {
    const existing = makeExistingSubscription();
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const before = new Date();

    const params: SubscriptionCanceledParams = {
      paddleSubscriptionId: 'paddle-sub-1',
    };

    const result = await handleSubscriptionCanceled(params, deps);
    expect(isOk(result)).toBe(true);

    expect(deps.subscriptionRepository.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        status: SubscriptionStatus.Cancelled,
      }),
    );

    const updateData = (deps.subscriptionRepository.update as jest.Mock).mock.calls[0][1];
    expect(updateData.cancelledAt).toBeInstanceOf(Date);
    expect(updateData.cancelledAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('does NOT revoke credits (INV-004)', async () => {
    const existing = makeExistingSubscription();
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: SubscriptionCanceledParams = {
      paddleSubscriptionId: 'paddle-sub-1',
    };

    await handleSubscriptionCanceled(params, deps);

    // No credit-related operations should be called
    expect(deps.creditRepository.createAllocation).not.toHaveBeenCalled();
    expect(deps.creditRepository.deductCredits).not.toHaveBeenCalled();
  });

  it('returns Err(SubscriptionNotFound) when paddle ID not found', async () => {
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(null);

    const params: SubscriptionCanceledParams = {
      paddleSubscriptionId: 'paddle-sub-missing',
    };

    const result = await handleSubscriptionCanceled(params, deps);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error.code).toBe(ErrorCode.SubscriptionNotFound);
  });

  it('includes paddle subscription ID in error message', async () => {
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(null);

    const params: SubscriptionCanceledParams = {
      paddleSubscriptionId: 'paddle-sub-specific-id',
    };

    const result = await handleSubscriptionCanceled(params, deps);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error.message).toContain('paddle-sub-specific-id');
  });
});

// ---------------------------------------------------------------------------
// handleRenewal
// ---------------------------------------------------------------------------

describe('handleRenewal', () => {
  let deps: WebhookDeps;

  beforeEach(() => {
    deps = createMockDeps();
  });

  it('updates period dates and sets status to Active', async () => {
    const existing = makeExistingSubscription();
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: RenewalParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      periodStart,
      periodEnd,
    };

    const result = await handleRenewal(params, deps);
    expect(isOk(result)).toBe(true);

    expect(deps.subscriptionRepository.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        status: SubscriptionStatus.Active,
      }),
    );
  });

  it('creates new credit allocation for new period', async () => {
    const existing = makeExistingSubscription({ tier: SubscriptionTier.Pro });
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: RenewalParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      periodStart,
      periodEnd,
    };

    const result = await handleRenewal(params, deps);
    expect(isOk(result)).toBe(true);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: existing.userId,
        subscriptionId: existing.id,
        periodStart,
        periodEnd,
      }),
    );
  });

  it('allocates correct credits based on subscription tier (Pro)', async () => {
    const existing = makeExistingSubscription({ tier: SubscriptionTier.Pro });
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: RenewalParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      periodStart,
      periodEnd,
    };

    await handleRenewal(params, deps);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 500_000,
        remainingCredits: 500_000,
      }),
    );
  });

  it('allocates correct credits based on subscription tier (Enterprise)', async () => {
    const existing = makeExistingSubscription({ tier: SubscriptionTier.Enterprise });
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: RenewalParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      periodStart,
      periodEnd,
    };

    await handleRenewal(params, deps);

    expect(deps.creditRepository.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCredits: 2_000_000,
        remainingCredits: 2_000_000,
      }),
    );
  });

  it('returns Err(SubscriptionNotFound) when paddle ID not found', async () => {
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(null);

    const params: RenewalParams = {
      paddleSubscriptionId: 'paddle-sub-gone',
      periodStart,
      periodEnd,
    };

    const result = await handleRenewal(params, deps);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;

    expect(result.error.code).toBe(ErrorCode.SubscriptionNotFound);
  });

  it('returns Ok with both subscription and allocation on success', async () => {
    const existing = makeExistingSubscription({ tier: SubscriptionTier.Pro });
    (deps.subscriptionRepository.findByPaddleId as jest.Mock).mockResolvedValue(existing);

    const params: RenewalParams = {
      paddleSubscriptionId: 'paddle-sub-1',
      periodStart,
      periodEnd,
    };

    const result = await handleRenewal(params, deps);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.subscription).toBeDefined();
    expect(result.value.allocation).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: tier credit amounts
// ---------------------------------------------------------------------------

describe('Tier credit allocations (TIER_CREDITS consistency)', () => {
  it('Free tier allocates 0 credits', () => {
    expect(TIER_CREDITS[SubscriptionTier.Free]).toBe(0);
  });

  it('Pro tier allocates 500,000 credits', () => {
    expect(TIER_CREDITS[SubscriptionTier.Pro]).toBe(500_000);
  });

  it('Enterprise tier allocates 2,000,000 credits', () => {
    expect(TIER_CREDITS[SubscriptionTier.Enterprise]).toBe(2_000_000);
  });
});
