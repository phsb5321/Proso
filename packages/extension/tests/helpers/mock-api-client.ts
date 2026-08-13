import { jest } from '@jest/globals';
import type { IApiClient } from '../../src/ports/api-client.port';

export type ApiClientStub = IApiClient & {
  readonly setLicenseKey: jest.MockedFunction<IApiClient['setLicenseKey']>;
  readonly validateLicense: jest.MockedFunction<IApiClient['validateLicense']>;
  readonly getSubscription: jest.MockedFunction<IApiClient['getSubscription']>;
  readonly getCreditBalance: jest.MockedFunction<IApiClient['getCreditBalance']>;
  readonly getCreditHistory: jest.MockedFunction<IApiClient['getCreditHistory']>;
  readonly createCheckout: jest.MockedFunction<IApiClient['createCheckout']>;
  readonly synthesize: jest.MockedFunction<IApiClient['synthesize']>;
  readonly testApiKey: jest.MockedFunction<IApiClient['testApiKey']>;
};

export function createApiClientStub(overrides: Partial<IApiClient> = {}): ApiClientStub {
  const client: ApiClientStub = {
    isConfigured: true,
    setLicenseKey: jest.fn<IApiClient['setLicenseKey']>(),
    validateLicense: jest.fn<IApiClient['validateLicense']>(),
    getSubscription: jest.fn<IApiClient['getSubscription']>(),
    getCreditBalance: jest.fn<IApiClient['getCreditBalance']>(),
    getCreditHistory: jest.fn<IApiClient['getCreditHistory']>(),
    createCheckout: jest.fn<IApiClient['createCheckout']>(),
    synthesize: jest.fn<IApiClient['synthesize']>(),
    testApiKey: jest.fn<IApiClient['testApiKey']>(),
  };
  return Object.assign(client, overrides);
}
