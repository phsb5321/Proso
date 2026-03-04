// Billing module — wires Paddle webhook processing infrastructure
//
// Provides:
//   - PaddleWebhookGuard (signature verification)
//   - IdempotencyService (duplicate event detection)
//   - WebhookController (POST /webhooks/paddle)
//
// Imports SubscriptionModule for repository access (subscription + credit repos).
// BillingGatewayPort is re-used from SubscriptionModule where PaddleAdapter is bound.

import { Module } from '@nestjs/common';
import { WebhookController } from '../controllers/webhook.controller';
import { PaddleWebhookGuard } from '../guards/paddle-webhook.guard';
import { IdempotencyService } from '../services/idempotency.service';
import { SubscriptionModule } from './subscription.module';

@Module({
  imports: [
    // Re-use SubscriptionModule exports: SubscriptionRepositoryPort,
    // CreditRepositoryPort, BillingGatewayPort (PaddleAdapter)
    SubscriptionModule,
  ],
  controllers: [WebhookController],
  providers: [PaddleWebhookGuard, IdempotencyService],
  exports: [IdempotencyService],
})
export class BillingModule {}
