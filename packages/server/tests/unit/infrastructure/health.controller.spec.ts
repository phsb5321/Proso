/**
 * `/health` runtime revision contract (Feature 165).
 *
 * Deployment verification is unsound unless the running application can
 * identify its own git revision. The `revision` field is sourced ONLY from
 * process configuration (`GIT_REV`, injected by Dokku) — never from request
 * input, never from the semantic `version` constant. A null revision means
 * the platform supplied nothing, and verification must fail closed on it:
 * `version` (hardcoded from package.json) cannot impersonate a deployment id.
 *
 * Plant: an implementation that returns `version` (or any hardcoded value) as
 * `revision` fails the absent/whitespace cases below, and an implementation
 * that reads request input cannot even reach this controller shape.
 *
 * @module tests/unit/infrastructure/health.controller
 */

import type { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { HealthController } from '../../../src/infrastructure/controllers/health.controller';
import type { PrismaHealthIndicator } from '../../../src/infrastructure/health/prisma.health';

const GIT_REV_KEY = 'GIT_REV';

function makeController(): HealthController {
  const health = {
    check: jest.fn().mockResolvedValue({ status: 'ok', details: {} }),
  } as unknown as HealthCheckService;
  const memory = {} as MemoryHealthIndicator;
  const prisma = {} as PrismaHealthIndicator;
  return new HealthController(health, memory, prisma);
}

async function withGitRev(
  value: string | undefined,
  fn: () => Promise<void> | void,
): Promise<void> {
  const previous = process.env[GIT_REV_KEY];
  if (value === undefined) {
    delete process.env[GIT_REV_KEY];
  } else {
    process.env[GIT_REV_KEY] = value;
  }
  try {
    await fn();
  } finally {
    if (previous === undefined) {
      delete process.env[GIT_REV_KEY];
    } else {
      process.env[GIT_REV_KEY] = previous;
    }
  }
}

describe('HealthController revision', () => {
  const SHA = 'e6b412f06a2f1640e350f8fda55f3ee0ca8b2ecc';

  it('reports the runtime revision when the platform supplies GIT_REV', async () => {
    await withGitRev(SHA, async () => {
      const response = await makeController().check();
      expect(response.revision).toBe(SHA);
    });
  });

  it('returns null revision when GIT_REV is absent — version must never impersonate it', async () => {
    await withGitRev(undefined, async () => {
      const response = await makeController().check();
      expect(response.revision).toBeNull();
      // Plant falsifier: a planted implementation that echoes `version` into
      // `revision` produces '1.0.0' here and fails both assertions above.
      expect(response.version).toBeDefined();
      expect(response.revision).not.toBe(response.version);
    });
  });

  it('returns null revision when GIT_REV is whitespace-only', async () => {
    await withGitRev('   ', async () => {
      const response = await makeController().check();
      expect(response.revision).toBeNull();
    });
  });

  it('trims GIT_REV when it carries surrounding whitespace', async () => {
    await withGitRev(`  ${SHA}  `, async () => {
      const response = await makeController().check();
      // Plant: an implementation that special-cases blank values but returns
      // untrimmed content for nonblank ones fails here.
      expect(response.revision).toBe(SHA);
    });
  });

  it('preserves every existing response field alongside the new one', async () => {
    await withGitRev(SHA, async () => {
      const response = await makeController().check();
      expect(response.status).toBe('ok');
      expect(response.version).toBeDefined();
      expect(typeof response.uptime).toBe('number');
      expect(response.details).toEqual({});
      expect(Object.keys(response).sort()).toEqual(
        ['details', 'revision', 'status', 'uptime', 'version'].sort(),
      );
    });
  });
});
