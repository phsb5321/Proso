import { createHash, createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  LICENSE_BY_TRANSACTION_PATH,
  LicenseClaimResponseSchema,
  SubscriptionStatus,
  SubscriptionTier,
  TIER_CREDITS,
} from '@proso/shared';
import { PrismaPaddleProvisioner } from '../../src/adapters/persistence/prisma-paddle-provisioner';
import { PrismaService } from '../../src/infrastructure/modules/prisma.module';
import { PaddleProvisioningPort } from '../../src/ports/paddle-provisioning.port';
import {
  cleanupTestData,
  createTestPrismaService,
  teardownTestPrisma,
} from '../helpers/test-prisma';

jest.setTimeout(30_000);

const WEBHOOK_SECRET = 'paddle-webhook-secret-for-real-http-tests';
const LICENSE_KEY_SECRET = 'license-key-secret-for-real-http-tests';
const CLAIM_SECRET = 'purchase-claim-secret-for-real-http-tests';
const CLAIM_HASH = createHash('sha256').update(CLAIM_SECRET).digest('hex');
const ROTATED_CLAIM_HASH = createHash('sha256').update('conflicting-claim').digest('hex');
const PRICES = {
  proMonthly: 'pri_promonth',
  proYearly: 'pri_proyear',
  enterpriseMonthly: 'pri_enterprisemonth',
  enterpriseYearly: 'pri_enterpriseyear',
};
const CUSTOMER_ID = 'ctm_realbuyer000000000000000001';
const SUBSCRIPTION_ID = 'sub_realpurchase0000000000000001';
const TRANSACTION_ID = 'txn_realpurchase0000000000000001';
const PERIOD_START = '2026-08-12T20:00:00.000Z';
const PERIOD_END = '2026-09-12T20:00:00.000Z';

interface Harness {
  readonly app: INestApplication;
  readonly baseUrl: string;
  readonly prisma: PrismaService;
}

class FaultBeforeCommitProvisioner extends PrismaPaddleProvisioner {
  fail = true;

  protected override async beforeCommit(): Promise<void> {
    if (this.fail) throw new Error('injected failure before commit');
  }
}

function config(prisma: PrismaService): ConfigService {
  return {
    get: (key: string) =>
      ({
        'app.paddleWebhookSecret': WEBHOOK_SECRET,
        'app.paddlePriceProMonthly': PRICES.proMonthly,
        'app.paddlePriceProYearly': PRICES.proYearly,
        'app.paddlePriceEnterpriseMonthly': PRICES.enterpriseMonthly,
        'app.paddlePriceEnterpriseYearly': PRICES.enterpriseYearly,
        'app.licenseKeySecret': LICENSE_KEY_SECRET,
        'app.nodeEnv': 'test',
        'app.lokiHost': '',
        DATABASE_URL: prisma,
      })[key],
  } as unknown as ConfigService;
}

async function createHarness(
  fault = false,
): Promise<Harness & { fault?: FaultBeforeCommitProvisioner }> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:5432/unused';
  process.env.LICENSE_KEY_SECRET = LICENSE_KEY_SECRET;
  const prisma = await createTestPrismaService();
  const { AppModule } = await import('../../src/app.module');
  const faultProvisioner = fault ? new FaultBeforeCommitProvisioner(prisma) : undefined;

  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(ConfigService)
    .useValue(config(prisma));
  if (faultProvisioner) {
    builder.overrideProvider(PaddleProvisioningPort).useValue(faultProvisioner);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  await app.listen(0, '127.0.0.1');
  return {
    app,
    baseUrl: await app.getUrl(),
    prisma,
    ...(faultProvisioner ? { fault: faultProvisioner } : {}),
  };
}

function transactionEvent(
  eventId = 'evt_transactionreal000000000000001',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    event_id: eventId,
    event_type: 'transaction.completed',
    occurred_at: '2026-08-12T20:00:02.000Z',
    data: {
      id: TRANSACTION_ID,
      customer_id: CUSTOMER_ID,
      subscription_id: SUBSCRIPTION_ID,
      custom_data: {
        license_claim_hash: CLAIM_HASH,
        user_id: 'client-controlled-user',
        tier: SubscriptionTier.Enterprise,
      },
      items: [
        {
          recurring: true,
          price: {
            id: PRICES.proMonthly,
            billing_cycle: { interval: 'month', frequency: 1 },
          },
        },
      ],
      billing_period: { starts_at: PERIOD_START, ends_at: PERIOD_END },
      ...overrides,
    },
  };
}

function subscriptionEvent(
  eventId = 'evt_subscriptionreal0000000000001',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    event_id: eventId,
    event_type: 'subscription.created',
    occurred_at: '2026-08-12T20:00:01.000Z',
    data: {
      id: SUBSCRIPTION_ID,
      transaction_id: TRANSACTION_ID,
      customer_id: CUSTOMER_ID,
      status: 'active',
      custom_data: { license_claim_hash: CLAIM_HASH },
      items: [
        {
          recurring: true,
          price: {
            id: PRICES.proMonthly,
            billing_cycle: { interval: 'month', frequency: 1 },
          },
        },
      ],
      current_billing_period: { starts_at: PERIOD_START, ends_at: PERIOD_END },
      ...overrides,
    },
  };
}

function sign(rawBody: Buffer, timestampSeconds = Math.floor(Date.now() / 1_000)): string {
  const digest = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestampSeconds}:`)
    .update(rawBody)
    .digest('hex');
  return `ts=${timestampSeconds};h1=${digest}`;
}

function deliver(harness: Harness, event: Record<string, unknown>): Promise<Response> {
  const rawBody = Buffer.from(JSON.stringify(event));
  return fetch(`${harness.baseUrl}/webhooks/paddle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Paddle-Signature': sign(rawBody),
    },
    body: rawBody,
  });
}

async function snapshot(prisma: PrismaService) {
  return {
    users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
    subscriptions: await prisma.subscription.findMany({ orderBy: { id: 'asc' } }),
    allocations: await prisma.creditAllocation.findMany({ orderBy: { id: 'asc' } }),
    licenseKeys: await prisma.licenseKey.findMany({ orderBy: { id: 'asc' } }),
    events: await prisma.paddleWebhookEvent.findMany({ orderBy: { eventId: 'asc' } }),
  };
}

async function expectPairlessState(harness: Harness, processedEventId: string): Promise<void> {
  const state = await snapshot(harness.prisma);
  expect(state.subscriptions).toEqual([
    expect.objectContaining({ paddleTransactionId: null, licenseClaimHash: null }),
  ]);
  expect(state.allocations).toHaveLength(0);
  expect(state.licenseKeys).toHaveLength(0);
  expect(state.events).toEqual([expect.objectContaining({ eventId: processedEventId })]);
}

async function claimAndValidate(harness: Harness): Promise<void> {
  const claimedResponse = await fetch(`${harness.baseUrl}${LICENSE_BY_TRANSACTION_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId: TRANSACTION_ID, claimSecret: CLAIM_SECRET }),
  });
  expect(claimedResponse.status).toBe(200);
  const claimed = LicenseClaimResponseSchema.parse(await claimedResponse.json());
  if (claimed.status !== 'issued') throw new Error('expected issued licence');

  const validation = await fetch(`${harness.baseUrl}/api/v1/license/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey: claimed.licenseKey }),
  });
  expect(validation.status).toBe(200);
  expect(await validation.json()).toMatchObject({
    valid: true,
    tier: SubscriptionTier.Pro,
    credits: {
      total: TIER_CREDITS[SubscriptionTier.Pro],
      remaining: TIER_CREDITS[SubscriptionTier.Pro],
    },
  });
}

describe('Paddle provisioning (real AppModule, raw HTTP, PostgreSQL)', () => {
  let harness: Harness | undefined;

  afterEach(async () => {
    if (harness) {
      await harness.app.close();
      await cleanupTestData(harness.prisma);
      harness = undefined;
    }
  });

  afterAll(async () => {
    await teardownTestPrisma();
  });

  it('provisions one retrievable paid licence from exact signed bytes', async () => {
    harness = await createHarness();

    const originalEvent = transactionEvent();
    const originalBody = Buffer.from(JSON.stringify(originalEvent));
    const mutatedBody = Buffer.from(originalBody);
    const mutationIndex = mutatedBody.indexOf(Buffer.from(CUSTOMER_ID));
    if (mutationIndex < 0) throw new Error('customer id missing from signed fixture');
    mutatedBody[mutationIndex + CUSTOMER_ID.length - 1] = '2'.charCodeAt(0);
    const rejected = await fetch(`${harness.baseUrl}/webhooks/paddle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Paddle-Signature': sign(originalBody),
      },
      body: mutatedBody,
    });
    expect(rejected.status).toBe(403);

    const staleBody = Buffer.from(JSON.stringify(originalEvent));
    const staleTimestamp = Math.floor(Date.now() / 1_000) - 6;
    const stale = await fetch(`${harness.baseUrl}/webhooks/paddle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Paddle-Signature': sign(staleBody, staleTimestamp),
      },
      body: staleBody,
    });
    expect(stale.status).toBe(403);
    expect(await snapshot(harness.prisma)).toMatchObject({ events: [] });

    const validBody = Buffer.from(JSON.stringify(originalEvent));
    const timestamp = Math.floor(Date.now() / 1_000);
    const validSignature = sign(validBody, timestamp);
    const rotated = await fetch(`${harness.baseUrl}/webhooks/paddle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Paddle-Signature': `ts=${timestamp};h1=${'0'.repeat(64)};h1=${validSignature.split('h1=')[1]}`,
      },
      body: validBody,
    });
    expect(rotated.status).toBe(200);
    const state = await snapshot(harness.prisma);
    expect(state.users).toHaveLength(1);
    expect(state.users[0]).toMatchObject({ paddleCustomerId: CUSTOMER_ID, licenseKey: null });
    expect(state.subscriptions).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({
      paddleSubscriptionId: SUBSCRIPTION_ID,
      paddleTransactionId: TRANSACTION_ID,
      tier: SubscriptionTier.Pro,
    });
    expect(state.allocations).toHaveLength(1);
    expect(state.allocations[0]).toMatchObject({
      paddleTransactionId: TRANSACTION_ID,
      totalCredits: TIER_CREDITS[SubscriptionTier.Pro],
    });
    expect(state.licenseKeys).toHaveLength(1);
    expect(state.licenseKeys[0].keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.events).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain('proso_test_');
    expect(JSON.stringify(state)).not.toContain('client-controlled-user');

    await claimAndValidate(harness);
  }, 60_000);

  it('persists idempotency across an application restart', async () => {
    harness = await createHarness();
    const event = transactionEvent();
    expect((await deliver(harness, event)).status).toBe(200);
    await harness.app.close();

    harness = await createHarness();
    expect((await deliver(harness, event)).status).toBe(200);
    const state = await snapshot(harness.prisma);
    expect(state.events).toHaveLength(1);
    expect(state.allocations).toHaveLength(1);
    expect(state.licenseKeys).toHaveLength(1);
  }, 60_000);

  it('rolls every write back on a pre-commit fault and succeeds on retry', async () => {
    const faultHarness = await createHarness(true);
    harness = faultHarness;

    expect((await deliver(harness, transactionEvent())).status).toBe(503);
    expect(await snapshot(harness.prisma)).toMatchObject({
      users: [],
      subscriptions: [],
      allocations: [],
      licenseKeys: [],
      events: [],
    });

    faultHarness.fault!.fail = false;
    expect((await deliver(harness, transactionEvent())).status).toBe(200);
    expect((await snapshot(harness.prisma)).events).toHaveLength(1);
  }, 60_000);

  it('durably records and acknowledges an unsupported authentic event', async () => {
    harness = await createHarness();
    const unsupported = {
      event_id: 'evt_customerupdate0000000000000001',
      event_type: 'customer.updated',
      occurred_at: '2026-08-12T20:00:00.000Z',
      data: { id: CUSTOMER_ID },
    };

    expect((await deliver(harness, unsupported)).status).toBe(200);
    expect((await deliver(harness, unsupported)).status).toBe(200);
    expect(await snapshot(harness.prisma)).toMatchObject({
      users: [],
      subscriptions: [],
      allocations: [],
      licenseKeys: [],
      events: [expect.objectContaining({ eventId: unsupported.event_id })],
    });
  }, 60_000);

  it('returns 5xx with no rows for an unknown price rather than defaulting Pro', async () => {
    harness = await createHarness();
    const event = transactionEvent('evt_unknownprice0000000000000001', {
      items: [
        {
          recurring: true,
          price: {
            id: 'pri_notconfigured',
            billing_cycle: { interval: 'month', frequency: 1 },
          },
        },
      ],
    });

    expect((await deliver(harness, event)).status).toBe(503);
    const rejectedState = await snapshot(harness.prisma);
    expect(Object.values(rejectedState).every((rows) => rows.length === 0)).toBe(true);
  }, 60_000);

  it.each([
    ['transaction then subscription', [transactionEvent(), subscriptionEvent()]],
    ['subscription then transaction', [subscriptionEvent(), transactionEvent()]],
  ])(
    'converges when delivered %s',
    async (_name, events) => {
      harness = await createHarness();
      for (const event of events) expect((await deliver(harness, event)).status).toBe(200);

      const state = await snapshot(harness.prisma);
      expect(state.users).toHaveLength(1);
      expect(state.subscriptions).toHaveLength(1);
      expect(state.allocations).toHaveLength(1);
      expect(state.licenseKeys).toHaveLength(1);
      expect(state.events).toHaveLength(2);
      expect(state.subscriptions[0]).toMatchObject({
        tier: SubscriptionTier.Pro,
        status: SubscriptionStatus.Active,
        paddleTransactionId: TRANSACTION_ID,
        licenseClaimHash: CLAIM_HASH,
        paddleOccurredAt: new Date('2026-08-12T20:00:02.000Z'),
      });
    },
    60_000,
  );

  it('atomically fills a pairless created subscription from a completed canonical pair', async () => {
    const faultHarness = await createHarness(true);
    harness = faultHarness;
    const pairlessCreated = subscriptionEvent('evt_pairlesscreated00000000000001', {
      custom_data: null,
    });
    const completedWithPair = transactionEvent('evt_pairfillcompleted000000000001');

    faultHarness.fault!.fail = false;
    expect((await deliver(harness, pairlessCreated)).status).toBe(200);
    await expectPairlessState(harness, pairlessCreated.event_id as string);

    faultHarness.fault!.fail = true;
    expect((await deliver(harness, completedWithPair)).status).toBe(503);
    await expectPairlessState(harness, pairlessCreated.event_id as string);

    faultHarness.fault!.fail = false;
    expect((await deliver(harness, completedWithPair)).status).toBe(200);
    expect((await deliver(harness, completedWithPair)).status).toBe(200);
    const completed = await snapshot(harness.prisma);
    expect(completed.subscriptions).toEqual([
      expect.objectContaining({
        paddleTransactionId: TRANSACTION_ID,
        licenseClaimHash: CLAIM_HASH,
      }),
    ]);
    expect(completed.allocations).toEqual([
      expect.objectContaining({ paddleTransactionId: TRANSACTION_ID }),
    ]);
    expect(completed.licenseKeys).toEqual([expect.objectContaining({ isActive: true })]);
    expect(completed.events).toHaveLength(2);
    await claimAndValidate(harness);
  }, 60_000);

  it('keeps pairless provisioning retryable when the completed event has no claim hash', async () => {
    harness = await createHarness();
    const pairlessCreated = subscriptionEvent('evt_pairlessincompletecreated000001', {
      custom_data: null,
    });
    const incompleteCompletion = transactionEvent('evt_pairlessincompletecompleted0001', {
      custom_data: null,
    });

    expect((await deliver(harness, pairlessCreated)).status).toBe(200);
    expect((await deliver(harness, incompleteCompletion)).status).toBe(503);
    await expectPairlessState(harness, pairlessCreated.event_id as string);
  }, 60_000);

  it('lets subscription.created stage state but not credits or a licence before completion', async () => {
    harness = await createHarness();
    expect((await deliver(harness, subscriptionEvent())).status).toBe(200);

    const beforeCompletion = await snapshot(harness.prisma);
    expect(beforeCompletion.users).toHaveLength(1);
    expect(beforeCompletion.subscriptions).toHaveLength(1);
    expect(beforeCompletion.subscriptions[0]).toMatchObject({
      paddleTransactionId: TRANSACTION_ID,
      licenseClaimHash: CLAIM_HASH,
    });
    expect(beforeCompletion.allocations).toHaveLength(0);
    expect(beforeCompletion.licenseKeys).toHaveLength(0);

    expect((await deliver(harness, transactionEvent())).status).toBe(200);
    expect(await snapshot(harness.prisma)).toMatchObject({
      allocations: [expect.objectContaining({ paddleTransactionId: TRANSACTION_ID })],
      licenseKeys: [expect.objectContaining({ isActive: true })],
    });
  }, 60_000);

  it('rejects a conflicting transaction/claim pair without overwriting the stored pair', async () => {
    harness = await createHarness();
    expect((await deliver(harness, transactionEvent())).status).toBe(200);

    const conflict = transactionEvent('evt_claimconflict0000000000000001', {
      custom_data: { license_claim_hash: ROTATED_CLAIM_HASH },
    });
    expect((await deliver(harness, conflict)).status).toBe(503);

    const subscription = await harness.prisma.subscription.findUniqueOrThrow({
      where: { paddleSubscriptionId: SUBSCRIPTION_ID },
    });
    expect(subscription).toMatchObject({
      paddleTransactionId: TRANSACTION_ID,
      licenseClaimHash: CLAIM_HASH,
    });
    expect(await harness.prisma.paddleWebhookEvent.count()).toBe(1);
    expect(await harness.prisma.creditAllocation.count()).toBe(1);
  }, 60_000);

  it('allocates exactly once for each distinct completed renewal transaction', async () => {
    harness = await createHarness();
    expect((await deliver(harness, transactionEvent())).status).toBe(200);

    const renewalTransaction = 'txn_renewal000000000000000000001';
    const renewal = transactionEvent('evt_renewal00000000000000000001', {
      id: renewalTransaction,
      custom_data: { license_claim_hash: CLAIM_HASH },
      billing_period: {
        starts_at: '2026-09-12T20:00:00.000Z',
        ends_at: '2026-10-12T20:00:00.000Z',
      },
    });
    renewal.occurred_at = '2026-09-12T20:00:02.000Z';

    expect((await deliver(harness, renewal)).status).toBe(200);
    expect((await deliver(harness, renewal)).status).toBe(200);

    const allocations = await harness.prisma.creditAllocation.findMany({
      orderBy: { periodStart: 'asc' },
    });
    expect(allocations).toHaveLength(2);
    expect(allocations.map((allocation) => allocation.paddleTransactionId)).toEqual([
      TRANSACTION_ID,
      renewalTransaction,
    ]);
    const subscription = await harness.prisma.subscription.findUniqueOrThrow({
      where: { paddleSubscriptionId: SUBSCRIPTION_ID },
    });
    expect(subscription).toMatchObject({
      paddleTransactionId: TRANSACTION_ID,
      licenseClaimHash: CLAIM_HASH,
      paddleLastTransactionId: renewalTransaction,
    });
    expect(await harness.prisma.licenseKey.count()).toBe(1);
  }, 60_000);

  it('does not let an older event regress newer status or paid period', async () => {
    harness = await createHarness();
    expect((await deliver(harness, transactionEvent())).status).toBe(200);

    const canceled = {
      ...subscriptionEvent('evt_cancelnewer000000000000000001', {
        canceled_at: '2026-08-20T00:00:00.000Z',
        current_billing_period: null,
      }),
      event_type: 'subscription.canceled',
      occurred_at: '2026-08-20T00:00:01.000Z',
    };
    expect((await deliver(harness, canceled)).status).toBe(200);

    const olderUpdate = {
      ...subscriptionEvent('evt_updateolder000000000000000001', { status: 'active' }),
      event_type: 'subscription.updated',
      occurred_at: '2026-08-13T00:00:00.000Z',
    };
    expect((await deliver(harness, olderUpdate)).status).toBe(200);

    const subscription = await harness.prisma.subscription.findUniqueOrThrow({
      where: { paddleSubscriptionId: SUBSCRIPTION_ID },
    });
    expect(subscription.status).toBe(SubscriptionStatus.Cancelled);
    // Paddle's canonical canceled payload has a null current_billing_period;
    // preserve the last paid period rather than inventing replacement dates.
    expect(subscription.currentPeriodEnd.toISOString()).toBe(PERIOD_END);
    expect(await harness.prisma.creditAllocation.count()).toBe(1);
  }, 60_000);
});
