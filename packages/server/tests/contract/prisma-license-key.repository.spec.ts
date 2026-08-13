// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/** Real PostgreSQL contract for the one-key-per-user race invariant. */

import { createHash } from 'node:crypto';
import { PrismaLicenseKeyRepository } from '../../src/adapters/persistence/prisma-license-key.repository';
import type { PrismaService } from '../../src/infrastructure/modules/prisma.module';
import { createTestUser } from '../helpers/test-fixtures';
import {
  cleanupTestData,
  createTestPrismaService,
  teardownTestPrisma,
} from '../helpers/test-prisma';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('PrismaLicenseKeyRepository (contract)', () => {
  let prisma: PrismaService;
  let repository: PrismaLicenseKeyRepository;

  beforeAll(async () => {
    prisma = await createTestPrismaService();
    repository = new PrismaLicenseKeyRepository(prisma);
  }, 60_000);

  afterEach(async () => {
    await cleanupTestData(prisma);
  });

  afterAll(async () => {
    await teardownTestPrisma();
  });

  it('converges 32 concurrent inserts for one user on exactly one row', async () => {
    const user = await createTestUser(prisma);
    const attempts = Array.from({ length: 32 }, (_, index) => ({
      id: index.toString(16).padStart(64, '0'),
      userId: user.id,
      keyHash: sha256(`candidate-${index}`),
      activatedAt: new Date('2026-08-12T18:00:00.000Z'),
    }));

    const results = await Promise.all(
      attempts.map((attempt) => repository.createIfAbsent(attempt)),
    );
    const rows = await prisma.licenseKey.findMany({ where: { userId: user.id } });

    expect(rows).toHaveLength(1);
    expect(new Set(results.map((result) => result.id))).toEqual(new Set([rows[0].id]));
    expect(new Set(results.map((result) => result.keyHash))).toEqual(new Set([rows[0].keyHash]));
  });

  it('lets the database reject a second direct row for the same user', async () => {
    const user = await createTestUser(prisma);
    await prisma.licenseKey.create({
      data: {
        id: 'a'.repeat(64),
        userId: user.id,
        keyHash: sha256('first'),
        activatedAt: new Date('2026-08-12T18:00:00.000Z'),
      },
    });

    await expect(
      prisma.licenseKey.create({
        data: {
          id: 'b'.repeat(64),
          userId: user.id,
          keyHash: sha256('second'),
          activatedAt: new Date('2026-08-12T18:00:01.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('returns inactive rows instead of treating them as absent', async () => {
    const user = await createTestUser(prisma);
    await prisma.licenseKey.create({
      data: {
        id: 'c'.repeat(64),
        userId: user.id,
        keyHash: sha256('inactive'),
        activatedAt: new Date('2026-08-12T18:00:00.000Z'),
        isActive: false,
      },
    });

    expect(await repository.findByUserId(user.id)).toMatchObject({ isActive: false });
  });
});
