import { Module } from '@nestjs/common';
import { PrismaCreditRepository } from '../../adapters/persistence/prisma-credit.repository';
import { PrismaSubscriptionRepository } from '../../adapters/persistence/prisma-subscription.repository';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { SubscriptionController } from '../controllers/subscription.controller';

@Module({
  controllers: [SubscriptionController],
  providers: [
    { provide: SubscriptionRepositoryPort, useClass: PrismaSubscriptionRepository },
    { provide: CreditRepositoryPort, useClass: PrismaCreditRepository },
  ],
  exports: [SubscriptionRepositoryPort, CreditRepositoryPort],
})
export class SubscriptionModule {}
