// Unit tests for the account-free licence claim rule.
//
// The transaction id routes; the buyer-generated claim secret authorises.
// `_ptxn` reaches browser history and logs, so the id alone must never yield a
// reusable key.

import {
  ErrorCode,
  LicenseClaimHashSchema,
  SubscriptionTier,
  isOk,
  unwrapErr,
} from '@proso/shared';
import { hashClaimSecret } from '../../../../src/core/subscription/license-key';
import {
  type LicenseClaimDeps,
  claimLicenseByTransaction,
} from '../../../../src/core/subscription/license-retrieval.service';
import type { SubscriptionRecord } from '../../../../src/ports/subscription-repository.port';
import {
  InMemoryLicenseKeyRepository,
  InMemorySubscriptionRepository,
} from '../../../helpers/in-memory-repositories';
import {
  CLAIM_HASH,
  CLAIM_SECRET,
  TRANSACTION_ID,
  makeSubscriptionRecord,
} from '../../../helpers/license-fixtures';

const SECRET = 'c'.repeat(32);

async function makeDeps(
  subscription: SubscriptionRecord | null = makeSubscriptionRecord(),
): Promise<LicenseClaimDeps & { licenseKeyRepository: InMemoryLicenseKeyRepository }> {
  const subscriptionRepository = new InMemorySubscriptionRepository();
  if (subscription) await subscriptionRepository.save(subscription);

  return {
    subscriptionRepository,
    licenseKeyRepository: new InMemoryLicenseKeyRepository(),
    secret: SECRET,
    environment: 'test',
  };
}

function expectPending(result: Awaited<ReturnType<typeof claimLicenseByTransaction>>): void {
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) return;
  expect(result.value).toEqual({ status: 'pending', retryAfterMs: 2_000 });
}

describe('claimLicenseByTransaction', () => {
  it('issues the key when the claim secret proves the purchase', async () => {
    const deps = await makeDeps();

    const result = await claimLicenseByTransaction(TRANSACTION_ID, CLAIM_SECRET, deps);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.status).toBe('issued');
    if (result.value.status !== 'issued') return;
    expect(result.value.licenseKey).toMatch(/^proso_test_[0-9a-f]{64}$/);
    expect(result.value.tier).toBe(SubscriptionTier.Pro);
  });

  it('never returns a key to a holder of the transaction id alone', async () => {
    const deps = await makeDeps();

    const result = await claimLicenseByTransaction(TRANSACTION_ID, 'not-the-claim-secret', deps);

    expectPending(result);
    expect(JSON.stringify(result)).not.toContain('proso_test_');
    expect(deps.licenseKeyRepository.rows).toHaveLength(0);
  });

  it('rejects a claim secret that only differs in its last character', async () => {
    const deps = await makeDeps();
    const nearMiss = `${CLAIM_SECRET.slice(0, -1)}${CLAIM_SECRET.endsWith('8') ? '9' : '8'}`;

    expectPending(await claimLicenseByTransaction(TRANSACTION_ID, nearMiss, deps));
  });

  it('answers a wrong claim exactly like an unknown transaction', async () => {
    const wrongDeps = await makeDeps();
    const unknownDeps = await makeDeps(null);

    const wrong = await claimLicenseByTransaction(TRANSACTION_ID, 'wrong', wrongDeps);
    const unknown = await claimLicenseByTransaction('txn_unknown', CLAIM_SECRET, unknownDeps);

    if (!isOk(wrong) || !isOk(unknown)) throw new Error('expected Ok(pending)');
    expect(wrong.value).toEqual(unknown.value);
    expect(wrongDeps.licenseKeyRepository.rows).toHaveLength(0);
    expect(unknownDeps.licenseKeyRepository.rows).toHaveLength(0);
  });

  it('fails closed for a purchase carrying no claim hash', async () => {
    const deps = await makeDeps(makeSubscriptionRecord({ licenseClaimHash: undefined }));

    expectPending(await claimLicenseByTransaction(TRANSACTION_ID, CLAIM_SECRET, deps));
    expect(deps.licenseKeyRepository.rows).toHaveLength(0);
  });

  it.each([
    ['not hex at all', 'not-a-sha-256-digest'],
    ['uppercase hex', hashClaimSecret(CLAIM_SECRET).toUpperCase()],
    ['truncated digest', hashClaimSecret(CLAIM_SECRET).slice(0, 63)],
    ['empty string', ''],
  ])('fails closed when the stored claim hash is %s', async (_label, stored) => {
    const deps = await makeDeps(makeSubscriptionRecord({ licenseClaimHash: stored }));

    expectPending(await claimLicenseByTransaction(TRANSACTION_ID, CLAIM_SECRET, deps));
    expect(deps.licenseKeyRepository.rows).toHaveLength(0);
  });

  it('accepts the canonical lowercase-hex SHA-256 digest', async () => {
    const deps = await makeDeps();
    expect(LicenseClaimHashSchema.safeParse(CLAIM_HASH).success).toBe(true);

    const result = await claimLicenseByTransaction(TRANSACTION_ID, CLAIM_SECRET, deps);

    expect(isOk(result)).toBe(true);
  });

  it('does not let the Paddle subscription id replace the routing transaction id', async () => {
    const subscription = makeSubscriptionRecord();
    const deps = await makeDeps(subscription);

    const result = await claimLicenseByTransaction(
      subscription.paddleSubscriptionId as string,
      CLAIM_SECRET,
      deps,
    );

    expectPending(result);
  });

  it('issues on demand when the proven purchase has no key', async () => {
    const deps = await makeDeps();
    expect(deps.licenseKeyRepository.rows).toHaveLength(0);

    const result = await claimLicenseByTransaction(TRANSACTION_ID, CLAIM_SECRET, deps);

    expect(isOk(result)).toBe(true);
    expect(deps.licenseKeyRepository.rows).toHaveLength(1);
  });

  it('returns the same key when the success page is reloaded', async () => {
    const deps = await makeDeps();

    const first = await claimLicenseByTransaction(TRANSACTION_ID, CLAIM_SECRET, deps);
    const second = await claimLicenseByTransaction(TRANSACTION_ID, CLAIM_SECRET, deps);

    if (!isOk(first) || !isOk(second)) throw new Error('expected Ok');
    if (first.value.status !== 'issued' || second.value.status !== 'issued') {
      throw new Error('expected issued');
    }
    expect(second.value.licenseKey).toBe(first.value.licenseKey);
    expect(deps.licenseKeyRepository.rows).toHaveLength(1);
  });

  it('surfaces a weak derivation secret as a server-side error', async () => {
    const deps = await makeDeps();

    const result = await claimLicenseByTransaction(TRANSACTION_ID, CLAIM_SECRET, {
      ...deps,
      secret: 'short',
    });

    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(unwrapErr(result).code).toBe(ErrorCode.LicenseIssuanceFailed);
  });
});
