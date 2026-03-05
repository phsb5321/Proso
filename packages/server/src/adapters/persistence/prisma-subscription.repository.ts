import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/modules/prisma.module';
import {
  type SubscriptionRecord,
  SubscriptionRepositoryPort,
} from '../../ports/subscription-repository.port';

@Injectable()
export class PrismaSubscriptionRepository extends SubscriptionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<SubscriptionRecord | null> {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    return sub ? this.toRecord(sub) : null;
  }

  async findByUserId(userId: string): Promise<SubscriptionRecord | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return sub ? this.toRecord(sub) : null;
  }

  async findByPaddleId(paddleSubscriptionId: string): Promise<SubscriptionRecord | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: { paddleSubscriptionId },
    });
    return sub ? this.toRecord(sub) : null;
  }

  async findActiveByUserId(userId: string): Promise<SubscriptionRecord | null> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['active', 'trialing', 'past_due', 'cancelled'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return sub ? this.toRecord(sub) : null;
  }

  async save(subscription: SubscriptionRecord): Promise<SubscriptionRecord> {
    const sub = await this.prisma.subscription.create({
      data: {
        id: subscription.id,
        userId: subscription.userId,
        paddleSubscriptionId: subscription.paddleSubscriptionId ?? '',
        tier: subscription.tier as 'free' | 'pro' | 'enterprise',
        status: subscription.status as 'active' | 'cancelled' | 'expired' | 'past_due' | 'trialing',
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelledAt: subscription.cancelledAt,
      },
    });
    return this.toRecord(sub);
  }

  async update(id: string, data: Partial<SubscriptionRecord>): Promise<SubscriptionRecord> {
    const updateData: Record<string, unknown> = {};
    if (data.tier !== undefined) updateData.tier = data.tier;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.currentPeriodStart !== undefined)
      updateData.currentPeriodStart = data.currentPeriodStart;
    if (data.currentPeriodEnd !== undefined) updateData.currentPeriodEnd = data.currentPeriodEnd;
    if (data.cancelledAt !== undefined) updateData.cancelledAt = data.cancelledAt;
    if (data.paddleSubscriptionId !== undefined)
      updateData.paddleSubscriptionId = data.paddleSubscriptionId;

    const sub = await this.prisma.subscription.update({
      where: { id },
      data: updateData,
    });
    return this.toRecord(sub);
  }

  private toRecord(sub: {
    id: string;
    userId: string;
    paddleSubscriptionId: string;
    tier: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): SubscriptionRecord {
    return {
      id: sub.id,
      userId: sub.userId,
      paddleSubscriptionId: sub.paddleSubscriptionId || undefined,
      tier: sub.tier,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelledAt: sub.cancelledAt ?? undefined,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }
}
