import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggingModule } from './infrastructure/modules/logging.module';
import { HealthModule } from './infrastructure/modules/health.module';
import { PrismaModule } from './infrastructure/modules/prisma.module';
import { LicenseModule } from './infrastructure/modules/license.module';
import { SubscriptionModule } from './infrastructure/modules/subscription.module';
import { TTSModule } from './infrastructure/modules/tts.module';
import { CreditsModule } from './infrastructure/modules/credits.module';
import appConfig from './infrastructure/config/app.config';

@Module({
  imports: [
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

    // Subscription management
    SubscriptionModule,

    // TTS synthesis proxy
    TTSModule,

    // Credit management
    CreditsModule,
  ],
})
export class AppModule {}
