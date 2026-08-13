// Unit tests for license key derivation primitives.

import { createHash } from 'node:crypto';
import {
  LICENSE_KEY_PREFIX,
  constantTimeHashMatches,
  deriveLicenseKey,
  generateKeyId,
  hasStrongLicenseKeySecret,
  hashClaimSecret,
  hashLicenseKey,
  licenseKeyEnvironment,
} from '../../../../src/core/subscription/license-key';

const SECRET = 'k'.repeat(32);

describe('generateKeyId', () => {
  it('returns 32 bytes of hex', () => {
    expect(generateKeyId()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat across calls', () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateKeyId()));
    expect(ids.size).toBe(500);
  });
});

describe('licenseKeyEnvironment', () => {
  it('mints live keys only in production', () => {
    expect(licenseKeyEnvironment('production')).toBe('live');
  });

  it.each(['development', 'test', 'staging', undefined])('mints test keys for %s', (env) => {
    expect(licenseKeyEnvironment(env)).toBe('test');
  });
});

describe('deriveLicenseKey', () => {
  it('prefixes live keys so support can recognise them', () => {
    const key = deriveLicenseKey(generateKeyId(), SECRET, 'live');
    expect(key.startsWith(LICENSE_KEY_PREFIX.live)).toBe(true);
  });

  it('prefixes test keys distinctly from live keys', () => {
    const keyId = generateKeyId();
    const live = deriveLicenseKey(keyId, SECRET, 'live');
    const test = deriveLicenseKey(keyId, SECRET, 'test');

    expect(test.startsWith(LICENSE_KEY_PREFIX.test)).toBe(true);
    expect(test).not.toBe(live);
  });

  it('carries the full 256-bit HMAC output', () => {
    const key = deriveLicenseKey(generateKeyId(), SECRET, 'live');
    expect(key.slice(LICENSE_KEY_PREFIX.live.length)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for a given key id, which is what lets retrieval answer twice', () => {
    const keyId = generateKeyId();
    expect(deriveLicenseKey(keyId, SECRET, 'live')).toBe(deriveLicenseKey(keyId, SECRET, 'live'));
  });

  it('produces a distinct key per key id', () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => deriveLicenseKey(generateKeyId(), SECRET, 'live')),
    );
    expect(keys.size).toBe(200);
  });

  it('changes completely when the secret changes', () => {
    const keyId = generateKeyId();
    expect(deriveLicenseKey(keyId, SECRET, 'live')).not.toBe(
      deriveLicenseKey(keyId, 'a-different-secret', 'live'),
    );
  });

  it('never contains the key id, so a database row does not reveal the key', () => {
    const keyId = generateKeyId();
    expect(deriveLicenseKey(keyId, SECRET, 'live')).not.toContain(keyId);
  });
});

describe('hashLicenseKey', () => {
  it('matches the digest the validate endpoint computes over a presented key', () => {
    const key = deriveLicenseKey(generateKeyId(), SECRET, 'live');
    const asValidateComputesIt = createHash('sha256').update(key).digest('hex');

    expect(hashLicenseKey(key)).toBe(asValidateComputesIt);
  });

  it('does not contain the key it hashes', () => {
    const key = deriveLicenseKey(generateKeyId(), SECRET, 'live');
    expect(hashLicenseKey(key)).not.toContain(key.slice(LICENSE_KEY_PREFIX.live.length));
  });
});

describe('hashClaimSecret', () => {
  it('matches the digest the site computes with Web Crypto', () => {
    const claimSecret = 'c'.repeat(43);
    expect(hashClaimSecret(claimSecret)).toBe(
      createHash('sha256').update(claimSecret).digest('hex'),
    );
  });

  it('differs for secrets differing in one character', () => {
    expect(hashClaimSecret('claim-secret-aaaa')).not.toBe(hashClaimSecret('claim-secret-aaab'));
  });
});

describe('hasStrongLicenseKeySecret', () => {
  it('requires at least 32 UTF-8 bytes', () => {
    expect(hasStrongLicenseKeySecret('x'.repeat(31))).toBe(false);
    expect(hasStrongLicenseKeySecret('x'.repeat(32))).toBe(true);
  });
});

describe('constantTimeHashMatches', () => {
  it('accepts identical SHA-256 digests', () => {
    const digest = hashLicenseKey('proso_live_deadbeef');
    expect(constantTimeHashMatches(digest, digest)).toBe(true);
  });

  it('rejects different digests', () => {
    expect(constantTimeHashMatches(hashLicenseKey('a'), hashLicenseKey('b'))).toBe(false);
  });

  it('rejects malformed or length-mismatched values without throwing', () => {
    expect(constantTimeHashMatches('g'.repeat(64), 'g'.repeat(64))).toBe(false);
    expect(constantTimeHashMatches('abcd', hashLicenseKey('a'))).toBe(false);
  });
});
