import { SubscriptionStatus, SubscriptionTier, isErr, isOk, unwrapErr } from '@proso/shared';
import {
  isPaddleStateNewer,
  normalizePaddleWebhook,
  processPaddleWebhook,
} from '../../../../src/core/subscription/paddle-webhook.service';
import type {
  PaddleProvisioningCommand,
  PaddleProvisioningPort,
  WebhookEvent,
} from '../../../../src/ports/paddle-provisioning.port';

const CLAIM_HASH = 'a'.repeat(64);
const PRICES = {
  proMonthly: 'pri_promonth',
  proYearly: 'pri_proyear',
  enterpriseMonthly: 'pri_enterprisemonth',
  enterpriseYearly: 'pri_enterpriseyear',
};

function priceItem(
  id = PRICES.proMonthly,
  interval: 'month' | 'year' = 'month',
): Record<string, unknown> {
  return {
    recurring: true,
    price: { id, billing_cycle: { interval, frequency: 1 } },
  };
}

function transactionEvent(overrides: Record<string, unknown> = {}): WebhookEvent {
  return {
    eventId: 'evt_transaction000000000000000001',
    eventType: 'transaction.completed',
    occurredAt: new Date('2026-08-12T20:00:02.000Z'),
    data: {
      id: 'txn_purchase0000000000000000001',
      customer_id: 'ctm_buyer00000000000000000001',
      subscription_id: 'sub_purchase000000000000000001',
      custom_data: {
        license_claim_hash: CLAIM_HASH,
        user_id: 'attacker-chosen-user',
        tier: SubscriptionTier.Enterprise,
      },
      items: [priceItem()],
      billing_period: {
        starts_at: '2026-08-12T20:00:00.000Z',
        ends_at: '2026-09-12T20:00:00.000Z',
      },
      ...overrides,
    },
  };
}

function subscriptionEvent(overrides: Record<string, unknown> = {}): WebhookEvent {
  return {
    eventId: 'evt_subscription00000000000000001',
    eventType: 'subscription.created',
    occurredAt: new Date('2026-08-12T20:00:01.000Z'),
    data: {
      id: 'sub_purchase000000000000000001',
      transaction_id: 'txn_purchase0000000000000000001',
      customer_id: 'ctm_buyer00000000000000000001',
      status: 'active',
      custom_data: { license_claim_hash: CLAIM_HASH },
      items: [priceItem()],
      current_billing_period: {
        starts_at: '2026-08-12T20:00:00.000Z',
        ends_at: '2026-09-12T20:00:00.000Z',
      },
      ...overrides,
    },
  };
}

describe('normalizePaddleWebhook', () => {
  it('derives Pro from the exact price even when client custom_data claims Enterprise', () => {
    const result = normalizePaddleWebhook(transactionEvent(), PRICES);

    expect(isOk(result)).toBe(true);
    if (!isOk(result) || result.value.kind !== 'provision-period') return;
    expect(result.value).toMatchObject({
      paddleCustomerId: 'ctm_buyer00000000000000000001',
      tier: SubscriptionTier.Pro,
      paddleTransactionId: 'txn_purchase0000000000000000001',
      totalCredits: 500_000,
      licenseClaimHash: CLAIM_HASH,
    });
    expect(JSON.stringify(result.value)).not.toContain('attacker-chosen-user');
  });

  it('maps all four configured price ids and verifies their cadence', () => {
    const cases = [
      [PRICES.proMonthly, 'month', SubscriptionTier.Pro],
      [PRICES.proYearly, 'year', SubscriptionTier.Pro],
      [PRICES.enterpriseMonthly, 'month', SubscriptionTier.Enterprise],
      [PRICES.enterpriseYearly, 'year', SubscriptionTier.Enterprise],
    ] as const;

    for (const [priceId, interval, tier] of cases) {
      const result = normalizePaddleWebhook(
        transactionEvent({ items: [priceItem(priceId, interval)] }),
        PRICES,
      );
      expect(isOk(result)).toBe(true);
      if (isOk(result) && result.value.kind === 'provision-period') {
        expect(result.value.tier).toBe(tier);
      }
    }
  });

  it.each([
    ['unknown', [priceItem('pri_unknown')]],
    ['missing', []],
    ['mixed', [priceItem(PRICES.proMonthly), priceItem(PRICES.enterpriseMonthly)]],
  ])('rejects a %s recurring price selection', (_case, items) => {
    const result = normalizePaddleWebhook(transactionEvent({ items }), PRICES);
    expect(isErr(result)).toBe(true);
  });

  it('rejects a missing or duplicate operator price mapping', () => {
    expect(isErr(normalizePaddleWebhook(transactionEvent(), { ...PRICES, proMonthly: '' }))).toBe(
      true,
    );
    expect(
      isErr(
        normalizePaddleWebhook(transactionEvent(), {
          ...PRICES,
          enterpriseMonthly: PRICES.proMonthly,
        }),
      ),
    ).toBe(true);
  });

  it('stages the canonical subscription.created transaction/claim pair but waits to fulfil', () => {
    const result = normalizePaddleWebhook(subscriptionEvent(), PRICES);
    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'sync-subscription',
        paddleSubscriptionId: 'sub_purchase000000000000000001',
        paddleTransactionId: 'txn_purchase0000000000000000001',
        licenseClaimHash: CLAIM_HASH,
      },
    });
  });

  it('rejects malformed claim hashes, periods, statuses, and Paddle identities', () => {
    const cases = [
      transactionEvent({ custom_data: { license_claim_hash: CLAIM_HASH.toUpperCase() } }),
      transactionEvent({ customer_id: 'not-a-customer' }),
      transactionEvent({ billing_period: { starts_at: 'bad', ends_at: 'also-bad' } }),
      subscriptionEvent({ status: 'unknown-status' }),
    ];
    for (const event of cases) expect(isErr(normalizePaddleWebhook(event, PRICES))).toBe(true);
  });

  it('records an unsupported authentic event without requiring price configuration', () => {
    const event = { ...transactionEvent(), eventType: 'customer.updated' };
    expect(normalizePaddleWebhook(event, { ...PRICES, proMonthly: '' })).toEqual({
      ok: true,
      value: {
        kind: 'unsupported',
        eventId: event.eventId,
        eventType: 'customer.updated',
        occurredAt: event.occurredAt,
      },
    });
  });
});

describe('processPaddleWebhook', () => {
  it('passes only a hash-only key candidate to persistence', async () => {
    const process = jest.fn(async () => ({ ok: true, value: { status: 'processed' as const } }));
    const port = { process } as unknown as PaddleProvisioningPort;

    const result = await processPaddleWebhook(
      transactionEvent(),
      { ...PRICES, licenseKeySecret: 's'.repeat(32), nodeEnv: 'test' },
      port,
      () => new Date('2026-08-12T20:00:03.000Z'),
    );

    expect(isOk(result)).toBe(true);
    const [command, candidate] = process.mock.calls[0] as [PaddleProvisioningCommand, unknown];
    expect(command.kind).toBe('provision-period');
    expect(candidate).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f]{64}$/),
      keyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      activatedAt: new Date('2026-08-12T20:00:03.000Z'),
    });
    expect(JSON.stringify(candidate)).not.toContain('proso_test_');
  });

  it('fails before persistence when the licence derivation secret is weak', async () => {
    const process = jest.fn();
    const result = await processPaddleWebhook(
      transactionEvent(),
      { ...PRICES, licenseKeySecret: 'short', nodeEnv: 'test' },
      { process } as unknown as PaddleProvisioningPort,
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(unwrapErr(result).code).toBe('LICENSE_CONFIGURATION');
    expect(process).not.toHaveBeenCalled();
  });
});

describe('isPaddleStateNewer', () => {
  it('rejects older state and gives cancellation deterministic precedence at equal time', () => {
    const stored = {
      occurredAt: new Date('2026-08-12T20:00:02.000Z'),
      eventType: 'transaction.completed',
      eventId: 'evt_b',
    };
    expect(
      isPaddleStateNewer(
        {
          occurredAt: new Date('2026-08-12T20:00:01.000Z'),
          eventType: 'subscription.created',
          eventId: 'evt_a',
        },
        stored,
      ),
    ).toBe(false);
    expect(
      isPaddleStateNewer(
        {
          occurredAt: stored.occurredAt,
          eventType: 'subscription.canceled',
          eventId: 'evt_a',
        },
        stored,
      ),
    ).toBe(true);
  });

  it('uses event id as the stable final tie-break for equal type and timestamp', () => {
    const occurredAt = new Date('2026-08-12T20:00:02.000Z');
    const stored = {
      occurredAt,
      eventType: 'subscription.updated',
      eventId: 'evt_equal_b',
    };

    expect(
      isPaddleStateNewer(
        { occurredAt, eventType: 'subscription.updated', eventId: 'evt_equal_c' },
        stored,
      ),
    ).toBe(true);
    expect(
      isPaddleStateNewer(
        { occurredAt, eventType: 'subscription.updated', eventId: 'evt_equal_a' },
        stored,
      ),
    ).toBe(false);
    expect(
      isPaddleStateNewer(
        { occurredAt, eventType: 'subscription.updated', eventId: 'evt_equal_b' },
        stored,
      ),
    ).toBe(false);
  });

  it('normalizes cancellation to cancelled without allocating a new period', () => {
    const event: WebhookEvent = {
      ...subscriptionEvent({ status: undefined, canceled_at: '2026-08-20T00:00:00.000Z' }),
      eventId: 'evt_cancel000000000000000000001',
      eventType: 'subscription.canceled',
      occurredAt: new Date('2026-08-20T00:00:01.000Z'),
    };
    const result = normalizePaddleWebhook(event, PRICES);
    expect(result).toMatchObject({
      ok: true,
      value: { kind: 'sync-subscription', status: SubscriptionStatus.Cancelled },
    });
  });
});
