// Credits module — wires the credit repository port to its Prisma adapter
//
// This is a focused wiring module that makes CreditRepositoryPort
// available for injection across the application.

import { Module } from '@nestjs/common';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { PrismaCreditRepository } from '../../adapters/persistence/prisma-credit.repository';

@Module({
  providers: [
    { provide: CreditRepositoryPort, useClass: PrismaCreditRepository },
  ],
  exports: [CreditRepositoryPort],
})
export class CreditsModule {}
