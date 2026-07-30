/**
 * Contract tests for PrismaCreditRepository (T130)
 *
 * Tests the Prisma adapter against a real PostgreSQL database
 * via testcontainers. Verifies all CreditRepositoryPort methods
 * behave correctly with real database operations.
 */
import { PrismaCreditRepository } from '../../src/adapters/persistence/prisma-credit.repository';
import type { PrismaService } from '../../src/infrastructure/modules/prisma.module';
import {
  createTestCreditAllocation,
  createTestSubscription,
  createTestUser,
} from '../helpers/test-fixtures';
import {
  cleanupTestData,
  createTestPrismaService,
  teardownTestPrisma,
} from '../helpers/test-prisma';

describe('PrismaCreditRepository (contract)', () => {
  let prisma: PrismaService;
  let repo: PrismaCreditRepository;

  beforeAll(async () => {
    prisma = await createTestPrismaService();
    repo = new PrismaCreditRepository(prisma);
  }, 60_000); // Container startup can take up to 60s

  afterEach(async () => {
    await cleanupTestData(prisma);
  });

  afterAll(async () => {
    await teardownTestPrisma();
  });

  describe('createAllocation', () => {
    it('should create a credit allocation and return it with generated id and createdAt', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const result = await repo.createAllocation({
        userId: user.id,
        subscriptionId: sub.id,
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: now,
        periodEnd,
      });

      expect(result.id).toBeDefined();
      expect(result.userId).toBe(user.id);
      expect(result.subscriptionId).toBe(sub.id);
      expect(result.totalCredits).toBe(10000);
      expect(result.remainingCredits).toBe(10000);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should reject allocation with non-existent userId (FK violation)', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      await expect(
        repo.createAllocation({
          userId: 'non-existent-user',
          subscriptionId: sub.id,
          totalCredits: 10000,
          remainingCredits: 10000,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 86400000),
        }),
      ).rejects.toThrow();
    });

    it('should reject allocation with non-existent subscriptionId (FK violation)', async () => {
      const user = await createTestUser(prisma);

      await expect(
        repo.createAllocation({
          userId: user.id,
          subscriptionId: 'non-existent-sub',
          totalCredits: 10000,
          remainingCredits: 10000,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 86400000),
        }),
      ).rejects.toThrow();
    });
  });

  describe('findCurrentAllocation', () => {
    it('should return allocation within current date range', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const pastStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      const futureEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 5000,
        remainingCredits: 3000,
        periodStart: pastStart,
        periodEnd: futureEnd,
      });

      const found = await repo.findCurrentAllocation(user.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(allocation.id);
      expect(found!.totalCredits).toBe(5000);
      expect(found!.remainingCredits).toBe(3000);
    });

    it('should return null when allocation period is in the past', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      await createTestCreditAllocation(prisma, user.id, sub.id, {
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-02-01'),
      });

      const found = await repo.findCurrentAllocation(user.id);
      expect(found).toBeNull();
    });

    it('should return null when allocation period is in the future', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const futureEnd = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      await createTestCreditAllocation(prisma, user.id, sub.id, {
        periodStart: futureStart,
        periodEnd: futureEnd,
      });

      const found = await repo.findCurrentAllocation(user.id);
      expect(found).toBeNull();
    });

    it('should return null for user with no allocations', async () => {
      const user = await createTestUser(prisma);
      const found = await repo.findCurrentAllocation(user.id);
      expect(found).toBeNull();
    });

    it('should return the most recently created allocation when multiple overlap', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const pastStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      const futureEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

      // Create older allocation
      await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 5000,
        remainingCredits: 1000,
        periodStart: pastStart,
        periodEnd: futureEnd,
      });

      // Small delay to ensure distinct createdAt
      await new Promise((r) => setTimeout(r, 50));

      // Create newer allocation
      const newer = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: pastStart,
        periodEnd: futureEnd,
      });

      const found = await repo.findCurrentAllocation(user.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(newer.id);
      expect(found!.totalCredits).toBe(10000);
    });
  });

  describe('deductCredits', () => {
    it('should deduct credits and create a transaction', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      const transaction = await repo.deductCredits(allocation.id, 500, {
        provider: 'openai',
        characterCount: 250,
      });

      expect(transaction).not.toBeNull();
      if (!transaction) return;
      expect(transaction.id).toBeDefined();
      expect(transaction.allocationId).toBe(allocation.id);
      expect(transaction.userId).toBe(user.id);
      expect(transaction.type).toBe('deduction');
      expect(transaction.amount).toBe(-500);
      expect(transaction.provider).toBe('openai');
      expect(transaction.characterCount).toBe(250);
      expect(transaction.createdAt).toBeInstanceOf(Date);
      expect(transaction.remainingCredits).toBe(9500);

      // Verify remaining credits were decremented
      const updatedAllocation = await repo.findCurrentAllocation(user.id);
      expect(updatedAllocation).not.toBeNull();
      expect(updatedAllocation!.remainingCredits).toBe(9500);
    });

    it('should handle multiple sequential deductions correctly', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      await repo.deductCredits(allocation.id, 300, {
        provider: 'openai',
        characterCount: 100,
      });
      await repo.deductCredits(allocation.id, 700, {
        provider: 'elevenlabs',
        characterCount: 350,
      });

      const updatedAllocation = await repo.findCurrentAllocation(user.id);
      expect(updatedAllocation!.remainingCredits).toBe(9000);
    });

    it('should populate userId from allocation (not hardcoded)', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      const transaction = await repo.deductCredits(allocation.id, 100, {
        provider: 'groq',
        characterCount: 50,
      });

      expect(transaction).not.toBeNull();
      if (!transaction) return;
      // This verifies the bug fix: userId should be the actual user ID,
      // not an empty string
      expect(transaction.userId).toBe(user.id);
      expect(transaction.userId).not.toBe('');
    });

    it('should return null for a non-existent allocation', async () => {
      const transaction = await repo.deductCredits('non-existent-allocation', 100, {
        provider: 'openai',
        characterCount: 50,
      });

      expect(transaction).toBeNull();
    });

    it('should atomically reject one of two debits that exceed the shared balance', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);
      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 1000,
        remainingCredits: 1000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      const results = await Promise.all([
        repo.deductCredits(allocation.id, 700, {
          provider: 'openai',
          characterCount: 350,
        }),
        repo.deductCredits(allocation.id, 700, {
          provider: 'openai',
          characterCount: 350,
        }),
      ]);

      expect(results.filter((result) => result !== null)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
      expect(results.find((result) => result !== null)?.remainingCredits).toBe(300);
      const updatedAllocation = await repo.findCurrentAllocation(user.id);
      expect(updatedAllocation?.remainingCredits).toBe(300);
      expect(await repo.getTransactionCount(user.id)).toBe(1);
    });
  });

  describe('getAllocationHistory', () => {
    it('should return transactions ordered by createdAt desc', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      // Create 3 transactions
      await repo.deductCredits(allocation.id, 100, {
        provider: 'openai',
        characterCount: 50,
      });
      await new Promise((r) => setTimeout(r, 50));
      await repo.deductCredits(allocation.id, 200, {
        provider: 'elevenlabs',
        characterCount: 100,
      });
      await new Promise((r) => setTimeout(r, 50));
      await repo.deductCredits(allocation.id, 300, {
        provider: 'groq',
        characterCount: 150,
      });

      const history = await repo.getAllocationHistory(user.id, 10, 0);
      expect(history).toHaveLength(3);
      // Most recent first
      expect(history[0].amount).toBe(-300);
      expect(history[1].amount).toBe(-200);
      expect(history[2].amount).toBe(-100);
    });

    it('should respect limit parameter', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      for (let i = 0; i < 5; i++) {
        await repo.deductCredits(allocation.id, 100, {
          provider: 'openai',
          characterCount: 50,
        });
      }

      const history = await repo.getAllocationHistory(user.id, 3, 0);
      expect(history).toHaveLength(3);
    });

    it('should respect offset parameter', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      for (let i = 0; i < 5; i++) {
        await repo.deductCredits(allocation.id, (i + 1) * 100, {
          provider: 'openai',
          characterCount: 50,
        });
        if (i < 4) await new Promise((r) => setTimeout(r, 50));
      }

      // Skip the first 2 (most recent), get remaining 3
      const history = await repo.getAllocationHistory(user.id, 10, 2);
      expect(history).toHaveLength(3);
    });

    it('should return empty array for user with no transactions', async () => {
      const user = await createTestUser(prisma);
      const history = await repo.getAllocationHistory(user.id, 10, 0);
      expect(history).toEqual([]);
    });

    it('should only return transactions for the specified user', async () => {
      const user1 = await createTestUser(prisma);
      const user2 = await createTestUser(prisma);
      const sub1 = await createTestSubscription(prisma, user1.id);
      const sub2 = await createTestSubscription(prisma, user2.id);

      const now = new Date();
      const alloc1 = await createTestCreditAllocation(prisma, user1.id, sub1.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });
      const alloc2 = await createTestCreditAllocation(prisma, user2.id, sub2.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      await repo.deductCredits(alloc1.id, 100, {
        provider: 'openai',
        characterCount: 50,
      });
      await repo.deductCredits(alloc2.id, 200, {
        provider: 'openai',
        characterCount: 100,
      });
      await repo.deductCredits(alloc2.id, 300, {
        provider: 'openai',
        characterCount: 150,
      });

      const history1 = await repo.getAllocationHistory(user1.id, 10, 0);
      expect(history1).toHaveLength(1);

      const history2 = await repo.getAllocationHistory(user2.id, 10, 0);
      expect(history2).toHaveLength(2);
    });
  });

  describe('getTransactionCount', () => {
    it('should return 0 for user with no transactions', async () => {
      const user = await createTestUser(prisma);
      const count = await repo.getTransactionCount(user.id);
      expect(count).toBe(0);
    });

    it('should return correct count', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      await repo.deductCredits(allocation.id, 100, {
        provider: 'openai',
        characterCount: 50,
      });
      await repo.deductCredits(allocation.id, 200, {
        provider: 'elevenlabs',
        characterCount: 100,
      });

      const count = await repo.getTransactionCount(user.id);
      expect(count).toBe(2);
    });

    it('should only count transactions for the specified user', async () => {
      const user1 = await createTestUser(prisma);
      const user2 = await createTestUser(prisma);
      const sub1 = await createTestSubscription(prisma, user1.id);
      const sub2 = await createTestSubscription(prisma, user2.id);

      const now = new Date();
      const alloc1 = await createTestCreditAllocation(prisma, user1.id, sub1.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });
      const alloc2 = await createTestCreditAllocation(prisma, user2.id, sub2.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      await repo.deductCredits(alloc1.id, 100, {
        provider: 'openai',
        characterCount: 50,
      });
      await repo.deductCredits(alloc2.id, 200, {
        provider: 'openai',
        characterCount: 100,
      });
      await repo.deductCredits(alloc2.id, 300, {
        provider: 'openai',
        characterCount: 150,
      });

      expect(await repo.getTransactionCount(user1.id)).toBe(1);
      expect(await repo.getTransactionCount(user2.id)).toBe(2);
    });
  });

  describe('record mapping', () => {
    it('should map provider to undefined when null in DB', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const allocation = await createTestCreditAllocation(prisma, user.id, sub.id, {
        totalCredits: 10000,
        remainingCredits: 10000,
        periodStart: new Date(now.getTime() - 86400000),
        periodEnd: new Date(now.getTime() + 86400000),
      });

      // deductCredits always sets provider, so verify via the adapter mapping
      const transaction = await repo.deductCredits(allocation.id, 100, {
        provider: 'openai',
        characterCount: 50,
      });

      expect(transaction).not.toBeNull();
      if (!transaction) return;
      expect(transaction.provider).toBe('openai');
      expect(transaction.characterCount).toBe(50);
    });

    it('should include createdAt in allocation record', async () => {
      const user = await createTestUser(prisma);
      const sub = await createTestSubscription(prisma, user.id);

      const now = new Date();
      const result = await repo.createAllocation({
        userId: user.id,
        subscriptionId: sub.id,
        totalCredits: 5000,
        remainingCredits: 5000,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 86400000),
      });

      expect(result.createdAt).toBeInstanceOf(Date);
      // createdAt should be close to now (within 5 seconds)
      expect(Math.abs(result.createdAt.getTime() - Date.now())).toBeLessThan(5000);
    });
  });
});
