import { randomUUID } from 'node:crypto';
/**
 * Test fixtures for contract/integration tests.
 *
 * Provides factory functions to create test data in the database
 * with proper FK relationships.
 */
import type { PrismaService } from '../../src/infrastructure/modules/prisma.module';

export interface TestUser {
  id: string;
  licenseKey: string;
  email: string | null;
}

export interface TestSubscription {
  id: string;
  userId: string;
  paddleSubscriptionId: string;
  tier: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'cancelled' | 'expired' | 'past_due' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
}

export interface TestCreditAllocation {
  id: string;
  userId: string;
  subscriptionId: string;
  totalCredits: number;
  remainingCredits: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Create a test user in the database.
 */
export async function createTestUser(
  prisma: PrismaService,
  overrides: Partial<{ id: string; licenseKey: string; email: string | null }> = {},
): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      id: overrides.id ?? randomUUID(),
      licenseKey: overrides.licenseKey ?? `test-key-${randomUUID()}`,
      email: overrides.email ?? `test-${randomUUID()}@example.com`,
    },
  });
  return { id: user.id, licenseKey: user.licenseKey, email: user.email };
}

/**
 * Create a test subscription linked to a user.
 */
export async function createTestSubscription(
  prisma: PrismaService,
  userId: string,
  overrides: Partial<Omit<TestSubscription, 'userId'>> = {},
): Promise<TestSubscription> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

  const sub = await prisma.subscription.create({
    data: {
      id: overrides.id ?? randomUUID(),
      userId,
      paddleSubscriptionId: overrides.paddleSubscriptionId ?? `paddle-${randomUUID()}`,
      tier: overrides.tier ?? 'pro',
      status: overrides.status ?? 'active',
      currentPeriodStart: overrides.currentPeriodStart ?? now,
      currentPeriodEnd: overrides.currentPeriodEnd ?? periodEnd,
      cancelledAt: overrides.cancelledAt ?? null,
    },
  });

  return {
    id: sub.id,
    userId: sub.userId,
    paddleSubscriptionId: sub.paddleSubscriptionId,
    tier: sub.tier as TestSubscription['tier'],
    status: sub.status as TestSubscription['status'],
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelledAt: sub.cancelledAt,
  };
}

/**
 * Create a test credit allocation linked to a user and subscription.
 */
export async function createTestCreditAllocation(
  prisma: PrismaService,
  userId: string,
  subscriptionId: string,
  overrides: Partial<Omit<TestCreditAllocation, 'userId' | 'subscriptionId'>> = {},
): Promise<TestCreditAllocation> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const allocation = await prisma.creditAllocation.create({
    data: {
      id: overrides.id ?? randomUUID(),
      userId,
      subscriptionId,
      totalCredits: overrides.totalCredits ?? 10000,
      remainingCredits: overrides.remainingCredits ?? 10000,
      periodStart: overrides.periodStart ?? now,
      periodEnd: overrides.periodEnd ?? periodEnd,
    },
  });

  return {
    id: allocation.id,
    userId: allocation.userId,
    subscriptionId: allocation.subscriptionId,
    totalCredits: allocation.totalCredits,
    remainingCredits: allocation.remainingCredits,
    periodStart: allocation.periodStart,
    periodEnd: allocation.periodEnd,
  };
}
