// Billing gateway port — abstract contract for payment provider integration
// Used by subscription service; implemented by Paddle adapter

export abstract class BillingGatewayPort {
  abstract createCheckoutUrl(params: CheckoutParams): Promise<string>;
  abstract getSubscription(subscriptionId: string): Promise<BillingSubscription | null>;
  abstract cancelSubscription(subscriptionId: string): Promise<void>;
  abstract verifyWebhookSignature(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}

export interface CheckoutParams {
  tier: string;
  userId: string;
  email?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface BillingSubscription {
  id: string;
  status: string;
  tier: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date;
}

export interface WebhookEvent {
  eventType: string;
  eventId: string;
  occurredAt: Date;
  data: Record<string, unknown>;
}
