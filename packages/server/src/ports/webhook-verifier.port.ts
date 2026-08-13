import type { WebhookEvent } from './paddle-provisioning.port.js';

/** Authenticates exact webhook bytes and returns the verified provider envelope. */
export abstract class WebhookVerifierPort {
  abstract verifyWebhookSignature(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}
