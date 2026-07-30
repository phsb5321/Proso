import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/modules/prisma.module';
import {
  type CreditAllocationRecord,
  type CreditDeductionMetadata,
  type CreditDeductionRecord,
  CreditRepositoryPort,
  type CreditTransactionRecord,
} from '../../ports/credit-repository.port';

@Injectable()
export class PrismaCreditRepository extends CreditRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findCurrentAllocation(userId: string): Promise<CreditAllocationRecord | null> {
    const now = new Date();
    const allocation = await this.prisma.creditAllocation.findFirst({
      where: {
        userId,
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      orderBy: { createdAt: 'desc' },
    });
    return allocation ? this.toAllocationRecord(allocation) : null;
  }

  async deductCredits(
    allocationId: string,
    amount: number,
    metadata: CreditDeductionMetadata,
  ): Promise<CreditDeductionRecord | null> {
    const result = await this.prisma.$transaction(async (tx) => {
      const debit = await tx.creditAllocation.updateMany({
        where: {
          id: allocationId,
          remainingCredits: { gte: amount },
          periodEnd: { gte: new Date() },
        },
        data: { remainingCredits: { decrement: amount } },
      });
      if (debit.count !== 1) {
        return null;
      }

      const allocation = await tx.creditAllocation.findUniqueOrThrow({
        where: { id: allocationId },
      });
      const transaction = await tx.creditTransaction.create({
        data: {
          allocationId,
          userId: allocation.userId,
          type: 'deduction',
          amount: -amount,
          provider: metadata.provider as 'openai' | 'elevenlabs' | 'groq',
          characterCount: metadata.characterCount,
        },
      });

      return {
        transaction,
        remainingCredits: allocation.remainingCredits,
      };
    });
    return result
      ? {
          ...this.toTransactionRecord(result.transaction),
          remainingCredits: result.remainingCredits,
        }
      : null;
  }

  async getAllocationHistory(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<CreditTransactionRecord[]> {
    const transactions = await this.prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return transactions.map((t) => this.toTransactionRecord(t));
  }

  async getTransactionCount(userId: string): Promise<number> {
    return this.prisma.creditTransaction.count({ where: { userId } });
  }

  async createAllocation(
    allocation: Omit<CreditAllocationRecord, 'id' | 'createdAt'>,
  ): Promise<CreditAllocationRecord> {
    const created = await this.prisma.creditAllocation.create({
      data: {
        userId: allocation.userId,
        subscriptionId: allocation.subscriptionId,
        totalCredits: allocation.totalCredits,
        remainingCredits: allocation.remainingCredits,
        periodStart: allocation.periodStart,
        periodEnd: allocation.periodEnd,
      },
    });
    return this.toAllocationRecord(created);
  }

  private toAllocationRecord(a: {
    id: string;
    userId: string;
    subscriptionId: string;
    totalCredits: number;
    remainingCredits: number;
    periodStart: Date;
    periodEnd: Date;
    createdAt: Date;
  }): CreditAllocationRecord {
    return {
      id: a.id,
      userId: a.userId,
      subscriptionId: a.subscriptionId,
      totalCredits: a.totalCredits,
      remainingCredits: a.remainingCredits,
      periodStart: a.periodStart,
      periodEnd: a.periodEnd,
      createdAt: a.createdAt,
    };
  }

  private toTransactionRecord(t: {
    id: string;
    userId: string;
    allocationId: string;
    type: string;
    amount: number;
    provider: string | null;
    characterCount: number | null;
    createdAt: Date;
  }): CreditTransactionRecord {
    return {
      id: t.id,
      userId: t.userId,
      allocationId: t.allocationId,
      type: t.type,
      amount: t.amount,
      provider: t.provider ?? undefined,
      characterCount: t.characterCount ?? undefined,
      createdAt: t.createdAt,
    };
  }
}
