import { Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  BillingGatewayPort,
  type BillingSubscription,
  type CheckoutParams,
  type WebhookEvent,
} from '../../ports/billing-gateway.port';

@Injectable()
export class PaddleAdapter extends BillingGatewayPort {
  private readonly logger = new Logger(PaddleAdapter.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async createCheckoutUrl(params: CheckoutParams): Promise<string> {
    const apiKey = this.config.get<string>('PADDLE_API_KEY');
    if (!apiKey) {
      throw new Error('PADDLE_API_KEY not configured');
    }

    // TODO: Integrate with Paddle SDK when API keys are available
    this.logger.warn('Paddle checkout URL generation not yet implemented');
    return `https://checkout.paddle.com/stub?tier=${params.tier}&user=${params.userId}`;
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscription | null> {
    const apiKey = this.config.get<string>('PADDLE_API_KEY');
    if (!apiKey) {
      this.logger.warn('PADDLE_API_KEY not configured, returning null');
      return null;
    }

    // TODO: Integrate with Paddle SDK
    this.logger.warn(`Paddle getSubscription(${subscriptionId}) not yet implemented`);
    return null;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const apiKey = this.config.get<string>('PADDLE_API_KEY');
    if (!apiKey) {
      throw new Error('PADDLE_API_KEY not configured');
    }

    // TODO: Integrate with Paddle SDK
    this.logger.warn(`Paddle cancelSubscription(${subscriptionId}) not yet implemented`);
  }

  async verifyWebhookSignature(_rawBody: Buffer, _signature: string): Promise<WebhookEvent> {
    const webhookSecret = this.config.get<string>('PADDLE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('PADDLE_WEBHOOK_SECRET not configured');
    }

    // TODO: Implement Paddle SDK unmarshal() for signature verification
    this.logger.warn('Paddle webhook signature verification not yet implemented');
    throw new Error('Paddle webhook verification not implemented');
  }
}
