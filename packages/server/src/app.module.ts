import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import appConfig from './infrastructure/config/app.config';
import { AuthModule } from './infrastructure/modules/auth.module';
import { BillingModule } from './infrastructure/modules/billing.module';
import { CreditsModule } from './infrastructure/modules/credits.module';
import { HealthModule } from './infrastructure/modules/health.module';
import { LicenseModule } from './infrastructure/modules/license.module';
import { LoggingModule } from './infrastructure/modules/logging.module';
import { PrismaModule } from './infrastructure/modules/prisma.module';
import { SubscriptionModule } from './infrastructure/modules/subscription.module';
import { TTSModule } from './infrastructure/modules/tts.module';

@Module({
  imports: [
    // Error tracking (Sentry/GlitchTip) — no-op without SENTRY_DSN
    SentryModule.forRoot(),

    // Environment configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),

    // Structured logging (nestjs-pino)
    LoggingModule,

    // Database (Prisma)
    PrismaModule,

    // Health checks (@nestjs/terminus)
    HealthModule,

    // License validation
    LicenseModule,

    // Optional licence-key identity for every route (global guard)
    AuthModule,

    // Subscription management
    SubscriptionModule,

    // TTS synthesis proxy
    TTSModule,

    // Credit management
    CreditsModule,

    // Billing webhooks (Paddle)
    BillingModule,
  ],
  providers: [
    // Route unhandled exceptions to Sentry (preserves Nest's default response)
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
