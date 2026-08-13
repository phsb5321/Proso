// Unit tests for reusable, idempotent licence issuance.

import { ErrorCode, isOk, unwrapErr } from '@proso/shared';
import {
  type LicenseIssuanceDeps,
  ensureLicenseKey,
} from '../../../../src/core/subscription/license-issuance.service';
import {
  LICENSE_KEY_PREFIX,
  deriveLicenseKey,
  hashLicenseKey,
} from '../../../../src/core/subscription/license-key';
import { InMemoryLicenseKeyRepository } from '../../../helpers/in-memory-repositories';

const SECRET = 'i'.repeat(32);

function makeDeps(overrides: Partial<LicenseIssuanceDeps> = {}): LicenseIssuanceDeps & {
  licenseKeyRepository: InMemoryLicenseKeyRepository;
} {
  return {
    licenseKeyRepository: new InMemoryLicenseKeyRepository(),
    secret: SECRET,
    environment: 'test',
    ...overrides,
  } as LicenseIssuanceDeps & { licenseKeyRepository: InMemoryLicenseKeyRepository };
}

describe('ensureLicenseKey', () => {
  it('mints a key for a user who has none', async () => {
    const deps = makeDeps();

    const result = await ensureLicenseKey('user-1', deps);

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.minted).toBe(true);
    expect(result.value.licenseKey.startsWith(LICENSE_KEY_PREFIX.test)).toBe(true);
    expect(deps.licenseKeyRepository.rows).toHaveLength(1);
  });

  it('stores only the digest, never the key itself', async () => {
    const deps = makeDeps();

    const result = await ensureLicenseKey('user-1', deps);
    if (!isOk(result)) throw new Error('expected Ok');

    const stored = deps.licenseKeyRepository.rows[0];
    expect(stored.keyHash).toBe(hashLicenseKey(result.value.licenseKey));
    expect(JSON.stringify(stored)).not.toContain(result.value.licenseKey);
  });

  it('returns the same key on replay and writes no second row (INV: one key per user)', async () => {
    const deps = makeDeps();

    const first = await ensureLicenseKey('user-1', deps);
    const second = await ensureLicenseKey('user-1', deps);

    if (!isOk(first) || !isOk(second)) throw new Error('expected Ok');
    expect(second.value.licenseKey).toBe(first.value.licenseKey);
    expect(second.value.minted).toBe(false);
    expect(deps.licenseKeyRepository.rows).toHaveLength(1);
  });

  it('issues distinct keys to distinct users', async () => {
    const deps = makeDeps();

    const a = await ensureLicenseKey('user-a', deps);
    const b = await ensureLicenseKey('user-b', deps);

    if (!isOk(a) || !isOk(b)) throw new Error('expected Ok');
    expect(a.value.licenseKey).not.toBe(b.value.licenseKey);
  });

  it('re-derives an existing key from its stored id rather than rotating it', async () => {
    const deps = makeDeps();
    await ensureLicenseKey('user-1', deps);
    const storedId = deps.licenseKeyRepository.rows[0].id;

    const again = await ensureLicenseKey('user-1', deps);

    if (!isOk(again)) throw new Error('expected Ok');
    expect(again.value.licenseKey).toBe(deriveLicenseKey(storedId, SECRET, 'test'));
  });

  it('returns Err when LICENSE_KEY_SECRET is too short, rather than deriving a weak key', async () => {
    const deps = makeDeps({ secret: 'short-secret' });

    const result = await ensureLicenseKey('user-1', deps);

    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(unwrapErr(result).code).toBe(ErrorCode.LicenseIssuanceFailed);
    expect(deps.licenseKeyRepository.rows).toHaveLength(0);
  });

  it('returns Err when the stored digest does not match the configured secret (rotated secret)', async () => {
    const deps = makeDeps();
    await ensureLicenseKey('user-1', deps);

    const rotated = await ensureLicenseKey('user-1', {
      ...deps,
      secret: 'a-completely-different-secret-with-32-bytes',
    });

    expect(isOk(rotated)).toBe(false);
    if (isOk(rotated)) return;
    expect(unwrapErr(rotated).message).toContain('rotated');
  });

  it('returns Err instead of throwing when persistence fails', async () => {
    const repository = new InMemoryLicenseKeyRepository();
    jest
      .spyOn(repository, 'createIfAbsent')
      .mockRejectedValue(new Error('Database connection lost'));

    const result = await ensureLicenseKey('user-1', makeDeps({ licenseKeyRepository: repository }));

    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(unwrapErr(result).message).toBe('Database connection lost');
  });

  it('mints exactly one key when two issuance attempts run concurrently', async () => {
    const deps = makeDeps();

    // Both callers pass the "does a key exist?" read before either insert
    // resolves — the interleaving a check-then-insert adapter would lose to.
    let release = (): void => {};
    deps.licenseKeyRepository.settleAfter = new Promise<void>((resolve) => {
      release = resolve;
    });

    const both = Promise.all([ensureLicenseKey('user-1', deps), ensureLicenseKey('user-1', deps)]);
    release();
    const [first, second] = await both;

    expect(deps.licenseKeyRepository.writeAttempts).toBe(2);
    expect(deps.licenseKeyRepository.rows).toHaveLength(1);

    if (!isOk(first) || !isOk(second)) throw new Error('expected Ok');
    // Both callers must hold the key that is actually stored: a caller handed
    // the key it tried to insert would have one the database never accepted.
    const stored = hashLicenseKey(first.value.licenseKey);
    expect(stored).toBe(deps.licenseKeyRepository.rows[0].keyHash);
    expect(second.value.licenseKey).toBe(first.value.licenseKey);
  });

  it('adopts the stored key when a later issuance attempt finds one', async () => {
    const deps = makeDeps();
    const raced = await ensureLicenseKey('user-1', deps);
    if (!isOk(raced)) throw new Error('expected Ok');

    const result = await ensureLicenseKey('user-1', deps);

    if (!isOk(result)) throw new Error('expected Ok');
    expect(result.value.licenseKey).toBe(raced.value.licenseKey);
    expect(result.value.minted).toBe(false);
  });

  it('refuses to expose or replace an inactive key row', async () => {
    const deps = makeDeps();
    const issued = await ensureLicenseKey('user-1', deps);
    if (!isOk(issued)) throw new Error('expected Ok');
    deps.licenseKeyRepository.rows[0].isActive = false;

    const result = await ensureLicenseKey('user-1', deps);

    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(unwrapErr(result).message).toContain('inactive');
    expect(deps.licenseKeyRepository.rows).toHaveLength(1);
  });
});
