// Auth module — registers the license key guard for every route in the app.
//
// APP_GUARD makes the guard global, so it runs before every controller,
// including ones declared in other modules. It resolves its dependencies in
// this module's context, which is why LicenseModule (the canonical binding of
// UserRepositoryPort to the Prisma adapter) is imported here rather than the
// port being re-bound to a second instance.
//
// This module must stay in AppModule's imports. Nothing else registers the
// guard, and without it `req.userId` is undefined for every request — the
// defect recorded in docs/money-path.md, where a paid key still met the free
// tier's 402.

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LicenseKeyGuard } from '../guards/license-key.guard';
import { LicenseModule } from './license.module';

@Module({
  imports: [LicenseModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: LicenseKeyGuard,
    },
  ],
})
export class AuthModule {}
