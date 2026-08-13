/**
 * ProsoApiAdapter.testApiKey Unit Tests
 *
 * Tests the new testApiKey() method added for BYOK key validation
 * via the server's POST /api/v1/tts/test-key endpoint.
 *
 * Also tests that synthesize() allows BYOK requests without a license key.
 *
 * @module tests/unit/adapters/api/proso-api-testkey
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { TTSTestKeyResponse } from '@proso/shared';
import { ProsoApiAdapter } from '../../../../src/adapters/api/proso-api.adapter';
import { isErr, isOk } from '../../../../src/core/shared/result';
import { binaryResponse, jsonResponse } from '../../../helpers/http-response';

// Mock fetch globally
const mockFetch = jest.fn<typeof fetch>();
globalThis.fetch = mockFetch;

function blobResponse(status = 200): Response {
  return binaryResponse(new Blob(['audio-data'], { type: 'audio/mpeg' }), status, {
    'Content-Type': 'audio/mpeg',
    'X-Credits-Used': '0',
    'X-Credits-Remaining': '100000',
    'X-Cache-Hit': 'false',
    'X-Provider': 'openai',
  });
}

const SERVER_URL = 'https://api.proso.com.br';

const mockTestKeySuccess: TTSTestKeyResponse = {
  success: true,
  provider: 'openai',
  latencyMs: 250,
};

const mockTestKeyFailure: TTSTestKeyResponse = {
  success: false,
  provider: 'openai',
  error: 'Invalid API key',
  latencyMs: 100,
};

describe('ProsoApiAdapter.testApiKey', () => {
  let adapter: ProsoApiAdapter;

  beforeEach(() => {
    adapter = new ProsoApiAdapter(SERVER_URL, 'test-license-key');
    mockFetch.mockReset();
  });

  it('sends POST to /api/v1/tts/test-key with provider and apiKey', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTestKeySuccess));

    await adapter.testApiKey('openai', 'sk-test-key');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${SERVER_URL}/api/v1/tts/test-key`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      provider: 'openai',
      apiKey: 'sk-test-key',
    });
  });

  it('returns Ok with success response when key is valid', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTestKeySuccess));

    const result = await adapter.testApiKey('openai', 'sk-valid-key');

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.success).toBe(true);
      expect(result.value.provider).toBe('openai');
      expect(result.value.latencyMs).toBe(250);
    }
  });

  it('returns Ok with failure response when key is invalid', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTestKeyFailure));

    const result = await adapter.testApiKey('openai', 'sk-bad-key');

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.success).toBe(false);
      expect(result.value.error).toBe('Invalid API key');
    }
  });

  it('returns Err on network failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    const result = await adapter.testApiKey('openai', 'sk-key');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('network');
    }
  });

  it('returns Err(unauthorized) on 401 response', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'unauthorized', message: 'Bad license' }, 401),
    );

    const result = await adapter.testApiKey('openai', 'sk-key');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.type).toBe('unauthorized');
    }
  });

  it('does not require license key for testApiKey calls', async () => {
    const noLicenseAdapter = new ProsoApiAdapter(SERVER_URL);
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTestKeySuccess));

    const result = await noLicenseAdapter.testApiKey('elevenlabs', 'el-key');

    expect(isOk(result)).toBe(true);
  });

  it('tests with different providers', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, provider: 'elevenlabs', latencyMs: 300 }),
    );

    const result = await adapter.testApiKey('elevenlabs', 'el-test-key');

    expect(isOk(result)).toBe(true);
    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init?.body as string).provider).toBe('elevenlabs');
  });
});

describe('ProsoApiAdapter.synthesize — BYOK without license key', () => {
  let adapter: ProsoApiAdapter;

  beforeEach(() => {
    // No license key — simulates a user who hasn't entered one
    adapter = new ProsoApiAdapter(SERVER_URL);
    mockFetch.mockReset();
  });

  it('allows synthesize with byokApiKey even without license key', async () => {
    mockFetch.mockResolvedValueOnce(blobResponse());

    const result = await adapter.synthesize({
      text: 'Hello world',
      byokApiKey: 'sk-byok-key',
    });

    expect(isOk(result)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends synthesize request to server even without license key or byokApiKey (INV-001)', async () => {
    mockFetch.mockResolvedValueOnce(blobResponse());

    const result = await adapter.synthesize({
      text: 'Hello world',
    });

    // Request should go through — server uses its own API keys for free tier
    expect(isOk(result)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends byokApiKey in the request body', async () => {
    mockFetch.mockResolvedValueOnce(blobResponse());

    await adapter.synthesize({
      text: 'BYOK synthesis test',
      byokApiKey: 'sk-my-byok-key',
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.byokApiKey).toBe('sk-my-byok-key');
    expect(body.text).toBe('BYOK synthesis test');
  });
});
