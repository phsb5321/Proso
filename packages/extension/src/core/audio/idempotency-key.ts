// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Idempotency key derivation for the local synthesis host (spec 100 D-6).
 *
 * The key is a hex-encoded SHA-256 digest, truncated to a fixed length inside
 * the host's 16..128 character bound (inclusive), over a canonical
 * serialization of exactly the fields the host accepts: input text, voice id,
 * and speed. Nothing else — no URL, no chunk index, no timestamp —
 * participates, so the same sentence on a re-read reuses retained audio, and
 * a retry after `engine_not_ready`/`engine_timeout` reuses the key it already
 * sent so the host coalesces the retry instead of queueing a second synthesis.
 *
 * Pure domain logic: `crypto.subtle` is injected by the caller, never imported
 * into `core/` (architecture gate).
 *
 * @module core/audio/idempotency-key
 */

import { audioError } from '../shared/errors';
import type { AudioError } from '../shared/errors';
import type { Result } from '../shared/result';
import { Err, Ok } from '../shared/result';

/** Appliance `Idempotency-Key` length window (16..128 characters, inclusive). */
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/** Fixed digest length inside the host's 16..128 inclusive window. */
export const IDEMPOTENCY_KEY_LENGTH = 64;

/**
 * Derive the idempotency key for `(input, voice, speed)`.
 *
 * `subtle` is injected so the pure function is directly testable in any
 * environment (jsdom, Node, worker) without a Web Crypto polyfill.
 */
export async function deriveIdempotencyKey(
  input: string,
  voice: string,
  speed: number,
  subtle: Pick<SubtleCrypto, 'digest'> | null,
): Promise<Result<string, AudioError>> {
  if (!subtle) {
    return Err(
      audioError.providerError(
        'appliance_crypto_unavailable',
        'Web Crypto subtle digest is unavailable; cannot derive an idempotency key',
      ),
    );
  }

  const payload = new TextEncoder().encode(`${input}\u0000${voice}\u0000${speed}`);
  const digest = await subtle.digest('SHA-256', payload);
  const key = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, IDEMPOTENCY_KEY_LENGTH);

  if (key.length < IDEMPOTENCY_KEY_MIN_LENGTH || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    return Err(
      audioError.providerError(
        'appliance_invalid_response',
        `Derived idempotency key length ${key.length} outside the host's 16..128 window`,
      ),
    );
  }

  return Ok(key);
}
