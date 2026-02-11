import { Module } from '@nestjs/common';
import { SubscriptionController } from '../controllers/subscription.controller';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { BillingGatewayPort } from '../../ports/billing-gateway.port';
import { PrismaSubscriptionRepository } from '../../adapters/persistence/prisma-subscription.repository';
import { PrismaCreditRepository } from '../../adapters/persistence/prisma-credit.repository';
import { PaddleAdapter } from '../../adapters/billing/paddle.adapter';

@Module({
  controllers: [SubscriptionController],
  providers: [
    { provide: SubscriptionRepositoryPort, useClass: PrismaSubscriptionRepository },
    { provide: CreditRepositoryPort, useClass: PrismaCreditRepository },
    { provide: BillingGatewayPort, useClass: PaddleAdapter },
  ],
  exports: [SubscriptionRepositoryPort, CreditRepositoryPort, BillingGatewayPort],
})
export class SubscriptionModule {}
