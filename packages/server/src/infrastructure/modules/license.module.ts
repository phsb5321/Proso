import { Module } from '@nestjs/common';
import { LicenseController } from '../controllers/license.controller';
import { UserRepositoryPort } from '../../ports/user-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { PrismaUserRepository } from '../../adapters/persistence/prisma-user.repository';
import { PrismaSubscriptionRepository } from '../../adapters/persistence/prisma-subscription.repository';
import { PrismaCreditRepository } from '../../adapters/persistence/prisma-credit.repository';

@Module({
  controllers: [LicenseController],
  providers: [
    { provide: UserRepositoryPort, useClass: PrismaUserRepository },
    { provide: SubscriptionRepositoryPort, useClass: PrismaSubscriptionRepository },
    { provide: CreditRepositoryPort, useClass: PrismaCreditRepository },
  ],
  exports: [UserRepositoryPort, SubscriptionRepositoryPort, CreditRepositoryPort],
})
export class LicenseModule {}
