/**
 * Licence handler tests.
 *
 * The ordering rules in `handlers/license.handlers.ts` are the product: a key
 * is confirmed explicitly, persisted, and only then adopted by the shared live
 * client; a failed check never disturbs a key that already worked. Both are
 * stated here as observations of storage and of the live API client, because
 * both are the kind of rule that keeps working right up until the day it is
 * refactored into "adopt first, check later" or "save first, check later".
 *
 * @module tests/unit/handlers/license.handlers
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SubscriptionStatus, SubscriptionTier } from '@proso/shared';
import type {
  LicenseValidateResponse as ApiLicenseValidateResponse,
  SubscriptionDetailsResponse,
} from '@proso/shared';
import type {
  LicenseStatusResponse as HandlerLicenseStatusResponse,
  LicenseValidateResponse as HandlerLicenseValidateResponse,
  LicenseHandlerError,
} from '../../../src/handlers/license.handlers';
import type { IApiClient } from '../../../src/ports/api-client.port';
import { type ApiClientStub, createApiClientStub } from '../../helpers/mock-api-client';

// ============================================
// ESM Mocks — must precede dynamic imports
// ============================================

const storage: Record<string, unknown> = {};
let storageWriteError: Error | null = null;
const storageSet = jest.fn(async (values: Record<string, unknown>) => {
  if (storageWriteError) throw storageWriteError;
  Object.assign(storage, values);
});

jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: jest.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of list) {
            if (key in storage) result[key] = storage[key];
          }
          return result;
        }),
        set: storageSet,
      },
    },
  },
}));

const { registerLicenseHandlers, setLicenseApiClient } = await import(
  '../../../src/handlers/license.handlers'
);
const { HandlerRegistry } = await import('../../../src/handlers/registry');
const { Err, Ok } = await import('../../../src/core/shared/result');

// ============================================
// Fixtures
// ============================================

const KEY = 'test-licence-key-4c2a';
const OTHER_KEY = 'test-old-licence-9zzz';

const paidValidation: ApiLicenseValidateResponse = {
  valid: true,
  tier: SubscriptionTier.Pro,
  status: SubscriptionStatus.Active,
  features: { managedTts: true, premiumVoices: true, prioritySupport: false },
  credits: { total: 500_000, remaining: 412_500, usagePercent: 17.5 },
};

const freeValidation: ApiLicenseValidateResponse = {
  valid: false,
  tier: SubscriptionTier.Free,
  status: SubscriptionStatus.Active,
  features: { managedTts: false, premiumVoices: false, prioritySupport: false },
  credits: { total: 0, remaining: 0, usagePercent: 0 },
};

const paidSubscription: SubscriptionDetailsResponse = {
  tier: SubscriptionTier.Pro,
  status: SubscriptionStatus.Active,
  credits: { total: 500_000, remaining: 412_500, usagePercent: 17.5 },
};

const freeSubscription: SubscriptionDetailsResponse = {
  tier: SubscriptionTier.Free,
  status: SubscriptionStatus.Active,
};

/** The live client, with the key it currently holds observable. */
type TestApiClient = ApiClientStub & {
  readonly held: () => string | null;
};

function createApiClient(overrides: Partial<IApiClient> = {}): TestApiClient {
  let held: string | null = null;
  const client: TestApiClient = {
    ...createApiClientStub(),
    setLicenseKey: jest.fn<IApiClient['setLicenseKey']>((key) => {
      held = key;
    }),
    held: () => held,
    validateLicense: jest.fn<IApiClient['validateLicense']>(async () => Ok(paidValidation)),
    getSubscription: jest.fn<IApiClient['getSubscription']>(async () => Ok(paidSubscription)),
  };
  return Object.assign(client, overrides);
}

function registry(): InstanceType<typeof HandlerRegistry> {
  const reg = new HandlerRegistry();
  registerLicenseHandlers(reg);
  return reg;
}

async function validate(
  reg: InstanceType<typeof HandlerRegistry>,
  licenseKey: string,
): Promise<HandlerLicenseValidateResponse> {
  const result = await reg.dispatch<{ licenseKey: string }, HandlerLicenseValidateResponse>(
    'license.validate',
    { licenseKey },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function status(
  reg: InstanceType<typeof HandlerRegistry>,
): Promise<HandlerLicenseStatusResponse> {
  const result = await reg.dispatch<undefined, HandlerLicenseStatusResponse>(
    'license.getStatus',
    undefined,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

type FailedValidation = Extract<HandlerLicenseValidateResponse, { success: false }>;

function expectFailure(
  response: HandlerLicenseValidateResponse,
  type: LicenseHandlerError['type'],
): FailedValidation {
  expect(response.success).toBe(false);
  if (response.success) throw new Error(`Expected ${type}, received success`);
  expect(response.error.type).toBe(type);
  return response;
}

async function validateWithClient(
  client: IApiClient,
  licenseKey = KEY,
): Promise<HandlerLicenseValidateResponse> {
  setLicenseApiClient(client);
  return validate(registry(), licenseKey);
}

beforeEach(() => {
  for (const key of Object.keys(storage)) delete storage[key];
  storageWriteError = null;
  jest.clearAllMocks();
});

describe('license.validate', () => {
  it('saves the key and reports the plan when the server confirms it', async () => {
    const client = createApiClient();
    setLicenseApiClient(client);

    const response = await validate(registry(), KEY);

    expect(response.success).toBe(true);
    expect(response.status.tier).toBe('pro');
    expect(response.status.credits).toEqual({ total: 500_000, remaining: 412_500 });
    expect(storage.licenseKey).toBe(KEY);
  });

  it('confirms the explicit candidate, persists it, then adopts it for live synthesis', async () => {
    const client = createApiClient();
    setLicenseApiClient(client);

    await validate(registry(), KEY);

    expect(client.getSubscription).toHaveBeenCalledWith(KEY);
    expect(client.setLicenseKey).toHaveBeenCalledWith(KEY);
    const confirmation = client.getSubscription.mock.invocationCallOrder[0];
    const persisted = storageSet.mock.invocationCallOrder[0];
    const candidateCall = client.setLicenseKey.mock.calls.findIndex(([value]) => value === KEY);
    const adoption = client.setLicenseKey.mock.invocationCallOrder[candidateCall];
    expect(confirmation).toBeLessThan(persisted ?? Number.POSITIVE_INFINITY);
    expect(persisted).toBeLessThan(adoption ?? Number.POSITIVE_INFINITY);
    expect(client.held()).toBe(KEY);
  });

  it('never reports the raw key back to the caller', async () => {
    setLicenseApiClient(createApiClient());
    const response = await validate(registry(), KEY);
    expect(JSON.stringify(response)).not.toContain(KEY);
    expect(response.status.maskedKey).toBe('•••• 4c2a');
  });

  it('refuses a key the server does not recognise, and saves nothing', async () => {
    const response = await validateWithClient(
      createApiClient({
        validateLicense: jest.fn<IApiClient['validateLicense']>(async () => Ok(freeValidation)),
      }),
    );

    expectFailure(response, 'unrecognised_key');
    expect(storage.licenseKey).toBeUndefined();
  });

  it('refuses a paid tier that does not carry managed synthesis entitlement', async () => {
    const response = await validateWithClient(
      createApiClient({
        validateLicense: jest.fn<IApiClient['validateLicense']>(async () =>
          Ok({
            ...paidValidation,
            features: { ...paidValidation.features, managedTts: false },
          }),
        ),
      }),
    );

    expectFailure(response, 'unconfirmed_subscription');
    expect(storage.licenseKey).toBeUndefined();
  });

  it('refuses a paid response the subscription route contradicts', async () => {
    const client = createApiClient({
      getSubscription: jest.fn<IApiClient['getSubscription']>(async () => Ok(freeSubscription)),
    });
    const response = await validateWithClient(client);

    expectFailure(response, 'unconfirmed_subscription');
    expect(storage.licenseKey).toBeUndefined();
    // The unconfirmed key must not linger on the client that synthesizes.
    expect(client.held()).toBeNull();
  });

  it('refuses missing or impossible subscription credits instead of using validation fallback', async () => {
    const invalidBalances = [
      undefined,
      { total: 500_000, remaining: 500_001, usagePercent: 0 },
      { total: Number.NaN, remaining: 10, usagePercent: 0 },
      { total: 500_000, remaining: -1, usagePercent: 0 },
    ];

    for (const credits of invalidBalances) {
      const client = createApiClient({
        getSubscription: jest.fn<IApiClient['getSubscription']>(async () =>
          Ok({ ...paidSubscription, credits }),
        ),
      });
      const response = await validateWithClient(client);

      expectFailure(response, 'unconfirmed_subscription');
      expect(storage.licenseKey).toBeUndefined();
      expect(client.held()).toBeNull();
    }
  });

  it('keeps a working key when the network fails mid-check', async () => {
    storage.licenseKey = OTHER_KEY;
    const client = createApiClient({
      getSubscription: jest.fn<IApiClient['getSubscription']>(async () =>
        Err({ type: 'network', message: 'offline' }),
      ),
    });
    const response = await validateWithClient(client);

    expectFailure(response, 'network');
    expect(storage.licenseKey).toBe(OTHER_KEY);
    expect(client.held()).toBe(OTHER_KEY);
    expect(response.status.maskedKey).toBe('•••• 9zzz');
  });

  it('keeps the working live key when durable storage rejects the candidate', async () => {
    storage.licenseKey = OTHER_KEY;
    storageWriteError = new Error('quota unavailable');
    const client = createApiClient();
    const response = await validateWithClient(client);

    expectFailure(response, 'storage');
    expect(storage.licenseKey).toBe(OTHER_KEY);
    expect(client.held()).toBe(OTHER_KEY);
    expect(response.status.maskedKey).toBe('•••• 9zzz');
  });

  it('does not reflect a server response that echoes the submitted credential', async () => {
    const client = createApiClient({
      validateLicense: jest.fn<IApiClient['validateLicense']>(async () =>
        Err({ type: 'server_error', status: 500, message: `failed for ${KEY}` }),
      ),
    });
    const response = await validateWithClient(client);

    expect(JSON.stringify(response)).not.toContain(KEY);
  });

  it('contains a thrown adapter error without reflecting the candidate', async () => {
    const client = createApiClient({
      validateLicense: jest.fn<IApiClient['validateLicense']>(async () => {
        throw new Error(`transport exposed ${KEY}`);
      }),
    });
    const response = await validateWithClient(client);

    expectFailure(response, 'network');
    expect(JSON.stringify(response)).not.toContain(KEY);
    expect(client.setLicenseKey).not.toHaveBeenCalledWith(KEY);
  });

  it('keeps a working key when validation itself fails', async () => {
    storage.licenseKey = OTHER_KEY;
    const client = createApiClient({
      validateLicense: jest.fn<IApiClient['validateLicense']>(async () =>
        Err({ type: 'server_error', status: 500, message: 'x' }),
      ),
    });
    const response = await validateWithClient(client);

    expectFailure(response, 'network');
    expect(storage.licenseKey).toBe(OTHER_KEY);
    // The stored key may be re-synchronized, but the rejected candidate never
    // becomes the key concurrent synthesis uses.
    expect(client.setLicenseKey).not.toHaveBeenCalledWith(KEY);
  });

  it('serializes competing settings tabs around the one mutable live client', async () => {
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let callCount = 0;
    const validateLicense = jest.fn<IApiClient['validateLicense']>(async () => {
      callCount += 1;
      if (callCount === 1) {
        markFirstStarted?.();
        await firstCanFinish;
      }
      return Ok(paidValidation);
    });
    const client = createApiClient({ validateLicense });
    setLicenseApiClient(client);
    const reg = registry();

    const first = validate(reg, KEY);
    await firstStarted;
    const second = validate(reg, OTHER_KEY);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(validateLicense).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(storage.licenseKey).toBe(OTHER_KEY);
    expect(client.held()).toBe(OTHER_KEY);
  });

  it('asks the server nothing when the field is empty', async () => {
    const client = createApiClient();
    const response = await validateWithClient(client, '   ');

    expectFailure(response, 'empty_key');
    expect(client.validateLicense).not.toHaveBeenCalled();
  });

  it('reports that no server is configured rather than pretending to check', async () => {
    const response = await validateWithClient(createApiClient({ isConfigured: false }));

    expectFailure(response, 'not_configured');
    expect(storage.licenseKey).toBeUndefined();
  });
});

describe('the module that holds the raw key', () => {
  it('contains no logging call at all', () => {
    // The background handler is the only production code that ever holds the
    // raw key outside storage. "Do not log the key" is unfalsifiable as a
    // review promise and trivial as a file property, so it is a file property:
    // a module with no logging call cannot log a credential by accident.
    const source = readFileSync(
      new URL('../../../src/handlers/license.handlers.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/\blog\.(debug|info|warn|error)\(/);
    expect(source).not.toMatch(/\bconsole\.(log|debug|info|warn|error)\(/);
  });
});

describe('license.getStatus', () => {
  it('reports nothing configured on a fresh browser', async () => {
    setLicenseApiClient(createApiClient());
    const response = await status(registry());
    expect(response.status.configured).toBe(false);
    expect(response.status.maskedKey).toBeNull();
  });

  it('asks the server what the stored key is worth, right now', async () => {
    storage.licenseKey = KEY;
    const client = createApiClient();
    setLicenseApiClient(client);

    const response = await status(registry());

    expect(client.setLicenseKey).toHaveBeenCalledWith(KEY);
    expect(client.getSubscription).toHaveBeenCalled();
    expect(client.setLicenseKey.mock.invocationCallOrder[0]).toBeLessThan(
      client.getSubscription.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(response.status).toMatchObject({
      configured: true,
      maskedKey: '•••• 4c2a',
      tier: 'pro',
      serverReachable: true,
    });
  });

  it('contains a thrown status error without returning the stored credential', async () => {
    storage.licenseKey = KEY;
    setLicenseApiClient(
      createApiClient({
        getSubscription: jest.fn<IApiClient['getSubscription']>(async () => {
          throw new Error(`transport exposed ${KEY}`);
        }),
      }),
    );

    const response = await status(registry());

    expect(response.status.configured).toBe(true);
    expect(response.status.serverReachable).toBe(false);
    expect(JSON.stringify(response)).not.toContain(KEY);
  });

  it('still reports the key as configured when the server cannot be asked', async () => {
    storage.licenseKey = KEY;
    setLicenseApiClient(
      createApiClient({
        getSubscription: jest.fn<IApiClient['getSubscription']>(async () =>
          Err({ type: 'network', message: 'offline' }),
        ),
      }),
    );

    const response = await status(registry());

    expect(response.status.configured).toBe(true);
    expect(response.status.serverReachable).toBe(false);
    expect(response.status.tier).toBeNull();
  });
});
