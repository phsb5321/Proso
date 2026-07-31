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
import { SubscriptionTier, SubscriptionStatus, ErrorCode } from '@proso/shared';

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

function errorResponse(
  status: number,
  error = 'error',
  message = 'Something went wrong',
): Response {
  return jsonResponse({ error, message }, status);
}

/**
 * Error response with caller-controlled body + headers — used for T003/T004 cases
 * (legacy `error`-only bodies, `code` capture, `Retry-After`) that `errorResponse`'s
 * fixed `{error, message}` shape can't express.
 */
function errorResponseWithHeaders(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(headers),
    redirected: false,
    statusText: 'Error',
    type: 'basic',
    url: '',
    clone: () => errorResponseWithHeaders(status, body, headers),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(''),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/** Successful binary (audio) response, matching what `requestBinary`/`synthesize` expects. */
function binarySuccessResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'Content-Type': 'audio/mpeg',
      'X-Credits-Used': '1',
      'X-Credits-Remaining': '99',
      'X-Cache-Hit': 'false',
      'X-Provider': 'openai',
    }),
    redirected: false,
    statusText: 'OK',
    type: 'basic',
    url: '',
    clone: () => binarySuccessResponse(),
    body: null,
    bodyUsed: false,
    json: () => Promise.resolve({}),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(''),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

const SERVER_URL = 'https://api.proso.com.br';

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
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ checkoutUrl: 'https://checkout.paddle.com/123' }),
      );

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
      const adapterWithSlash = new ProsoApiAdapter('https://api.proso.com.br/', 'key');
      mockFetch.mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      await adapterWithSlash.validateLicense('key');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.proso.com.br/api/v1/license/validate');
    });
  });

  describe('legacy error-body fallback (T003)', () => {
    it('falls back to the `error` field when a legacy server omits `message`', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponseWithHeaders(422, { error: 'Legacy validation failure' }),
      );

      const result = await adapter.validateLicense('key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('server_error');
        if (result.error.type === 'server_error') {
          expect(result.error.message).toBe('Legacy validation failure');
          expect(result.error.code).toBeUndefined();
        }
      }
    });

    it('falls back to `HTTP <status>` when the body has neither `message` nor `error`', async () => {
      mockFetch.mockResolvedValueOnce(errorResponseWithHeaders(422, {}));

      const result = await adapter.validateLicense('key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('server_error');
        if (result.error.type === 'server_error') {
          expect(result.error.message).toBe('HTTP 422');
        }
      }
    });
  });

  describe('error code capture (T003)', () => {
    it('captures `code` on a 402 (server_error) response', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponseWithHeaders(402, {
          error: 'No active allocation',
          message: 'No active allocation',
          code: ErrorCode.NoActiveAllocation,
        }),
      );

      const result = await adapter.validateLicense('key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('server_error');
        if (result.error.type === 'server_error') {
          expect(result.error.status).toBe(402);
          expect(result.error.code).toBe(ErrorCode.NoActiveAllocation);
        }
      }
    });

    it('captures `code` on a 401 (unauthorized) response', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponseWithHeaders(401, {
          error: 'Invalid license',
          message: 'Invalid license',
          code: ErrorCode.LicenseInvalid,
        }),
      );

      const result = await adapter.validateLicense('bad-key');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('unauthorized');
        if (result.error.type === 'unauthorized') {
          expect(result.error.code).toBe(ErrorCode.LicenseInvalid);
        }
      }
    });
  });

  describe('429 retry with Retry-After (T004)', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('honors a delta-seconds Retry-After before retrying a 429', async () => {
      jest.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(
          errorResponseWithHeaders(429, { error: 'Rate limited' }, { 'Retry-After': '3' }),
        )
        .mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      const resultPromise = adapter.validateLicense('key');

      // Just under the 3s hint: proves the retry hasn't fired yet.
      await jest.advanceTimersByTimeAsync(2999);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('honors an HTTP-date Retry-After before retrying a 429 (synthesize/requestBinary path)', async () => {
      jest.useFakeTimers();
      const retryAt = new Date(Date.now() + 6000).toUTCString();
      mockFetch
        .mockResolvedValueOnce(
          errorResponseWithHeaders(429, { error: 'Rate limited' }, { 'Retry-After': retryAt }),
        )
        .mockResolvedValueOnce(binarySuccessResponse());

      const resultPromise = adapter.synthesize({ text: 'hello' });

      // Well under the ~6s hint: proves it isn't using the 1s default backoff.
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Past the hint (buffer accounts for whole-second truncation in the HTTP-date format).
      await jest.advanceTimersByTimeAsync(3500);
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('clamps an oversized Retry-After to MAX_RETRY_AFTER_MS', async () => {
      jest.useFakeTimers();
      mockFetch
        .mockResolvedValueOnce(
          errorResponseWithHeaders(429, { error: 'Rate limited' }, { 'Retry-After': '999999' }),
        )
        .mockResolvedValueOnce(jsonResponse(mockLicenseResponse));

      const resultPromise = adapter.validateLicense('key');

      // Just under the 60s clamp ceiling: proves it did not honor the full 999999s hint.
      await jest.advanceTimersByTimeAsync(59_999);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns server_error with retryAfterMs after exhausting retries on 429', async () => {
      jest.useFakeTimers();
      mockFetch.mockResolvedValue(
        errorResponseWithHeaders(429, { error: 'Rate limited' }, { 'Retry-After': '1' }),
      );

      const resultPromise = adapter.validateLicense('key');

      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('server_error');
        if (result.error.type === 'server_error') {
          expect(result.error.status).toBe(429);
          expect(result.error.message).toBe('Rate limited');
          expect(result.error.retryAfterMs).toBe(1000);
        }
      }
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('abort mid-flight (T005)', () => {
    it('returns an aborted error when the caller aborts before the fetch settles', async () => {
      const abortController = new AbortController();
      mockFetch.mockImplementationOnce((_url, init) => {
        return new Promise<Response>((_resolve, reject) => {
          const sig = init?.signal as AbortSignal;
          sig.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      });

      const resultPromise = adapter.synthesize({ text: 'hello' }, abortController.signal);
      abortController.abort();
      const result = await resultPromise;

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('aborted');
      }
    });

    it('short-circuits to an aborted error when the signal is already aborted before the call', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const result = await adapter.synthesize({ text: 'hello' }, abortController.signal);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('aborted');
      }
    });
  });
});
