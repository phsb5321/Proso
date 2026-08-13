// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * License issuance — pure domain logic, ZERO NestJS imports.
 *
 * Reusable issuance is *ensure*, not *create*: retries and concurrent callers
 * must converge on the same database row and customer-facing key. Feature 148
 * exposes it through the claim path; later integrations can reuse the same
 * operation without gaining a second minting rule.
 *
 * @module core/subscription/license-issuance.service
 */

import type { Result } from '@proso/shared';
import { Err, Ok } from '@proso/shared';
import type {
  LicenseKeyRecord,
  LicenseKeyRepositoryPort,
} from '../../ports/license-key-repository.port.js';
import type { LicenseError } from '../shared/domain-errors.js';
import { licenseIssuanceError } from '../shared/domain-errors.js';
import {
  type LicenseKeyEnvironment,
  constantTimeHashMatches,
  deriveLicenseKey,
  generateKeyId,
  hasStrongLicenseKeySecret,
  hashLicenseKey,
} from './license-key.js';

export interface LicenseIssuanceDeps {
  licenseKeyRepository: LicenseKeyRepositoryPort;
  /** HMAC secret behind every derived key. Empty is a hard error, never a default. */
  secret: string;
  environment: LicenseKeyEnvironment;
}

export interface IssuedLicenseKey {
  /** The customer-facing key. Derived on demand; never persisted in plaintext. */
  licenseKey: string;
  record: LicenseKeyRecord;
  /** False when an existing key was returned unchanged. */
  minted: boolean;
}

/**
 * Return the user's license key, minting one if they have none.
 *
 * Never throws — persistence, configuration, and integrity failures become a
 * typed `Err` at this domain boundary.
 */
export async function ensureLicenseKey(
  userId: string,
  deps: LicenseIssuanceDeps,
): Promise<Result<IssuedLicenseKey, LicenseError>> {
  if (!hasStrongLicenseKeySecret(deps.secret)) {
    return Err(
      licenseIssuanceError(
        'LICENSE_KEY_SECRET must contain at least 32 bytes; refusing to derive a key',
        { userId },
      ),
    );
  }

  try {
    const existing = await deps.licenseKeyRepository.findByUserId(userId);
    if (existing) {
      return resolveExisting(existing, deps);
    }

    const keyId = generateKeyId();
    const licenseKey = deriveLicenseKey(keyId, deps.secret, deps.environment);

    const record = await deps.licenseKeyRepository.createIfAbsent({
      id: keyId,
      userId,
      keyHash: hashLicenseKey(licenseKey),
      activatedAt: new Date(),
    });

    // A concurrent caller may have won inside the adapter, in which case the
    // stored row is not the candidate this call just derived.
    if (record.id !== keyId) {
      return resolveExisting(record, deps);
    }

    return Ok({ licenseKey, record, minted: true });
  } catch (error: unknown) {
    return Err(
      licenseIssuanceError(error instanceof Error ? error.message : String(error), { userId }),
    );
  }
}

/**
 * Re-derive the key for a stored row and prove it against the stored digest.
 *
 * A mismatch means the deployment's `LICENSE_KEY_SECRET` is not the one the row
 * was minted under. Handing back the freshly derived key would give a paying
 * customer a key that `POST /api/v1/license/validate` rejects, so this is an
 * error, not a silent re-issue.
 */
function resolveExisting(
  record: LicenseKeyRecord,
  deps: LicenseIssuanceDeps,
): Result<IssuedLicenseKey, LicenseError> {
  if (!record.isActive) {
    return Err(
      licenseIssuanceError('Existing license key is inactive; refusing to expose or replace it', {
        userId: record.userId,
        licenseKeyId: record.id,
      }),
    );
  }

  const licenseKey = deriveLicenseKey(record.id, deps.secret, deps.environment);

  if (!constantTimeHashMatches(hashLicenseKey(licenseKey), record.keyHash)) {
    return Err(
      licenseIssuanceError(
        'Stored license key digest does not match the configured secret; LICENSE_KEY_SECRET may have been rotated',
        { userId: record.userId, licenseKeyId: record.id },
      ),
    );
  }

  return Ok({ licenseKey, record, minted: false });
}
