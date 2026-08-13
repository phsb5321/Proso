import { Controller, Get, HttpCode, HttpStatus, Req } from '@nestjs/common';
import type { SubscriptionDetailsResponse } from '@proso/shared';
import { SubscriptionStatus, SubscriptionTier } from '@proso/shared';
import type { Request } from 'express';
import { getFreeTierDefaults } from '../../core/subscription/feature-gate';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';

@Controller('api/v1/subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
    private readonly creditRepository: CreditRepositoryPort,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getSubscription(@Req() req: Request): Promise<SubscriptionDetailsResponse> {
    // userId is attached by the license key guard
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      const defaults = getFreeTierDefaults();
      return {
        tier: defaults.tier,
        status: SubscriptionStatus.Active,
        credits: defaults.credits,
      };
    }

    const subscription = await this.subscriptionRepository.findActiveByUserId(userId);
    if (!subscription) {
      return {
        tier: SubscriptionTier.Free,
        status: SubscriptionStatus.Active,
      };
    }

    const allocation = await this.creditRepository.findCurrentAllocation(userId);
    const total = allocation?.totalCredits ?? 0;
    const remaining = allocation?.remainingCredits ?? 0;
    const usagePercent = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;

    return {
      tier: subscription.tier as SubscriptionTier,
      status: subscription.status as SubscriptionStatus,
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      credits: {
        total,
        remaining,
        usagePercent,
        periodStart: subscription.currentPeriodStart.toISOString(),
        periodEnd: subscription.currentPeriodEnd.toISOString(),
      },
    };
  }
}
