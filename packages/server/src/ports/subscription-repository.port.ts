// Subscription repository port — abstract contract for subscription persistence
// Used by core services; implemented by Prisma adapter

export abstract class SubscriptionRepositoryPort {
  abstract findById(id: string): Promise<SubscriptionRecord | null>;
  abstract findByUserId(userId: string): Promise<SubscriptionRecord | null>;
  abstract findActiveByUserId(userId: string): Promise<SubscriptionRecord | null>;
  abstract findByPaddleId(paddleSubscriptionId: string): Promise<SubscriptionRecord | null>;
  abstract save(subscription: SubscriptionRecord): Promise<SubscriptionRecord>;
  abstract update(id: string, data: Partial<SubscriptionRecord>): Promise<SubscriptionRecord>;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  paddleSubscriptionId?: string;
  tier: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
