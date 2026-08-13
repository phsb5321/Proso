import { Module } from '@nestjs/common';
import { PaddleAdapter } from '../../adapters/billing/paddle.adapter';
import { PrismaPaddleProvisioner } from '../../adapters/persistence/prisma-paddle-provisioner';
import { PaddleProvisioningPort } from '../../ports/paddle-provisioning.port';
import { WebhookVerifierPort } from '../../ports/webhook-verifier.port';
import { WebhookController } from '../controllers/webhook.controller';
import { PaddleWebhookGuard } from '../guards/paddle-webhook.guard';
import { PaddleWebhookProcessor } from '../services/paddle-webhook.processor';
import { PrismaModule } from './prisma.module';

/** Composition root for signed Paddle webhook fulfilment. */
@Module({
  imports: [PrismaModule],
  controllers: [WebhookController],
  providers: [
    PaddleWebhookGuard,
    PaddleWebhookProcessor,
    { provide: WebhookVerifierPort, useClass: PaddleAdapter },
    { provide: PaddleProvisioningPort, useClass: PrismaPaddleProvisioner },
  ],
})
export class BillingModule {}
