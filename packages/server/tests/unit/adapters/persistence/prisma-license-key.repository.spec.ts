// Race and error-translation contract for PrismaLicenseKeyRepository.
//
// The real PostgreSQL race is covered in tests/contract. These unit checks pin
// the P2002 fallback Prisma may surface when an upsert is client-emulated, and
// the schema assertion pins the uniqueness that makes convergence possible.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaLicenseKeyRepository } from '../../../../src/adapters/persistence/prisma-license-key.repository';
import type { PrismaService } from '../../../../src/infrastructure/modules/prisma.module';

const USER_ID = 'user-1';

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'winner-key-id',
    userId: USER_ID,
    keyHash: 'a'.repeat(64),
    activatedAt: new Date('2026-08-12T18:00:00Z'),
    expiresAt: null,
    deviceCount: 0,
    maxDevices: 5,
    isActive: true,
    createdAt: new Date('2026-08-12T18:00:00Z'),
    ...overrides,
  };
}

function uniqueViolation(): Error & { code: string } {
  return Object.assign(new Error('Unique constraint failed on the fields: (`userId`)'), {
    code: 'P2002',
  });
}

function makePrisma(licenseKey: Record<string, jest.Mock>): PrismaService {
  return { licenseKey } as unknown as PrismaService;
}

const newKey = {
  id: 'loser-key-id',
  userId: USER_ID,
  keyHash: 'b'.repeat(64),
  activatedAt: new Date('2026-08-12T18:00:01Z'),
};

describe('PrismaLicenseKeyRepository.createIfAbsent', () => {
  it('uses userId as an atomic upsert conflict target', async () => {
    const stored = storedRow({ id: newKey.id, keyHash: newKey.keyHash });
    const upsert = jest.fn().mockResolvedValue(stored);
    const repository = new PrismaLicenseKeyRepository(
      makePrisma({ upsert, findUnique: jest.fn() }),
    );

    const result = await repository.createIfAbsent(newKey);

    expect(result.id).toBe(newKey.id);
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      update: {},
      create: newKey,
    });
  });

  it('returns the database winner when Prisma surfaces P2002', async () => {
    const upsert = jest.fn().mockRejectedValue(uniqueViolation());
    const findUnique = jest.fn().mockResolvedValue(storedRow());
    const repository = new PrismaLicenseKeyRepository(makePrisma({ upsert, findUnique }));

    const result = await repository.createIfAbsent(newKey);

    expect(result.id).toBe('winner-key-id');
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('rethrows P2002 when no row exists for this user', async () => {
    const repository = new PrismaLicenseKeyRepository(
      makePrisma({
        upsert: jest.fn().mockRejectedValue(uniqueViolation()),
        findUnique: jest.fn().mockResolvedValue(null),
      }),
    );

    await expect(repository.createIfAbsent(newKey)).rejects.toThrow('Unique constraint failed');
  });

  it('rethrows an error that is not a unique violation', async () => {
    const repository = new PrismaLicenseKeyRepository(
      makePrisma({
        upsert: jest.fn().mockRejectedValue(new Error('Database connection lost')),
        findUnique: jest.fn(),
      }),
    );

    await expect(repository.createIfAbsent(newKey)).rejects.toThrow('Database connection lost');
  });
});

describe('PrismaLicenseKeyRepository.findByUserId', () => {
  it('returns an inactive row so the domain cannot mistake it for absence', async () => {
    const repository = new PrismaLicenseKeyRepository(
      makePrisma({
        upsert: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(storedRow({ isActive: false })),
      }),
    );

    expect(await repository.findByUserId(USER_ID)).toMatchObject({ isActive: false });
  });
});

describe('LicenseKey schema', () => {
  it('declares userId unique, which is what makes createIfAbsent race-safe', () => {
    const schema = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'prisma', 'schema.prisma'),
      'utf8',
    );
    const model = schema.slice(schema.indexOf('model LicenseKey {'));
    const body = model.slice(0, model.indexOf('\n}'));

    expect(body).toMatch(/userId\s+String\s+@unique/);
  });
});
