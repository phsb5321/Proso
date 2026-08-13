import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WebhookEvent } from '../../ports/paddle-provisioning.port';
import { WebhookVerifierPort } from '../../ports/webhook-verifier.port';

const SIGNATURE_TOLERANCE_MS = 5_000;
const HMAC_SHA256_HEX = /^[0-9a-f]{64}$/i;

/**
 * Authenticate and parse one Paddle webhook envelope.
 *
 * Signature verification consumes the original bytes. JSON parsing is kept
 * below the constant-time comparison so an unauthenticated body never reaches
 * the payload parser.
 */
export function verifyPaddleWebhook(
  rawBody: Buffer,
  signatureHeader: string,
  endpointSecret: string,
  nowMs = Date.now(),
): WebhookEvent {
  if (!endpointSecret) throw new Error('Paddle endpoint secret is not configured');

  const parts = signatureHeader.split(';');
  let timestampText: string | undefined;
  const signatures: string[] = [];

  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator <= 0 || separator === part.length - 1) {
      throw new Error('Malformed Paddle signature header');
    }

    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === 'ts') {
      if (timestampText !== undefined) throw new Error('Malformed Paddle signature header');
      timestampText = value;
    } else if (key === 'h1') {
      signatures.push(value);
    }
  }

  if (!timestampText || !/^[0-9]+$/.test(timestampText) || signatures.length === 0) {
    throw new Error('Malformed Paddle signature header');
  }
  if (signatures.some((candidate) => !HMAC_SHA256_HEX.test(candidate))) {
    throw new Error('Malformed Paddle signature header');
  }

  const timestampSeconds = Number(timestampText);
  if (!Number.isSafeInteger(timestampSeconds)) {
    throw new Error('Malformed Paddle signature header');
  }
  if (Math.abs(nowMs - timestampSeconds * 1_000) > SIGNATURE_TOLERANCE_MS) {
    throw new Error('Paddle signature timestamp is outside tolerance');
  }

  const expected = createHmac('sha256', endpointSecret)
    .update(`${timestampText}:`)
    .update(rawBody)
    .digest();
  let signatureMatches = false;
  for (const candidate of signatures) {
    signatureMatches = timingSafeEqual(expected, Buffer.from(candidate, 'hex')) || signatureMatches;
  }
  if (!signatureMatches) throw new Error('Invalid Paddle signature');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
  } catch {
    throw new Error('Invalid Paddle webhook JSON');
  }

  if (!isRecord(parsed)) throw new Error('Invalid Paddle webhook envelope');
  const eventId = parsed['event_id'];
  const eventType = parsed['event_type'];
  const occurredAtText = parsed['occurred_at'];
  const data = parsed['data'];
  const occurredAtMs = typeof occurredAtText === 'string' ? Date.parse(occurredAtText) : Number.NaN;

  if (
    typeof eventId !== 'string' ||
    eventId.trim().length === 0 ||
    typeof eventType !== 'string' ||
    eventType.trim().length === 0 ||
    !Number.isFinite(occurredAtMs) ||
    !isRecord(data)
  ) {
    throw new Error('Invalid Paddle webhook envelope');
  }

  return {
    eventId,
    eventType,
    occurredAt: new Date(occurredAtMs),
    data,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class PaddleAdapter extends WebhookVerifierPort {
  constructor(private readonly config: ConfigService) {
    super();
  }

  async verifyWebhookSignature(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    const webhookSecret =
      this.config.get<string>('app.paddleWebhookSecret') ??
      this.config.get<string>('PADDLE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('PADDLE_WEBHOOK_SECRET not configured');
    }

    return verifyPaddleWebhook(rawBody, signature, webhookSecret);
  }
}
