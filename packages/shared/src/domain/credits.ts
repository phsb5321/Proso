// Credit domain types — shared between extension and server

import type { TTSProvider } from './provider.js';

export enum TransactionType {
  Deduction = 'deduction',
  Allocation = 'allocation',
}

export interface CreditAllocation {
  id: string;
  userId: string;
  subscriptionId: string;
  totalCredits: number;
  remainingCredits: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface CreditTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  provider?: TTSProvider;
  characterCount?: number;
  createdAt: string;
}
