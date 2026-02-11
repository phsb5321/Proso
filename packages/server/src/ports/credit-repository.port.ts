// Credit repository port — abstract contract for credit persistence
// Used by core services; implemented by Prisma adapter

export abstract class CreditRepositoryPort {
  abstract findCurrentAllocation(userId: string): Promise<CreditAllocationRecord | null>;
  abstract deductCredits(
    allocationId: string,
    amount: number,
    metadata: CreditDeductionMetadata,
  ): Promise<CreditTransactionRecord>;
  abstract getAllocationHistory(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<CreditTransactionRecord[]>;
  abstract createAllocation(allocation: Omit<CreditAllocationRecord, 'id' | 'createdAt'>): Promise<CreditAllocationRecord>;
}

export interface CreditAllocationRecord {
  id: string;
  userId: string;
  subscriptionId: string;
  totalCredits: number;
  remainingCredits: number;
  periodStart: Date;
  periodEnd: Date;
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

export interface CreditDeductionMetadata {
  provider: string;
  characterCount: number;
  description?: string;
}
