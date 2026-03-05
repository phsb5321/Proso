import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { CheckoutRequest, CheckoutResponse, SubscriptionDetailsResponse } from '@proso/shared';
import { SubscriptionStatus, SubscriptionTier } from '@proso/shared';
import type { Request } from 'express';
import { getFreeTierDefaults } from '../../core/subscription/feature-gate';
import { BillingGatewayPort } from '../../ports/billing-gateway.port';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';

@Controller('api/v1/subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
    private readonly creditRepository: CreditRepositoryPort,
    private readonly billingGateway: BillingGatewayPort,
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

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async createCheckout(
    @Req() req: Request,
    @Body() body: CheckoutRequest,
  ): Promise<CheckoutResponse> {
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      throw new BadRequestException('Authentication required for checkout');
    }

    const validTiers = [SubscriptionTier.Pro, SubscriptionTier.Enterprise];
    if (!validTiers.includes(body.tier)) {
      throw new BadRequestException('Invalid tier for checkout');
    }

    const checkoutUrl = await this.billingGateway.createCheckoutUrl({
      tier: body.tier,
      userId,
    });

    return { checkoutUrl };
  }
}
