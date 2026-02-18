import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LicenseKeyGuard } from '../guards/license-key.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: LicenseKeyGuard,
    },
  ],
})
export class AuthModule {}
