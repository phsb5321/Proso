// Credit repository port — abstract contract for credit persistence
// Used by core services; implemented by Prisma adapter

export abstract class CreditRepositoryPort {
  abstract findCurrentAllocation(userId: string): Promise<CreditAllocationRecord | null>;
  abstract deductCredits(
    allocationId: string,
    amount: number,
    metadata: CreditDeductionMetadata,
  ): Promise<CreditDeductionRecord | null>;
  abstract getAllocationHistory(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<CreditTransactionRecord[]>;
  abstract getTransactionCount(userId: string): Promise<number>;
  abstract createAllocation(
    allocation: Omit<CreditAllocationRecord, 'id' | 'createdAt'>,
  ): Promise<CreditAllocationRecord>;
}

export interface CreditAllocationRecord {
  id: string;
  userId: string;
  subscriptionId: string;
  totalCredits: number;
  remainingCredits: number;
  periodStart: Date;
  periodEnd: Date;
  /** Source transaction for Paddle-funded periods; absent on legacy/manual rows. */
  paddleTransactionId?: string;
  createdAt: Date;
}

export interface CreditTransactionRecord {
  id: string;
  userId: string;
  allocationId: string;
  type: string;
  amount: number;
  provider?: string;
  characterCount?: number;
  description?: string;
  createdAt: Date;
}

export interface CreditDeductionRecord extends CreditTransactionRecord {
  remainingCredits: number;
}

export interface CreditDeductionMetadata {
  provider: string;
  characterCount: number;
  description?: string;
}
