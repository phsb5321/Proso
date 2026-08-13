import { Module } from '@nestjs/common';
import { PrismaCreditRepository } from '../../adapters/persistence/prisma-credit.repository';
import { PrismaLicenseKeyRepository } from '../../adapters/persistence/prisma-license-key.repository';
import { PrismaSubscriptionRepository } from '../../adapters/persistence/prisma-subscription.repository';
import { PrismaUserRepository } from '../../adapters/persistence/prisma-user.repository';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { LicenseKeyRepositoryPort } from '../../ports/license-key-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { UserRepositoryPort } from '../../ports/user-repository.port';
import { LicenseController } from '../controllers/license.controller';
import { RateLimitModule } from './rate-limit.module';

@Module({
  // Provides the ThrottlerGuard used by POST /api/v1/license/by-transaction.
  imports: [RateLimitModule],
  controllers: [LicenseController],
  providers: [
    { provide: UserRepositoryPort, useClass: PrismaUserRepository },
    { provide: SubscriptionRepositoryPort, useClass: PrismaSubscriptionRepository },
    { provide: CreditRepositoryPort, useClass: PrismaCreditRepository },
    { provide: LicenseKeyRepositoryPort, useClass: PrismaLicenseKeyRepository },
  ],
  exports: [
    UserRepositoryPort,
    SubscriptionRepositoryPort,
    CreditRepositoryPort,
    LicenseKeyRepositoryPort,
  ],
})
export class LicenseModule {}
