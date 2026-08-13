// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * License key repository port — abstract contract for license key persistence.
 *
 * Implemented by the Prisma adapter; consumed by the issuance and retrieval
 * services in `core/`. The plaintext key never crosses this boundary — only its
 * id and digest do.
 *
 * @module ports/license-key-repository.port
 */

export abstract class LicenseKeyRepositoryPort {
  /** The user's key row, active or not. At most one exists (`userId` is unique). */
  abstract findByUserId(userId: string): Promise<LicenseKeyRecord | null>;

  /**
   * Persist a new key, or return the one that already exists for this user.
   *
   * Implementations must be safe against concurrent callers: exactly one row
   * may result, and every caller must receive it. A read-then-create sequence
   * does not satisfy this — the final guarantee comes from database uniqueness,
   * with an atomic upsert or explicit unique-violation recovery.
   */
  abstract createIfAbsent(key: NewLicenseKey): Promise<LicenseKeyRecord>;
}

export interface LicenseKeyRecord {
  /** CSPRNG key material; the plaintext key is derived from it. */
  id: string;
  userId: string;
  keyHash: string;
  activatedAt: Date;
  expiresAt?: Date;
  deviceCount: number;
  maxDevices: number;
  isActive: boolean;
  createdAt: Date;
}

export interface NewLicenseKey {
  id: string;
  userId: string;
  keyHash: string;
  activatedAt: Date;
}
