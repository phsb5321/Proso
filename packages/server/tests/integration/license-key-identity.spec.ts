/**
 * Licence-key identity through the real module graph.
 *
 * This suite boots `AppModule` itself — the module the deployable bootstraps —
 * over a listening socket, and makes every assertion with an HTTP request. It
 * is deliberately not a unit test of `LicenseKeyGuard`: the defect it exists to
 * catch is "the guard is correct and nothing registers it" (docs/money-path.md),
 * and a test that constructs the guard by hand passes happily while every real
 * request is anonymous.
 *
 * Only leaf infrastructure is substituted — the Prisma connection and the two
 * repository ports. The guard, its registration, the reflector metadata, the
 * route table and the middleware order are all the shipped ones.
 *
 * Falsifier: remove `AuthModule` from `AppModule.imports` and the valid-key
 * cases go red (`userId` null, credits balance 401) while the no-key cases stay
 * green.
 *
 * @module tests/integration/license-key-identity
 */

import * as crypto from 'node:crypto';
import { Controller, Get, type INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { Public } from '../../src/infrastructure/guards/license-key.guard';
import { PrismaService } from '../../src/infrastructure/modules/prisma.module';
import { CreditRepositoryPort } from '../../src/ports/credit-repository.port';
import { SubscriptionRepositoryPort } from '../../src/ports/subscription-repository.port';
import { type UserRecord, UserRepositoryPort } from '../../src/ports/user-repository.port';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAID_KEY = ['proso', 'live', Buffer.from('paid-user').toString('hex')].join('-');
const PAID_KEY_HASH = crypto.createHash('sha256').update(PAID_KEY).digest('hex');
const PAID_USER_ID = 'user-with-a-paid-licence';
const ENV_PLACEHOLDER = 'not-a-credential';

const PAID_USER: UserRecord = {
  id: PAID_USER_ID,
  email: 'reader@example.invalid',
  licenseKeyHash: PAID_KEY_HASH,
  tier: 'free',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

/**
 * Probe routes. The product's own routes answer 401 without identity, which
 * cannot distinguish "no user attached" from "guard rejected the request"; the
 * probe reports the attached id itself, so the anonymous case is observable
 * rather than inferred.
 */
@Controller('__identity-probe')
class IdentityProbeController {
  @Get('guarded')
  guarded(@Req() req: Request & { userId?: string }) {
    return observed(req);
  }

  @Get('public')
  @Public()
  publicRoute(@Req() req: Request & { userId?: string }) {
    return observed(req);
  }
}

/**
 * What the request carries by the time a handler runs. `rawKeyRetained` is
 * asserted false everywhere: the guard must attach the resolved id and never
 * park the secret itself on an object that request logging and error capture
 * both serialize.
 */
function observed(req: Request & { userId?: string }) {
  return { userId: req.userId ?? null, rawKeyRetained: 'licenseKey' in req };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

describe('licence key identity (real AppModule graph)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let findByLicenseKeyHash: jest.Mock<Promise<UserRecord | null>, [string]>;

  beforeAll(async () => {
    // Set before AppModule is loaded: `app.config` validates on module load, and
    // production is also the branch with no pino transport worker, which keeps
    // the suite free of a thread jest cannot join.
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:5432/unused';
    process.env.JWT_SECRET = ENV_PLACEHOLDER;
    process.env.LICENSE_KEY_SECRET = ENV_PLACEHOLDER.repeat(3);

    const { AppModule } = await import('../../src/app.module');

    findByLicenseKeyHash = jest.fn(async (keyHash: string) =>
      keyHash === PAID_KEY_HASH ? PAID_USER : null,
    );

    const userRepository: UserRepositoryPort = {
      findById: jest.fn(async (id: string) => (id === PAID_USER_ID ? PAID_USER : null)),
      findByLicenseKeyHash,
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as UserRepositoryPort;

    const creditRepository = {
      findCurrentAllocation: jest.fn(async (userId: string) =>
        userId === PAID_USER_ID
          ? {
              id: 'allocation-1',
              userId: PAID_USER_ID,
              totalCredits: 1000,
              remainingCredits: 750,
              periodStart: new Date('2026-08-01T00:00:00.000Z'),
              periodEnd: new Date('2026-09-01T00:00:00.000Z'),
            }
          : null,
      ),
      deductCredits: jest.fn(),
      getAllocationHistory: jest.fn(async () => []),
      getTransactionCount: jest.fn(async () => 0),
      createAllocation: jest.fn(),
    } as unknown as CreditRepositoryPort;

    const subscriptionRepository = {
      findById: jest.fn(async () => null),
      findByUserId: jest.fn(async () => null),
      findActiveByUserId: jest.fn(async () => null),
      findByPaddleId: jest.fn(async () => null),
      findByPaddleTransactionId: jest.fn(async () => null),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as SubscriptionRepositoryPort;

    // Never dialled: the only Prisma call any asserted route makes is the
    // health indicator's `SELECT 1`.
    const prisma = {
      $connect: jest.fn(async () => undefined),
      $disconnect: jest.fn(async () => undefined),
      $queryRaw: jest.fn(async () => [{ ok: 1 }]),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [IdentityProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(UserRepositoryPort)
      .useValue(userRepository)
      .overrideProvider(CreditRepositoryPort)
      .useValue(creditRepository)
      .overrideProvider(SubscriptionRepositoryPort)
      .useValue(subscriptionRepository)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    findByLicenseKeyHash.mockClear();
  });

  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, { headers });

  /** Served, with nobody attached and no key resolved. */
  const expectAnonymous = async (response: Response) => {
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: null, rawKeyRetained: false });
    expect(findByLicenseKeyHash).not.toHaveBeenCalled();
  };

  // ─── No key: the account-free route (INV-001) ──────────────────────

  it('executes a guarded route with no identity when no key is presented', async () => {
    await expectAnonymous(await get('/__identity-probe/guarded'));
  });

  it('treats an empty key header as no key rather than an invalid one', async () => {
    await expectAnonymous(await get('/__identity-probe/guarded', { 'X-License-Key': '   ' }));
  });

  // ─── Valid key: identity reaches the route ─────────────────────────

  it('attaches the repository user id, and only the id, when a valid key is presented', async () => {
    const response = await get('/__identity-probe/guarded', { 'X-License-Key': PAID_KEY });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: PAID_USER_ID, rawKeyRetained: false });
    expect(findByLicenseKeyHash).toHaveBeenCalledWith(PAID_KEY_HASH);
  });

  it('resolves the key by SHA-256 hash, never by the key itself', async () => {
    await get('/__identity-probe/guarded', { 'X-License-Key': PAID_KEY });

    const [presented] = findByLicenseKeyHash.mock.calls[0];
    expect(presented).toBe(PAID_KEY_HASH);
    expect(presented).not.toBe(PAID_KEY);
    expect(presented).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lets a shipped route bill the identified user (credits balance)', async () => {
    const anonymous = await get('/api/v1/credits/balance');
    expect(anonymous.status).toBe(401);

    const identified = await get('/api/v1/credits/balance', { 'X-License-Key': PAID_KEY });
    expect(identified.status).toBe(200);
    expect(await identified.json()).toMatchObject({ total: 1000, remaining: 750 });
  });

  // ─── Invalid key: visible 401, never a silent downgrade ────────────

  it('rejects an unrecognised key with 401 instead of degrading to free', async () => {
    const response = await get('/__identity-probe/guarded', {
      'X-License-Key': 'proso-live-not-a-real-key',
    });

    expect(response.status).toBe(401);
    expect(findByLicenseKeyHash).toHaveBeenCalledTimes(1);
  });

  // ─── @Public(): bypassed entirely ──────────────────────────────────

  it('bypasses the lookup on a @Public() route even when a key is presented', async () => {
    await expectAnonymous(await get('/__identity-probe/public', { 'X-License-Key': PAID_KEY }));
  });

  it('leaves the @Public() licence validation route reachable without a key', async () => {
    const response = await fetch(`${baseUrl}/api/v1/license/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: PAID_KEY }),
    });

    expect(response.status).toBe(200);
  });

  // ─── Health stays reachable ────────────────────────────────────────

  it('answers health without a key', async () => {
    const response = await get('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });
});
