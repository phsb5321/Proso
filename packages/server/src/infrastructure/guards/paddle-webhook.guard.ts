// Paddle webhook signature guard — verifies incoming webhook authenticity
// Extracts paddle-signature header, verifies via BillingGatewayPort,
// and attaches parsed WebhookEvent to the request object for downstream use.

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { BillingGatewayPort, type WebhookEvent } from '../../ports/billing-gateway.port';

/** Extended Request type with webhook event and raw body attached. */
export interface WebhookRequest extends Request {
  webhookEvent: WebhookEvent;
  rawBody?: Buffer;
}

@Injectable()
export class PaddleWebhookGuard implements CanActivate {
  constructor(private readonly billingGateway: BillingGatewayPort) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WebhookRequest>();

    const signature = request.headers['paddle-signature'] as string | undefined;
    if (!signature) {
      throw new ForbiddenException('Missing Paddle signature header');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      throw new ForbiddenException('Missing raw request body');
    }

    try {
      const event = await this.billingGateway.verifyWebhookSignature(rawBody, signature);
      request.webhookEvent = event;
      return true;
    } catch {
      throw new ForbiddenException('Invalid webhook signature');
    }
  }
}
