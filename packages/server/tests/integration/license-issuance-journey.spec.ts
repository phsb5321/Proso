// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Seeded in-memory purchase → HTTP claim → HTTP validation journey.
 *
 * This boots the real AppModule and route/guard graph over a listening socket.
 * Only persistence is replaced. It proves the key returned by the canonical
 * account-free claim transport is usable by the validation endpoint, and that
 * wrong/unknown claims are wire-identical and mint nothing.
 */

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  LICENSE_BY_TRANSACTION_PATH,
  LicenseClaimResponseSchema,
  SubscriptionTier,
  TIER_CREDITS,
} from '@proso/shared';
import { PrismaService } from '../../src/infrastructure/modules/prisma.module';
import { CreditRepositoryPort } from '../../src/ports/credit-repository.port';
import { LicenseKeyRepositoryPort } from '../../src/ports/license-key-repository.port';
import { SubscriptionRepositoryPort } from '../../src/ports/subscription-repository.port';
import { UserRepositoryPort } from '../../src/ports/user-repository.port';
import {
  InMemoryCreditRepository,
  InMemoryLicenseKeyRepository,
  InMemorySubscriptionRepository,
  InMemoryUserRepository,
} from '../helpers/in-memory-repositories';
import {
  CLAIM_SECRET,
  PERIOD_END,
  PERIOD_START,
  TRANSACTION_ID,
  makeSubscriptionRecord,
} from '../helpers/license-fixtures';

const USER_ID = 'user-who-paid';
const LICENSE_KEY_SECRET = 'j'.repeat(32);

interface Harness {
  app: INestApplication;
  baseUrl: string;
  licenseKeys: InMemoryLicenseKeyRepository;
  subscriptions: InMemorySubscriptionRepository;
  credits: InMemoryCreditRepository;
}

async function createHarness(): Promise<Harness> {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:5432/unused';
  process.env.JWT_SECRET = 'not-a-credential-for-this-in-memory-test';
  process.env.LICENSE_KEY_SECRET = LICENSE_KEY_SECRET;

  const { AppModule } = await import('../../src/app.module');
  const licenseKeys = new InMemoryLicenseKeyRepository();
  const subscriptions = new InMemorySubscriptionRepository();
  const credits = new InMemoryCreditRepository();
  const users = new InMemoryUserRepository(licenseKeys);
  users.seed(USER_ID);

  const prisma = {
    $connect: jest.fn(async () => undefined),
    $disconnect: jest.fn(async () => undefined),
    $queryRaw: jest.fn(async () => [{ ok: 1 }]),
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(UserRepositoryPort)
    .useValue(users)
    .overrideProvider(SubscriptionRepositoryPort)
    .useValue(subscriptions)
    .overrideProvider(CreditRepositoryPort)
    .useValue(credits)
    .overrideProvider(LicenseKeyRepositoryPort)
    .useValue(licenseKeys)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0, '127.0.0.1');

  return { app, baseUrl: await app.getUrl(), licenseKeys, subscriptions, credits };
}

async function seedPurchase(harness: Harness): Promise<void> {
  const subscription = await harness.subscriptions.save(
    makeSubscriptionRecord({ id: 'seeded-subscription', userId: USER_ID }),
  );
  await harness.credits.createAllocation({
    userId: USER_ID,
    subscriptionId: subscription.id,
    totalCredits: TIER_CREDITS[SubscriptionTier.Pro],
    remainingCredits: TIER_CREDITS[SubscriptionTier.Pro],
    periodStart: new Date(PERIOD_START),
    periodEnd: new Date(PERIOD_END),
  });
}

function claim(harness: Harness, transactionId: string, claimSecret: string): Promise<Response> {
  return fetch(`${harness.baseUrl}${LICENSE_BY_TRANSACTION_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId, claimSecret }),
  });
}

describe('licence issuance and claim foundation (real AppModule graph)', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.app.close();
  });

  it('returns a key that POST /api/v1/license/validate accepts as paid', async () => {
    await seedPurchase(harness);

    const claimedResponse = await claim(harness, TRANSACTION_ID, CLAIM_SECRET);
    expect(claimedResponse.status).toBe(200);
    const claimed = LicenseClaimResponseSchema.parse(await claimedResponse.json());
    if (claimed.status !== 'issued') throw new Error('expected issued');

    const validationResponse = await fetch(`${harness.baseUrl}/api/v1/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: claimed.licenseKey }),
    });
    const validated = await validationResponse.json();

    expect(validationResponse.status).toBe(200);
    expect(validated).toMatchObject({
      valid: true,
      tier: SubscriptionTier.Pro,
      credits: {
        total: TIER_CREDITS[SubscriptionTier.Pro],
        remaining: TIER_CREDITS[SubscriptionTier.Pro],
      },
    });
  });

  it('makes a wrong claim wire-identical to an unknown transaction and mints nothing', async () => {
    await seedPurchase(harness);

    const wrong = await claim(harness, TRANSACTION_ID, 'wrong-claim-secret');
    const unknown = await claim(harness, 'txn_unknown', CLAIM_SECRET);
    const wrongBody = await wrong.json();
    const unknownBody = await unknown.json();

    expect(wrong.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(wrongBody).toEqual(unknownBody);
    expect(LicenseClaimResponseSchema.parse(wrongBody)).toEqual({
      status: 'pending',
      retryAfterMs: 2_000,
    });
    expect(harness.licenseKeys.rows).toHaveLength(0);
  });

  it('returns the same key on claim replay and stores no plaintext key', async () => {
    await seedPurchase(harness);

    const first = LicenseClaimResponseSchema.parse(
      await (await claim(harness, TRANSACTION_ID, CLAIM_SECRET)).json(),
    );
    const second = LicenseClaimResponseSchema.parse(
      await (await claim(harness, TRANSACTION_ID, CLAIM_SECRET)).json(),
    );
    if (first.status !== 'issued' || second.status !== 'issued') {
      throw new Error('expected issued');
    }

    expect(second.licenseKey).toBe(first.licenseKey);
    expect(harness.licenseKeys.rows).toHaveLength(1);
    expect(JSON.stringify(harness.licenseKeys.rows)).not.toContain(first.licenseKey);
  });

  it('uses the canonical schema to reject a request without the claim secret', async () => {
    const response = await fetch(`${harness.baseUrl}${LICENSE_BY_TRANSACTION_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: TRANSACTION_ID }),
    });

    expect(response.status).toBe(400);
    expect(harness.licenseKeys.rows).toHaveLength(0);
  });

  it('registers the real throttler and advertises the five-per-minute limit', async () => {
    const responses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      responses.push(await claim(harness, `txn_rate_${attempt}`, CLAIM_SECRET));
    }

    expect(responses[0].headers.get('x-ratelimit-limit-long')).toBe('5');
    expect(responses.slice(0, 3).map((response) => response.status)).toEqual([202, 202, 202]);
    expect(responses[3].status).toBe(429);
  });
});
