import { Module } from '@nestjs/common';
import { PrismaCreditRepository } from '../../adapters/persistence/prisma-credit.repository';
import { PrismaSubscriptionRepository } from '../../adapters/persistence/prisma-subscription.repository';
import { PrismaUserRepository } from '../../adapters/persistence/prisma-user.repository';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { UserRepositoryPort } from '../../ports/user-repository.port';
import { LicenseController } from '../controllers/license.controller';

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
