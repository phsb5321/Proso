import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SubscriptionStatus, SubscriptionTier, isOk } from '@proso/shared';
import { normalizePaddleWebhook } from '../../../../src/core/subscription/paddle-webhook.service';
import type { PaddleProvisioningCommand } from '../../../../src/ports/paddle-provisioning.port';

/**
 * Canonical examples copied from Paddle Billing webhook documentation on
 * 13/08/2026, then minimally adapted in-place:
 *
 * - the first official price id is replaced with this test's configured price;
 * - additional official recurring products are marked one-time, because Proso
 *   intentionally supports exactly one recurring plan item;
 * - the existing canonical `custom_data` slot carries Proso's claim hash plus
 *   hostile diagnostic metadata.
 *
 * Every field shape and nullability consumed below otherwise stays verbatim.
 */
const FIXTURE_SOURCES = {
  'transaction-completed':
    'https://developer.paddle.com/webhooks/transactions/transaction-completed/',
  'subscription-created':
    'https://developer.paddle.com/webhooks/subscriptions/subscription-created/',
  'subscription-updated':
    'https://developer.paddle.com/webhooks/subscriptions/subscription-updated/',
  'subscription-canceled':
    'https://developer.paddle.com/webhooks/subscriptions/subscription-canceled/',
} as const;

const PRICES = {
  proMonthly: 'pri_promonth',
  proYearly: 'pri_proyear',
  enterpriseMonthly: 'pri_enterprisemonth',
  enterpriseYearly: 'pri_enterpriseyear',
};
const FIXTURE_ROOT = resolve(__dirname, '../../../fixtures/paddle');

type FixtureName = keyof typeof FIXTURE_SOURCES;

function fixture(name: FixtureName): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(FIXTURE_ROOT, `${name}.json`), 'utf8')) as Record<
    string,
    unknown
  >;
}

function normalize(name: FixtureName): PaddleProvisioningCommand {
  const envelope = fixture(name);
  const result = normalizePaddleWebhook(
    {
      eventId: envelope['event_id'] as string,
      eventType: envelope['event_type'] as string,
      occurredAt: new Date(envelope['occurred_at'] as string),
      data: envelope['data'] as Record<string, unknown>,
    },
    PRICES,
  );
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) throw new Error(`${name} failed canonical normalization`);
  return result.value;
}

describe('Paddle canonical webhook fixtures', () => {
  it('pins a source URL for every checked-in official example', () => {
    expect(Object.keys(FIXTURE_SOURCES).sort()).toEqual([
      'subscription-canceled',
      'subscription-created',
      'subscription-updated',
      'transaction-completed',
    ]);
    for (const source of Object.values(FIXTURE_SOURCES)) {
      expect(source).toMatch(/^https:\/\/developer\.paddle\.com\/webhooks\//);
    }
  });

  it('consumes the official transaction.completed paths and ignores buyer tier/user metadata', () => {
    const command = normalize('transaction-completed');
    expect(command).toMatchObject({
      kind: 'provision-period',
      eventType: 'transaction.completed',
      paddleCustomerId: 'ctm_01hv6y1jedq4p1n0yqn5ba3ky4',
      paddleSubscriptionId: 'sub_01hv8x29kz0t586xy6zn1a62ny',
      paddleTransactionId: 'txn_01hv8wptq8987qeep44cyrewp9',
      tier: SubscriptionTier.Pro,
      status: SubscriptionStatus.Active,
      periodStart: new Date('2024-04-12T10:18:47.635628Z'),
      periodEnd: new Date('2024-05-12T10:18:47.635628Z'),
      licenseClaimHash: 'a'.repeat(64),
    });
    expect(JSON.stringify(command)).not.toContain('client-controlled');
    expect(JSON.stringify(command)).not.toContain(SubscriptionTier.Enterprise);
  });

  it('uses the official required subscription.created transaction_id only as a validated link', () => {
    const raw = fixture('subscription-created');
    const data = raw['data'] as Record<string, unknown>;
    expect(data['transaction_id']).toBe('txn_01hv8wptq8987qeep44cyrewp9');

    const command = normalize('subscription-created');
    expect(command).toMatchObject({
      kind: 'sync-subscription',
      eventType: 'subscription.created',
      paddleCustomerId: 'ctm_01hv6y1jedq4p1n0yqn5ba3ky4',
      paddleSubscriptionId: 'sub_01hv8x29kz0t586xy6zn1a62ny',
      paddleTransactionId: 'txn_01hv8wptq8987qeep44cyrewp9',
      licenseClaimHash: 'a'.repeat(64),
      tier: SubscriptionTier.Pro,
      status: SubscriptionStatus.Active,
      periodStart: new Date('2024-04-12T10:18:47.635628Z'),
      periodEnd: new Date('2024-05-12T10:18:47.635628Z'),
    });
    expect(command.kind).toBe('sync-subscription');
  });

  it('consumes official subscription.updated fields without inventing transaction_id', () => {
    const raw = fixture('subscription-updated');
    const data = raw['data'] as Record<string, unknown>;
    expect(data).not.toHaveProperty('transaction_id');

    expect(normalize('subscription-updated')).toMatchObject({
      kind: 'sync-subscription',
      eventType: 'subscription.updated',
      paddleSubscriptionId: 'sub_01hv8x29kz0t586xy6zn1a62ny',
      status: SubscriptionStatus.Active,
      periodStart: new Date('2024-04-12T10:37:59.556997Z'),
      periodEnd: new Date('2024-05-12T10:37:59.556997Z'),
    });
  });

  it('accepts the official canceled null current_billing_period and preserves no invented period', () => {
    const raw = fixture('subscription-canceled');
    const data = raw['data'] as Record<string, unknown>;
    expect(data['current_billing_period']).toBeNull();
    expect(data).not.toHaveProperty('transaction_id');

    const command = normalize('subscription-canceled');
    expect(command).toMatchObject({
      kind: 'sync-subscription',
      eventType: 'subscription.canceled',
      paddleSubscriptionId: 'sub_01hv8x29kz0t586xy6zn1a62ny',
      status: SubscriptionStatus.Cancelled,
      cancelledAt: new Date('2024-04-12T11:24:54.868Z'),
    });
    expect(command).not.toHaveProperty('periodStart');
    expect(command).not.toHaveProperty('periodEnd');
  });

  it('fails closed when the canonical transaction fixture carries an unknown recurring price', () => {
    const raw = fixture('transaction-completed');
    const data = raw['data'] as Record<string, unknown>;
    const items = data['items'] as Array<Record<string, unknown>>;
    (items[0]['price'] as Record<string, unknown>)['id'] = 'pri_notconfigured';

    const result = normalizePaddleWebhook(
      {
        eventId: raw['event_id'] as string,
        eventType: raw['event_type'] as string,
        occurredAt: new Date(raw['occurred_at'] as string),
        data,
      },
      PRICES,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'UNKNOWN_PRICE' }),
    });
  });
});
