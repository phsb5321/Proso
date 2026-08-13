// Credential-field contract for PrismaSubscriptionRepository.
//
// Live persistence is covered by the existing PostgreSQL contract suite. These
// checks pin exact boundary validation and query shape without defining any
// Paddle event handling.

import { PrismaSubscriptionRepository } from '../../../../src/adapters/persistence/prisma-subscription.repository';
import type { PrismaService } from '../../../../src/infrastructure/modules/prisma.module';
import { CLAIM_HASH, makeSubscriptionRecord } from '../../../helpers/license-fixtures';

function createReturning(id: string) {
  return jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      ...makeSubscriptionRecord(),
      ...data,
      id,
      paddleTransactionId: data.paddleTransactionId ?? null,
      licenseClaimHash: data.licenseClaimHash ?? null,
      paddleLastTransactionId: data.paddleLastTransactionId ?? null,
      paddleOccurredAt: data.paddleOccurredAt ?? null,
      paddleEventType: data.paddleEventType ?? null,
      paddleEventId: data.paddleEventId ?? null,
      cancelledAt: null,
    }),
  );
}

function makeRepository(overrides: Record<string, jest.Mock> = {}) {
  const prisma = {
    subscription: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      ...overrides,
    },
  } as unknown as PrismaService;
  return new PrismaSubscriptionRepository(prisma);
}

describe('PrismaSubscriptionRepository claim fields', () => {
  it('persists the credential beside its routing transaction id', async () => {
    const create = createReturning('sub-1');
    const repository = makeRepository({ create });
    const record = makeSubscriptionRecord();

    await repository.save(record);

    const { data } = create.mock.calls[0][0];
    expect(data.paddleTransactionId).toBe(record.paddleTransactionId);
    expect(data.licenseClaimHash).toBe(record.licenseClaimHash);
  });

  it.each([
    ['not hex at all', 'not-a-sha-256-digest'],
    ['uppercase hex', CLAIM_HASH.toUpperCase()],
    ['truncated digest', CLAIM_HASH.slice(0, 63)],
    ['over-long digest', `${CLAIM_HASH}00`],
    ['empty string', ''],
  ])('rejects %s instead of persisting arbitrary credential text', async (_label, supplied) => {
    const create = createReturning('sub-1');
    const repository = makeRepository({ create });

    await expect(
      repository.save(makeSubscriptionRecord({ licenseClaimHash: supplied })),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a malformed claim hash on update before touching Prisma', async () => {
    const update = jest.fn();
    const repository = makeRepository({ update });

    await expect(repository.update('sub-1', { licenseClaimHash: 'nonsense' })).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('persists a canonical claim hash on update', async () => {
    const update = jest.fn().mockResolvedValue({
      ...makeSubscriptionRecord(),
      paddleTransactionId: null,
      licenseClaimHash: CLAIM_HASH,
      paddleLastTransactionId: null,
      paddleOccurredAt: null,
      paddleEventType: null,
      paddleEventId: null,
      cancelledAt: null,
    });
    const repository = makeRepository({ update });

    await repository.update('sub-1', { licenseClaimHash: CLAIM_HASH });

    expect(update.mock.calls[0][0].data.licenseClaimHash).toBe(CLAIM_HASH);
  });

  it('uses the unique transaction id only as a routing lookup', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const repository = makeRepository({ findUnique });

    await repository.findByPaddleTransactionId('txn_lookup');

    expect(findUnique).toHaveBeenCalledWith({ where: { paddleTransactionId: 'txn_lookup' } });
  });
});
