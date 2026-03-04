import { Module } from '@nestjs/common';
import { PaddleAdapter } from '../../adapters/billing/paddle.adapter';
import { PrismaCreditRepository } from '../../adapters/persistence/prisma-credit.repository';
import { PrismaSubscriptionRepository } from '../../adapters/persistence/prisma-subscription.repository';
import { BillingGatewayPort } from '../../ports/billing-gateway.port';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { SubscriptionController } from '../controllers/subscription.controller';

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
