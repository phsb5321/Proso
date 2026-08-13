// Subscription repository port — abstract contract for subscription persistence
// Used by core services; implemented by Prisma adapter

export abstract class SubscriptionRepositoryPort {
  abstract findById(id: string): Promise<SubscriptionRecord | null>;
  abstract findByUserId(userId: string): Promise<SubscriptionRecord | null>;
  abstract findActiveByUserId(userId: string): Promise<SubscriptionRecord | null>;
  abstract findByPaddleId(paddleSubscriptionId: string): Promise<SubscriptionRecord | null>;
  /**
   * Look up by the initial checkout transaction id (`txn_…`), the reference the
   * post-checkout page holds. Routing only — the caller must still verify the
   * claim secret before returning anything.
   */
  abstract findByPaddleTransactionId(
    paddleTransactionId: string,
  ): Promise<SubscriptionRecord | null>;
  abstract save(subscription: SubscriptionRecord): Promise<SubscriptionRecord>;
  abstract update(id: string, data: Partial<SubscriptionRecord>): Promise<SubscriptionRecord>;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  paddleSubscriptionId?: string;
  paddleTransactionId?: string;
  /** SHA-256 of the buyer's claim secret; absent for purchases made before the claim contract. */
  licenseClaimHash?: string;
  tier: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
