/**
 * Contract tests for PrismaSubscriptionRepository (T090)
 *
 * Tests the Prisma adapter against a real PostgreSQL database
 * via testcontainers. Verifies all SubscriptionRepositoryPort
 * methods behave correctly with real database operations.
 */
import { PrismaSubscriptionRepository } from '../../src/adapters/persistence/prisma-subscription.repository';
import type { PrismaService } from '../../src/infrastructure/modules/prisma.module';
import { CLAIM_HASH, TRANSACTION_ID } from '../helpers/license-fixtures';
import { createTestSubscription, createTestUser } from '../helpers/test-fixtures';
import {
  cleanupTestData,
  createTestPrismaService,
  teardownTestPrisma,
} from '../helpers/test-prisma';

describe('PrismaSubscriptionRepository (contract)', () => {
  let prisma: PrismaService;
  let repo: PrismaSubscriptionRepository;

  beforeAll(async () => {
    prisma = await createTestPrismaService();
    repo = new PrismaSubscriptionRepository(prisma);
  }, 60_000); // Container startup can take up to 60s

  afterEach(async () => {
    await cleanupTestData(prisma);
  });

  afterAll(async () => {
    await teardownTestPrisma();
  });

  describe('save', () => {
    it('should create a subscription and return it with generated timestamps', async () => {
      const user = await createTestUser(prisma);
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const result = await repo.save({
        id: '11111111-1111-1111-1111-111111111111',
        userId: user.id,
        paddleSubscriptionId: 'paddle-sub-001',
        paddleTransactionId: TRANSACTION_ID,
        licenseClaimHash: CLAIM_HASH,
        tier: 'pro',
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        createdAt: now,
        updatedAt: now,
      });

      expect(result.id).toBe('11111111-1111-1111-1111-111111111111');
      expect(result.userId).toBe(user.id);
      expect(result.tier).toBe('pro');
      expect(result.status).toBe('active');
      expect(result.paddleSubscriptionId).toBe('paddle-sub-001');
      expect(result.paddleTransactionId).toBe(TRANSACTION_ID);
      expect(result.licenseClaimHash).toBe(CLAIM_HASH);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should reject save with non-existent userId (FK violation)', async () => {
      const now = new Date();
      await expect(
        repo.save({
          id: '22222222-2222-2222-2222-222222222222',
          userId: 'non-existent-user',
          tier: 'pro',
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 86400000),
          createdAt: now,
          updatedAt: now,
        }),
      ).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should return subscription by id', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id, {
        id: '33333333-3333-3333-3333-333333333333',
        tier: 'enterprise',
      });

      const found = await repo.findById(sub.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(sub.id);
      expect(found!.tier).toBe('enterprise');
      expect(found!.userId).toBe(user.id);
    });

    it('should return null for non-existent id', async () => {
      const found = await repo.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should return the most recent subscription for a user', async () => {
      const user = await createTestUser(prisma);

      // Create an older subscription
      await createTestSubscription(prisma, user.id, {
        tier: 'free',
        status: 'expired',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-02-01'),
      });

      // Create a newer subscription (slight delay to ensure different createdAt)
      const newer = await createTestSubscription(prisma, user.id, {
        tier: 'pro',
        status: 'active',
      });

      const found = await repo.findByUserId(user.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(newer.id);
      expect(found!.tier).toBe('pro');
    });

    it('should return null when user has no subscriptions', async () => {
      const user = await createTestUser(prisma);
      const found = await repo.findByUserId(user.id);
      expect(found).toBeNull();
    });
  });

  describe('findByPaddleId', () => {
    it('should return subscription by Paddle subscription id', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id, {
        paddleSubscriptionId: 'paddle-unique-123',
      });

      const found = await repo.findByPaddleId('paddle-unique-123');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(sub.id);
      expect(found!.paddleSubscriptionId).toBe('paddle-unique-123');
    });

    it('should return null for non-existent Paddle id', async () => {
      const found = await repo.findByPaddleId('paddle-non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByPaddleTransactionId', () => {
    it('returns the subscription and claim hash by its routing transaction id', async () => {
      const user = await createTestUser(prisma);
      await repo.save({
        id: '55555555-5555-5555-5555-555555555555',
        userId: user.id,
        paddleSubscriptionId: 'paddle-sub-transaction',
        paddleTransactionId: TRANSACTION_ID,
        licenseClaimHash: CLAIM_HASH,
        tier: 'pro',
        status: 'active',
        currentPeriodStart: new Date('2026-08-12T18:00:00.000Z'),
        currentPeriodEnd: new Date('2026-09-12T18:00:00.000Z'),
        createdAt: new Date('2026-08-12T18:00:00.000Z'),
        updatedAt: new Date('2026-08-12T18:00:00.000Z'),
      });

      const found = await repo.findByPaddleTransactionId(TRANSACTION_ID);

      expect(found).toMatchObject({
        paddleTransactionId: TRANSACTION_ID,
        licenseClaimHash: CLAIM_HASH,
      });
    });
  });

  describe('findActiveByUserId', () => {
    it('should return active subscription', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id, {
        status: 'active',
        tier: 'pro',
      });

      const found = await repo.findActiveByUserId(user.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(sub.id);
      expect(found!.status).toBe('active');
    });

    it('should return trialing subscription as active', async () => {
      const user = await createTestUser(prisma);
      await createTestSubscription(prisma, user.id, { status: 'trialing' });

      const found = await repo.findActiveByUserId(user.id);
      expect(found).not.toBeNull();
      expect(found!.status).toBe('trialing');
    });

    it('should return past_due subscription as active', async () => {
      const user = await createTestUser(prisma);
      await createTestSubscription(prisma, user.id, { status: 'past_due' });

      const found = await repo.findActiveByUserId(user.id);
      expect(found).not.toBeNull();
      expect(found!.status).toBe('past_due');
    });

    it('should return cancelled subscription as active (grace period)', async () => {
      const user = await createTestUser(prisma);
      await createTestSubscription(prisma, user.id, {
        status: 'cancelled',
        cancelledAt: new Date(),
      });

      const found = await repo.findActiveByUserId(user.id);
      expect(found).not.toBeNull();
      expect(found!.status).toBe('cancelled');
    });

    it('should NOT return expired subscription', async () => {
      const user = await createTestUser(prisma);
      await createTestSubscription(prisma, user.id, { status: 'expired' });

      const found = await repo.findActiveByUserId(user.id);
      expect(found).toBeNull();
    });

    it('should return null when user has no subscriptions', async () => {
      const user = await createTestUser(prisma);
      const found = await repo.findActiveByUserId(user.id);
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update subscription tier', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id, { tier: 'pro' });

      const updated = await repo.update(sub.id, { tier: 'enterprise' });
      expect(updated.tier).toBe('enterprise');
      expect(updated.id).toBe(sub.id);
    });

    it('should update subscription status', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id, { status: 'active' });

      const updated = await repo.update(sub.id, {
        status: 'cancelled',
        cancelledAt: new Date(),
      });
      expect(updated.status).toBe('cancelled');
      expect(updated.cancelledAt).toBeInstanceOf(Date);
    });

    it('should update period dates', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const newStart = new Date('2026-03-01');
      const newEnd = new Date('2026-04-01');
      const updated = await repo.update(sub.id, {
        currentPeriodStart: newStart,
        currentPeriodEnd: newEnd,
      });
      expect(updated.currentPeriodStart.getTime()).toBe(newStart.getTime());
      expect(updated.currentPeriodEnd.getTime()).toBe(newEnd.getTime());
    });

    it('should only update provided fields (partial update)', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id, {
        tier: 'pro',
        status: 'active',
      });

      // Only update status, tier should remain 'pro'
      const updated = await repo.update(sub.id, { status: 'past_due' });
      expect(updated.status).toBe('past_due');
      expect(updated.tier).toBe('pro');
    });

    it('should throw for non-existent subscription', async () => {
      await expect(repo.update('non-existent-id', { status: 'cancelled' })).rejects.toThrow();
    });
  });

  describe('record mapping', () => {
    it('should map paddleSubscriptionId to undefined when empty string', async () => {
      const user = await createTestUser(prisma);
      // save() maps undefined paddleSubscriptionId to empty string
      const saved = await repo.save({
        id: '44444444-4444-4444-4444-444444444444',
        userId: user.id,
        tier: 'free',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // The toRecord method maps empty string back to undefined
      expect(saved.paddleSubscriptionId).toBeUndefined();
    });

    it('should preserve cancelledAt as undefined when null', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id, {
        cancelledAt: null,
      });

      const found = await repo.findById(sub.id);
      expect(found!.cancelledAt).toBeUndefined();
    });
  });
});
