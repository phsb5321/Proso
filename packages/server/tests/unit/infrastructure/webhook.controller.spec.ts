// Unit tests for WebhookController
// Tests HTTP boundary logic: event routing, idempotency, subscription CRUD,
// credit allocation, and unknown event handling.

import {
  SubscriptionTier,
  SubscriptionStatus,
  TIER_CREDITS,
} from '@voxpage/shared';
import { WebhookController } from '../../../src/infrastructure/controllers/webhook.controller';
import type { WebhookRequest } from '../../../src/infrastructure/guards/paddle-webhook.guard';
import type { SubscriptionRecord } from '../../../src/ports/subscription-repository.port';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockIdempotencyService() {
  return {
    isProcessed: jest.fn().mockReturnValue(false),
    markProcessed: jest.fn(),
    size: 0,
  };
}

function createMockSubscriptionRepo() {
  return {
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findActiveByUserId: jest.fn(),
    findByPaddleId: jest.fn(),
    save: jest.fn().mockImplementation(
      (sub: SubscriptionRecord) => Promise.resolve({ ...sub, id: sub.id || 'sub-created-1' }),
    ),
    update: jest.fn().mockImplementation(
      (id: string, data: Partial<SubscriptionRecord>) =>
        Promise.resolve({ id, ...data } as SubscriptionRecord),
    ),
  };
}

function createMockCreditRepo() {
  return {
    findCurrentAllocation: jest.fn(),
    deductCredits: jest.fn(),
    getAllocationHistory: jest.fn(),
    createAllocation: jest.fn().mockImplementation(
      (alloc: Record<string, unknown>) =>
        Promise.resolve({ ...alloc, id: 'alloc-1', createdAt: new Date() }),
    ),
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

/**
 * Build a mock WebhookRequest with the given event type and data.
 */
function createMockRequest(
  eventType: string,
  data: Record<string, unknown> = {},
  eventId?: string,
): WebhookRequest {
  return {
    webhookEvent: {
      eventType,
      eventId: eventId ?? `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      occurredAt: new Date(),
      data,
    },
  } as unknown as WebhookRequest;
}

/**
 * Build Paddle subscription.created event data.
 */
function makeCreatedEventData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'paddle-sub-new',
    custom_data: { user_id: 'user-new', tier: SubscriptionTier.Pro },
    current_billing_period: {
      starts_at: '2026-02-01T00:00:00Z',
      ends_at: '2026-03-01T00:00:00Z',
    },
    ...overrides,
  };
}

/**
 * Build Paddle subscription.updated event data.
 */
function makeUpdatedEventData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'paddle-sub-1',
    status: 'active',
    custom_data: { tier: SubscriptionTier.Enterprise },
    current_billing_period: {
      starts_at: '2026-03-01T00:00:00Z',
      ends_at: '2026-04-01T00:00:00Z',
    },
    ...overrides,
  };
}

/**
 * Build Paddle subscription.canceled event data.
 */
function makeCanceledEventData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'paddle-sub-1',
    ...overrides,
  };
}

/**
 * Build Paddle transaction.completed event data (renewal).
 */
function makeTransactionCompletedData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subscription_id: 'paddle-sub-1',
    billing_period: {
      starts_at: '2026-03-01T00:00:00Z',
      ends_at: '2026-04-01T00:00:00Z',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookController', () => {
  let controller: WebhookController;
  let idempotencyService: ReturnType<typeof createMockIdempotencyService>;
  let subscriptionRepo: ReturnType<typeof createMockSubscriptionRepo>;
  let creditRepo: ReturnType<typeof createMockCreditRepo>;

  beforeEach(() => {
    idempotencyService = createMockIdempotencyService();
    subscriptionRepo = createMockSubscriptionRepo();
    creditRepo = createMockCreditRepo();

    controller = new WebhookController(
      idempotencyService as any,
      subscriptionRepo as any,
      creditRepo as any,
    );
  });

  // ─── General response ─────────────────────────────────────────────

  it('returns { received: true } for subscription.created event', async () => {
    const req = createMockRequest('subscription.created', makeCreatedEventData());
    const result = await controller.handlePaddleWebhook(req);
    expect(result).toEqual({ received: true });
  });

  it('returns { received: true } for unhandled event types', async () => {
    const req = createMockRequest('some.unknown.event', {});
    const result = await controller.handlePaddleWebhook(req);
    expect(result).toEqual({ received: true });
  });

  // ─── Idempotency ──────────────────────────────────────────────────

  it('returns { received: true } for duplicate event (idempotency)', async () => {
    idempotencyService.isProcessed.mockReturnValue(true);

    const req = createMockRequest('subscription.created', makeCreatedEventData(), 'evt_dup');
    const result = await controller.handlePaddleWebhook(req);

    expect(result).toEqual({ received: true });
    // Should NOT have called save since event was duplicate
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('marks event as processed after handling', async () => {
    const eventId = 'evt_mark_me';
    const req = createMockRequest('subscription.created', makeCreatedEventData(), eventId);

    await controller.handlePaddleWebhook(req);

    expect(idempotencyService.markProcessed).toHaveBeenCalledWith(eventId);
  });

  it('does not mark event as processed when idempotency check returns true', async () => {
    idempotencyService.isProcessed.mockReturnValue(true);

    const req = createMockRequest('subscription.created', makeCreatedEventData(), 'evt_already');
    await controller.handlePaddleWebhook(req);

    // When already processed, we return early BEFORE markProcessed
    expect(idempotencyService.markProcessed).not.toHaveBeenCalled();
  });

  // ─── subscription.created ─────────────────────────────────────────

  it('creates subscription record on subscription.created', async () => {
    const data = makeCreatedEventData();
    const req = createMockRequest('subscription.created', data);

    await controller.handlePaddleWebhook(req);

    expect(subscriptionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-new',
        paddleSubscriptionId: 'paddle-sub-new',
        tier: SubscriptionTier.Pro,
        status: SubscriptionStatus.Active,
      }),
    );
  });

  it('allocates credits on subscription.created', async () => {
    const data = makeCreatedEventData();
    const req = createMockRequest('subscription.created', data);

    await controller.handlePaddleWebhook(req);

    expect(creditRepo.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-new',
        totalCredits: TIER_CREDITS[SubscriptionTier.Pro],
        remainingCredits: TIER_CREDITS[SubscriptionTier.Pro],
      }),
    );
  });

  it('does not allocate credits for Free tier on subscription.created', async () => {
    const data = makeCreatedEventData({
      custom_data: { user_id: 'user-free', tier: SubscriptionTier.Free },
    });
    const req = createMockRequest('subscription.created', data);

    await controller.handlePaddleWebhook(req);

    // Free tier has 0 credits, so createAllocation should not be called
    expect(creditRepo.createAllocation).not.toHaveBeenCalled();
  });

  // ─── subscription.updated ─────────────────────────────────────────

  it('updates subscription on subscription.updated', async () => {
    const existing = makeExistingSubscription();
    subscriptionRepo.findByPaddleId.mockResolvedValue(existing);

    const data = makeUpdatedEventData();
    const req = createMockRequest('subscription.updated', data);

    await controller.handlePaddleWebhook(req);

    expect(subscriptionRepo.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        tier: SubscriptionTier.Enterprise,
        status: SubscriptionStatus.Active,
      }),
    );
  });

  it('logs warning for unknown paddle subscription IDs on subscription.updated', async () => {
    subscriptionRepo.findByPaddleId.mockResolvedValue(null);

    // Spy on the logger (it's a private property, but we can check that no error is thrown)
    const data = makeUpdatedEventData({ id: 'paddle-sub-unknown' });
    const req = createMockRequest('subscription.updated', data);

    // Should not throw even when subscription is not found
    const result = await controller.handlePaddleWebhook(req);
    expect(result).toEqual({ received: true });

    // update should NOT have been called since subscription was not found
    expect(subscriptionRepo.update).not.toHaveBeenCalled();
  });

  // ─── subscription.canceled ────────────────────────────────────────

  it('sets cancelled status on subscription.canceled (INV-004)', async () => {
    const existing = makeExistingSubscription();
    subscriptionRepo.findByPaddleId.mockResolvedValue(existing);

    const data = makeCanceledEventData();
    const req = createMockRequest('subscription.canceled', data);

    await controller.handlePaddleWebhook(req);

    expect(subscriptionRepo.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        status: SubscriptionStatus.Cancelled,
      }),
    );

    // INV-004: credits should NOT be revoked
    expect(creditRepo.createAllocation).not.toHaveBeenCalled();
    expect(creditRepo.deductCredits).not.toHaveBeenCalled();
  });

  it('sets cancelledAt timestamp on subscription.canceled', async () => {
    const existing = makeExistingSubscription();
    subscriptionRepo.findByPaddleId.mockResolvedValue(existing);

    const before = new Date();
    const req = createMockRequest('subscription.canceled', makeCanceledEventData());

    await controller.handlePaddleWebhook(req);

    const updateData = subscriptionRepo.update.mock.calls[0][1];
    expect(updateData.cancelledAt).toBeInstanceOf(Date);
    expect(updateData.cancelledAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  // ─── transaction.completed (renewal) ──────────────────────────────

  it('allocates new credits on transaction.completed (renewal)', async () => {
    const existing = makeExistingSubscription({ tier: SubscriptionTier.Pro });
    subscriptionRepo.findByPaddleId.mockResolvedValue(existing);

    const data = makeTransactionCompletedData();
    const req = createMockRequest('transaction.completed', data);

    await controller.handlePaddleWebhook(req);

    expect(creditRepo.createAllocation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: existing.userId,
        subscriptionId: existing.id,
        totalCredits: TIER_CREDITS[SubscriptionTier.Pro],
        remainingCredits: TIER_CREDITS[SubscriptionTier.Pro],
      }),
    );
  });

  it('updates subscription period and status on transaction.completed', async () => {
    const existing = makeExistingSubscription({
      status: SubscriptionStatus.PastDue,
    });
    subscriptionRepo.findByPaddleId.mockResolvedValue(existing);

    const data = makeTransactionCompletedData();
    const req = createMockRequest('transaction.completed', data);

    await controller.handlePaddleWebhook(req);

    expect(subscriptionRepo.update).toHaveBeenCalledWith(
      existing.id,
      expect.objectContaining({
        status: SubscriptionStatus.Active,
      }),
    );
  });

  it('skips transaction.completed without subscription_id (one-time purchase)', async () => {
    const data = makeTransactionCompletedData({ subscription_id: undefined });
    // Remove subscription_id entirely
    delete data['subscription_id'];
    const req = createMockRequest('transaction.completed', data);

    await controller.handlePaddleWebhook(req);

    // No subscription or credit operations
    expect(subscriptionRepo.findByPaddleId).not.toHaveBeenCalled();
    expect(subscriptionRepo.update).not.toHaveBeenCalled();
    expect(creditRepo.createAllocation).not.toHaveBeenCalled();
  });

  it('handles unknown paddle subscription on transaction.completed gracefully', async () => {
    subscriptionRepo.findByPaddleId.mockResolvedValue(null);

    const data = makeTransactionCompletedData({ subscription_id: 'paddle-unknown' });
    const req = createMockRequest('transaction.completed', data);

    const result = await controller.handlePaddleWebhook(req);
    expect(result).toEqual({ received: true });

    expect(subscriptionRepo.update).not.toHaveBeenCalled();
    expect(creditRepo.createAllocation).not.toHaveBeenCalled();
  });

  // ─── Error handling ───────────────────────────────────────────────

  it('still marks event as processed even when handler throws', async () => {
    subscriptionRepo.save.mockRejectedValue(new Error('Database connection lost'));

    const eventId = 'evt_error_case';
    const req = createMockRequest('subscription.created', makeCreatedEventData(), eventId);

    const result = await controller.handlePaddleWebhook(req);

    // Should not propagate the error
    expect(result).toEqual({ received: true });
    // But should still mark as processed (avoid infinite retries)
    expect(idempotencyService.markProcessed).toHaveBeenCalledWith(eventId);
  });
});
