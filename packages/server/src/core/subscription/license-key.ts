// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * License key derivation — pure functions, ZERO NestJS imports.
 *
 * A Proso license key is opaque to the customer, recognisable to support, and
 * absent from the database in plaintext:
 *
 * ```
 * keyId     = randomBytes(32)                                      // per key, CSPRNG
 * plaintext = 'proso_live_' + HMAC-SHA256(secret, VERSION + keyId) // full 64-char hex digest
 * stored    = sha256(plaintext)                                    // LicenseKey.keyHash
 * ```
 *
 * Deriving rather than storing is what makes account-free retrieval possible.
 * An independently random plaintext would disappear when its original minting
 * call returned. Hash-only retrieval would then have to rotate the key on every
 * claim, invalidating the one already installed in the reader's extension.
 * Deriving from the stored row id gives a stable answer with the same
 * at-rest-digest-only property.
 *
 * Compromise still needs two halves: the database yields `keyId` but not the
 * secret, the secret yields nothing without `keyId`.
 *
 * @module core/subscription/license-key
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Domain separator. Bumping it invalidates every derived key, so it is part of
 * the contract rather than an implementation detail.
 */
const DERIVATION_VERSION = 'proso.license.v1:';

/** Bytes of CSPRNG material behind each key. */
const KEY_ID_BYTES = 32;

/** Hex characters of HMAC output carried by the key body. 64 hex = 256 bits. */
const KEY_BODY_LENGTH = 64;

/** Minimum HMAC-secret strength accepted by issuance. */
export const LICENSE_KEY_SECRET_MIN_BYTES = 32;

/**
 * Environment-visible prefixes. Support reads the prefix off a pasted key and
 * knows immediately which deployment minted it.
 */
export const LICENSE_KEY_PREFIX = {
  live: 'proso_live_',
  test: 'proso_test_',
} as const;

export type LicenseKeyEnvironment = keyof typeof LICENSE_KEY_PREFIX;

/**
 * Which prefix a given runtime environment mints under. Everything that is not
 * production is a test key, so a staging key pasted into a support ticket is
 * never mistaken for a paying customer's.
 */
export function licenseKeyEnvironment(nodeEnv: string | undefined): LicenseKeyEnvironment {
  return nodeEnv === 'production' ? 'live' : 'test';
}

/** Whether a configured HMAC secret meets the 256-bit byte-length floor. */
export function hasStrongLicenseKeySecret(secret: string): boolean {
  return Buffer.byteLength(secret, 'utf8') >= LICENSE_KEY_SECRET_MIN_BYTES;
}

/** Fresh CSPRNG key material. Stored as `LicenseKey.id`. */
export function generateKeyId(): string {
  return randomBytes(KEY_ID_BYTES).toString('hex');
}

/**
 * Derive the customer-facing key for a stored key id. Deterministic: the same
 * `keyId` and secret always produce the same key, which is what lets retrieval
 * answer twice without rotating.
 */
export function deriveLicenseKey(
  keyId: string,
  secret: string,
  environment: LicenseKeyEnvironment,
): string {
  const body = createHmac('sha256', secret)
    .update(`${DERIVATION_VERSION}${keyId}`)
    .digest('hex')
    .slice(0, KEY_BODY_LENGTH);

  return `${LICENSE_KEY_PREFIX[environment]}${body}`;
}

/**
 * Digest stored in `LicenseKey.keyHash`. Must stay identical to the digest
 * `LicenseController.validate` computes over the presented key, or a minted key
 * would not validate.
 */
export function hashLicenseKey(licenseKey: string): string {
  return createHash('sha256').update(licenseKey).digest('hex');
}

/**
 * Digest of a buyer's claim secret, as stored on `Subscription.licenseClaimHash`
 * and as the site computes it with Web Crypto before handing it to Paddle. The
 * secret is base64url text on both sides, so the digest is taken over the text
 * rather than over decoded bytes.
 *
 * Lowercase hex, matching `LicenseClaimHashSchema` in the shared contract.
 */
export function hashClaimSecret(claimSecret: string): string {
  return createHash('sha256').update(claimSecret).digest('hex');
}

/**
 * Constant-time comparison of two hex digests. Used before handing a derived
 * key back — a rotated `LICENSE_KEY_SECRET` must surface as a loud failure, not
 * as a wrong key delivered to a paying customer — and to check a presented
 * claim secret, where a timing side channel would leak the stored hash.
 */
export function constantTimeHashMatches(a: string, b: string): boolean {
  const sha256Hex = /^[0-9a-f]{64}$/;
  if (!sha256Hex.test(a) || !sha256Hex.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
