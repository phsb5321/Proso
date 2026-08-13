// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Prisma implementation of {@link LicenseKeyRepositoryPort}.
 *
 * @module adapters/persistence/prisma-license-key.repository
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/modules/prisma.module';
import {
  type LicenseKeyRecord,
  LicenseKeyRepositoryPort,
  type NewLicenseKey,
} from '../../ports/license-key-repository.port';

/** Prisma's unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaLicenseKeyRepository extends LicenseKeyRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByUserId(userId: string): Promise<LicenseKeyRecord | null> {
    const key = await this.prisma.licenseKey.findUnique({ where: { userId } });
    return key ? toRecord(key) : null;
  }

  /**
   * Atomically insert the key or return the row already owned by this user.
   *
   * A service-level read is only an optimisation: concurrent callers can both
   * observe no row before either writes. `upsert` makes `userId` the conflict
   * target, and the schema's `@unique` constraint is the final arbiter. Prisma
   * can still surface P2002 when it emulates an upsert or loses a client-side
   * race, so that path converges on the database winner as well.
   */
  async createIfAbsent(key: NewLicenseKey): Promise<LicenseKeyRecord> {
    try {
      const stored = await this.prisma.licenseKey.upsert({
        where: { userId: key.userId },
        update: {},
        create: {
          id: key.id,
          userId: key.userId,
          keyHash: key.keyHash,
          activatedAt: key.activatedAt,
        },
      });
      return toRecord(stored);
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;

      const winner = await this.prisma.licenseKey.findUnique({ where: { userId: key.userId } });
      if (!winner) {
        // A collision on another unique column is a derivation/integrity fault,
        // not successful idempotency, and must stay visible to the caller.
        throw error;
      }
      return toRecord(winner);
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}

function toRecord(key: {
  id: string;
  userId: string;
  keyHash: string;
  activatedAt: Date;
  expiresAt: Date | null;
  deviceCount: number;
  maxDevices: number;
  isActive: boolean;
  createdAt: Date;
}): LicenseKeyRecord {
  return {
    id: key.id,
    userId: key.userId,
    keyHash: key.keyHash,
    activatedAt: key.activatedAt,
    expiresAt: key.expiresAt ?? undefined,
    deviceCount: key.deviceCount,
    maxDevices: key.maxDevices,
    isActive: key.isActive,
    createdAt: key.createdAt,
  };
}
