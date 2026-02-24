/**
 * ProsoApiAdapter Unit Tests
 *
 * Tests HTTP client behavior: success responses, error handling,
 * retry logic, auth headers, and timeout handling.
 *
 * @module tests/unit/adapters/api/proso-api.adapter
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ProsoApiAdapter } from '../../../../src/adapters/api/proso-api.adapter';
import { isOk, isErr } from '../../../../src/core/shared/result';
import type { LicenseValidateResponse, SubscriptionDetailsResponse } from '@proso/shared';
import { SubscriptionTier, SubscriptionStatus } from '@proso/shared';

// Mock fetch globally
const mockFetch = jest.fn<typeof fetch>();
globalThis.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: () => jsonResponse(data, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(''),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

function errorResponse(status: number, error = 'error', message = 'Something went wrong'): Response {
  return jsonResponse({ error, message }, status);
}

const SERVER_URL = 'https://api.proso.com';

const mockLicenseResponse: LicenseValidateResponse = {
  valid: true,
  tier: SubscriptionTier.Pro,
  status: SubscriptionStatus.Active,
  features: {
    managedTts: true,
    premiumVoices: true,
    prioritySupport: true,
  },
  credits: {
    total: 500000,
    remaining: 350000,
    usagePercent: 30,
    periodStart: '2026-01-01T00:00:00Z',
    periodEnd: '2026-02-01T00:00:00Z',
  },
};

const mockSubscriptionResponse: SubscriptionDetailsResponse = {
  tier: SubscriptionTier.Pro,
  status: SubscriptionStatus.Active,
  currentPeriodStart: '2026-01-01T00:00:00Z',
  currentPeriodEnd: '2026-02-01T00:00:00Z',
};

describe('ProsoApiAdapter', () => {
  let adapter: ProsoApiAdapter;

  beforeEach(() => {
    adapter = new ProsoApiAdapter(SERVER_URL, 'test-license-key');
    mockFetch.mockReset();
  });

  describe('isConfigured', () => {
    it('returns true when server URL is provided', () => {
      expect(adapter.isConfigured).toBe(true);
    });

    it('returns false when server URL is empty', () => {
      const empty = new ProsoApiAdapter('');
      expect(empty.isConfigured).toBe(false);
    });
  });

  describe('validateLicense', () => {
    it('sends POST to /api/v1/license/validate with license key in body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      await adapter.validateLicense('my-key');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SERVER_URL}/api/v1/license/validate`);
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body as string)).toEqual({ licenseKey: 'my-key' });
    });

    it('returns Ok with license response on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      const result = await adapter.validateLicense('my-key');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.valid).toBe(true);
        expect(result.value.tier).toBe(SubscriptionTier.Pro);
        expect(result.value.credits.remaining).toBe(350000);
      }
    });

    it('includes X-License-Key header when license key is set', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      await adapter.validateLicense('my-key');

      const [, init] = mockFetch.mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-License-Key']).toBe('test-license-key');
    });
  });

  describe('getSubscription', () => {
    it('sends GET to /api/v1/subscription', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockSubscriptionResponse));

      await adapter.getSubscription();

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SERVER_URL}/api/v1/subscription`);
      expect(init?.method).toBe('GET');
    });

    it('returns Ok with subscription details on success', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockSubscriptionResponse));

      const result = await adapter.getSubscription();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.tier).toBe(SubscriptionTier.Pro);
        expect(result.value.status).toBe(SubscriptionStatus.Active);
      }
    });

    it('returns not_configured error when no license key', async () => {
      const noKey = new ProsoApiAdapter(SERVER_URL);

      const result = await noKey.getSubscription();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('not_configured');
      }
    });
  });

  describe('getCreditBalance', () => {
    it('returns not_configured error when no license key', async () => {
      const noKey = new ProsoApiAdapter(SERVER_URL);

      const result = await noKey.getCreditBalance();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('not_configured');
      }
    });
  });

  describe('createCheckout', () => {
    it('sends POST to /api/v1/subscription/checkout with tier', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ checkoutUrl: 'https://checkout.paddle.com/123' }));

      await adapter.createCheckout('pro');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${SERVER_URL}/api/v1/subscription/checkout`);
      expect(JSON.parse(init?.body as string)).toEqual({ tier: 'pro' });
    });

    it('returns not_configured error when no license key', async () => {
      const noKey = new ProsoApiAdapter(SERVER_URL);

      const result = await noKey.createCheckout('pro');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('not_configured');
      }
    });
  });

  describe('error handling', () => {
    it('returns unauthorized error on 401', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, 'unauthorized', 'Invalid license key'));

      const result = await adapter.validateLicense('bad-key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('unauthorized');
        if (result.error.type === 'unauthorized') {
          expect(result.error.message).toBe('Invalid license key');
        }
      }
    });

    it('returns unauthorized error on 403', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(403, 'forbidden', 'Access denied'));

      const result = await adapter.validateLicense('bad-key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('unauthorized');
      }
    });

    it('returns server_error for 4xx responses', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(422, 'validation', 'Invalid request'));

      const result = await adapter.validateLicense('key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('server_error');
        if (result.error.type === 'server_error') {
          expect(result.error.status).toBe(422);
        }
      }
    });
  });

  describe('retry logic', () => {
    it('retries on 5xx errors up to MAX_RETRIES times', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(502))
        .mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      const result = await adapter.validateLicense('key');

      expect(isOk(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('returns server_error after exhausting retries', async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(500))
        .mockResolvedValueOnce(errorResponse(500));

      const result = await adapter.validateLicense('key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('server_error');
      }
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      const result = await adapter.validateLicense('key');

      expect(isOk(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns network error after exhausting retries', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Net error 1'))
        .mockRejectedValueOnce(new Error('Net error 2'))
        .mockRejectedValueOnce(new Error('Net error 3'));

      const result = await adapter.validateLicense('key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('network');
      }
    });
  });

  describe('setLicenseKey', () => {
    it('updates the license key used for auth headers', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockSubscriptionResponse));

      adapter.setLicenseKey('new-key');
      await adapter.getSubscription();

      const [, init] = mockFetch.mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-License-Key']).toBe('new-key');
    });
  });

  describe('URL normalization', () => {
    it('strips trailing slashes from base URL', async () => {
      const adapterWithSlash = new ProsoApiAdapter('https://api.proso.com/', 'key');
      mockFetch.mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      await adapterWithSlash.validateLicense('key');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.proso.com/api/v1/license/validate');
    });
  });
});
