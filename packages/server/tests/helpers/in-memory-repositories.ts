/**
 * In-memory repository fakes for the licence issuance and claim foundation.
 *
 * They implement ports rather than mocking call-by-call, so a seeded purchase,
 * claim, and validation share state and assert on customer-visible outcomes.
 */

import { randomUUID } from 'node:crypto';
import type {
  CreditAllocationRecord,
  CreditDeductionMetadata,
  CreditDeductionRecord,
  CreditTransactionRecord,
} from '../../src/ports/credit-repository.port';
import { CreditRepositoryPort } from '../../src/ports/credit-repository.port';
import type { LicenseKeyRecord, NewLicenseKey } from '../../src/ports/license-key-repository.port';
import { LicenseKeyRepositoryPort } from '../../src/ports/license-key-repository.port';
import type { SubscriptionRecord } from '../../src/ports/subscription-repository.port';
import { SubscriptionRepositoryPort } from '../../src/ports/subscription-repository.port';
import type { UserRecord } from '../../src/ports/user-repository.port';
import { UserRepositoryPort } from '../../src/ports/user-repository.port';

/**
 * Models the database's unique constraint on `LicenseKey.userId` rather than a
 * check-then-insert: `createIfAbsent` resolves atomically to the stored row,
 * which is exactly what the constraint plus the adapter's P2002 branch
 * guarantee. `settleAfter` lets a test hold both callers inside the operation
 * at once, so the concurrency claim is exercised rather than asserted.
 */
export class InMemoryLicenseKeyRepository extends LicenseKeyRepositoryPort {
  readonly rows: LicenseKeyRecord[] = [];
  /** Every `createIfAbsent` call, including the ones that wrote nothing. */
  writeAttempts = 0;
  /** Awaited before the insert resolves; set it to interleave two callers. */
  settleAfter: Promise<unknown> | null = null;

  async findByUserId(userId: string): Promise<LicenseKeyRecord | null> {
    return this.rows.find((row) => row.userId === userId) ?? null;
  }

  async createIfAbsent(key: NewLicenseKey): Promise<LicenseKeyRecord> {
    this.writeAttempts += 1;

    if (this.settleAfter) await this.settleAfter;

    // Atomic from here down: no await separates the constraint check from the
    // insert, which is what the database's unique index gives the real adapter.
    // An `await` here would model the check-then-insert bug instead.
    const existing = this.rows.find((row) => row.userId === key.userId);
    if (existing) return existing;

    const record: LicenseKeyRecord = {
      id: key.id,
      userId: key.userId,
      keyHash: key.keyHash,
      activatedAt: key.activatedAt,
      deviceCount: 0,
      maxDevices: 5,
      isActive: true,
      createdAt: new Date(),
    };
    this.rows.push(record);
    return record;
  }
}

export class InMemorySubscriptionRepository extends SubscriptionRepositoryPort {
  readonly rows: SubscriptionRecord[] = [];

  async findById(id: string): Promise<SubscriptionRecord | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async findByUserId(userId: string): Promise<SubscriptionRecord | null> {
    return this.rows.find((row) => row.userId === userId) ?? null;
  }

  async findActiveByUserId(userId: string): Promise<SubscriptionRecord | null> {
    return (
      this.rows.find(
        (row) =>
          row.userId === userId &&
          ['active', 'trialing', 'past_due', 'cancelled'].includes(row.status),
      ) ?? null
    );
  }

  async findByPaddleId(paddleSubscriptionId: string): Promise<SubscriptionRecord | null> {
    return this.rows.find((row) => row.paddleSubscriptionId === paddleSubscriptionId) ?? null;
  }

  async findByPaddleTransactionId(paddleTransactionId: string): Promise<SubscriptionRecord | null> {
    return this.rows.find((row) => row.paddleTransactionId === paddleTransactionId) ?? null;
  }

  async save(subscription: SubscriptionRecord): Promise<SubscriptionRecord> {
    // Mirrors the Prisma adapter: an empty id means "generate one".
    const row: SubscriptionRecord = { ...subscription, id: subscription.id || randomUUID() };
    this.rows.push(row);
    return row;
  }

  async update(id: string, data: Partial<SubscriptionRecord>): Promise<SubscriptionRecord> {
    const index = this.rows.findIndex((row) => row.id === id);
    if (index === -1) throw new Error(`No subscription ${id}`);

    const updated = { ...this.rows[index], ...data };
    this.rows[index] = updated;
    return updated;
  }
}

export class InMemoryCreditRepository extends CreditRepositoryPort {
  readonly allocations: CreditAllocationRecord[] = [];

  async findCurrentAllocation(userId: string): Promise<CreditAllocationRecord | null> {
    const forUser = this.allocations.filter((row) => row.userId === userId);
    return forUser.length > 0 ? forUser[forUser.length - 1] : null;
  }

  async deductCredits(
    _allocationId: string,
    _amount: number,
    _metadata: CreditDeductionMetadata,
  ): Promise<CreditDeductionRecord | null> {
    return null;
  }

  async getAllocationHistory(
    _userId: string,
    _limit: number,
    _offset: number,
  ): Promise<CreditTransactionRecord[]> {
    return [];
  }

  async getTransactionCount(_userId: string): Promise<number> {
    return 0;
  }

  async createAllocation(
    allocation: Omit<CreditAllocationRecord, 'id' | 'createdAt'>,
  ): Promise<CreditAllocationRecord> {
    const record: CreditAllocationRecord = {
      ...allocation,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.allocations.push(record);
    return record;
  }
}

/**
 * Resolves a key hash to a user through the license key rows, exactly as the
 * Prisma adapter does — the journey test depends on that indirection being real
 * rather than stubbed.
 */
export class InMemoryUserRepository extends UserRepositoryPort {
  constructor(private readonly licenseKeys: InMemoryLicenseKeyRepository) {
    super();
  }

  readonly users = new Map<string, UserRecord>();

  seed(userId: string): UserRecord {
    const user: UserRecord = {
      id: userId,
      tier: 'free',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(userId, user);
    return user;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async findByLicenseKeyHash(keyHash: string): Promise<UserRecord | null> {
    const row = this.licenseKeys.rows.find((key) => key.keyHash === keyHash && key.isActive);
    if (!row) return null;
    return this.users.get(row.userId) ?? this.seed(row.userId);
  }

  async create(user: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserRecord> {
    const record: UserRecord = {
      ...user,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(record.id, record);
    return record;
  }

  async update(id: string, data: Partial<UserRecord>): Promise<UserRecord> {
    const existing = this.users.get(id);
    if (!existing) throw new Error(`No user ${id}`);

    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }
}
