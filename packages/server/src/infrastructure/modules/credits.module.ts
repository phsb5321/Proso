// Credits module — wires the credit repository port to its Prisma adapter
// and exposes the CreditsController for balance/history endpoints.
//
// This is a focused wiring module that makes CreditRepositoryPort
// available for injection across the application.

import { Module } from '@nestjs/common';
import { PrismaCreditRepository } from '../../adapters/persistence/prisma-credit.repository';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { CreditsController } from '../controllers/credits.controller';

@Module({
  controllers: [CreditsController],
  providers: [{ provide: CreditRepositoryPort, useClass: PrismaCreditRepository }],
  exports: [CreditRepositoryPort],
})
export class CreditsModule {}
