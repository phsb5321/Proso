/**
 * CartesiaTTSAdapter unit tests
 *
 * Cartesia is a BYOK-only provider: no server-side API key is configured.
 * The adapter requires byokApiKey on every request. Without it, the adapter
 * returns Err(ProviderUnavailable) immediately without calling fetch.
 *
 * @module tests/unit/adapters/tts/cartesia-tts.adapter
 */

import { ErrorCode, TTSProvider, isErr, isOk } from '@proso/shared';
import { CartesiaTTSAdapter } from '../../../../src/adapters/tts/cartesia-tts.adapter';
import type { TTSSynthesizeParams } from '../../../../src/ports/tts-provider.port';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSuccessResponse(body: ArrayBuffer = new ArrayBuffer(256)): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(''),
    headers: new Headers(),
  } as unknown as Response;
}

function createErrorResponse(status: number, body = 'error'): Response {
  return {
    ok: false,
    status,
    text: jest.fn().mockResolvedValue(body),
    arrayBuffer: jest.fn(),
    headers: new Headers(),
  } as unknown as Response;
}

const BYOK_REQUEST: TTSSynthesizeParams = {
  text: 'Hello, this is a Cartesia BYOK test.',
  byokApiKey: 'ctk-test-key-123',
};

const NO_KEY_REQUEST: TTSSynthesizeParams = {
  text: 'Hello, this should fail without BYOK key.',
};

// Store original fetch
const originalFetch = global.fetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CartesiaTTSAdapter', () => {
  let adapter: CartesiaTTSAdapter;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    adapter = new CartesiaTTSAdapter();
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Identity
  // -----------------------------------------------------------------------

  describe('identity', () => {
    it('has providerId === TTSProvider.Cartesia', () => {
      expect(adapter.providerId).toBe(TTSProvider.Cartesia);
    });

    it('has a non-empty supportedLanguages array containing "en"', () => {
      expect(Array.isArray(adapter.supportedLanguages)).toBe(true);
      expect(adapter.supportedLanguages.length).toBeGreaterThan(0);
      expect(adapter.supportedLanguages).toContain('en');
    });
  });

  // -----------------------------------------------------------------------
  // synthesize() with byokApiKey succeeds
  // -----------------------------------------------------------------------

  describe('synthesize with byokApiKey', () => {
    it('returns Ok with audio Buffer and audio/mpeg contentType on success', async () => {
      const fakeAudio = new ArrayBuffer(512);
      mockFetch.mockResolvedValue(createSuccessResponse(fakeAudio));

      const result = await adapter.synthesize(BYOK_REQUEST);

      expect(isOk(result)).toBe(true);
      if (!result.ok) return;
      expect(Buffer.isBuffer(result.value.audio)).toBe(true);
      expect(result.value.audio.byteLength).toBe(512);
      expect(result.value.contentType).toBe('audio/mpeg');
      expect(result.value.provider).toBe(TTSProvider.Cartesia);
    });

    it('sends POST request to Cartesia TTS API URL', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await adapter.synthesize(BYOK_REQUEST);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, fetchOptions] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('https://api.cartesia.ai/tts/bytes');
      expect(fetchOptions.method).toBe('POST');
    });

    it('sends byokApiKey in the X-API-Key header', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await adapter.synthesize({
        text: 'Test auth header',
        byokApiKey: 'ctk-my-secret-key',
      });

      const [, fetchOptions] = mockFetch.mock.calls[0];
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers['X-API-Key']).toBe('ctk-my-secret-key');
    });

    it('sends Cartesia-Version header', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await adapter.synthesize(BYOK_REQUEST);

      const [, fetchOptions] = mockFetch.mock.calls[0];
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers['Cartesia-Version']).toBeDefined();
    });

    it('sends Content-Type: application/json header', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await adapter.synthesize(BYOK_REQUEST);

      const [, fetchOptions] = mockFetch.mock.calls[0];
      const headers = fetchOptions.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('sends transcript in the request body', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await adapter.synthesize({
        text: 'Specific transcript content',
        byokApiKey: 'ctk-key',
      });

      const [, fetchOptions] = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchOptions.body as string);
      expect(body.transcript).toBe('Specific transcript content');
    });

    it('uses provided voice when specified', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await adapter.synthesize({
        text: 'Test voice',
        voice: 'custom-voice-uuid',
        byokApiKey: 'ctk-key',
      });

      const [, fetchOptions] = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchOptions.body as string);
      expect(body.voice.id).toBe('custom-voice-uuid');
    });

    it('uses default voice when voice is not specified', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await adapter.synthesize({
        text: 'Test default voice',
        byokApiKey: 'ctk-key',
      });

      const [, fetchOptions] = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchOptions.body as string);
      // Should use the first static voice ID as default
      expect(body.voice.id).toBeDefined();
      expect(typeof body.voice.id).toBe('string');
    });

    it('sends language in the request body', async () => {
      mockFetch.mockResolvedValue(createSuccessResponse());

      await adapter.synthesize({
        text: 'Test language',
        language: 'en',
        byokApiKey: 'ctk-key',
      });

      const [, fetchOptions] = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchOptions.body as string);
      expect(body.language).toBe('en');
    });
  });

  // -----------------------------------------------------------------------
  // synthesize WITHOUT byokApiKey returns ProviderUnavailable
  // -----------------------------------------------------------------------

  describe('synthesize without byokApiKey', () => {
    it('returns Err(ProviderUnavailable) when byokApiKey is not provided', async () => {
      const result = await adapter.synthesize(NO_KEY_REQUEST);

      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('BYOK');
    });

    it('does not call fetch when byokApiKey is missing', async () => {
      await adapter.synthesize(NO_KEY_REQUEST);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns Err(ProviderUnavailable) when byokApiKey is empty string', async () => {
      const result = await adapter.synthesize({
        text: 'Test empty key',
        byokApiKey: '',
      });

      // Empty string is falsy, should be treated as missing
      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
    });
  });

  // -----------------------------------------------------------------------
  // synthesize with network error
  // -----------------------------------------------------------------------

  describe('synthesize with network error', () => {
    it('returns Err(ProviderUnavailable) on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await adapter.synthesize(BYOK_REQUEST);

      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('ECONNREFUSED');
    });

    it('returns Err(ProviderUnavailable) on DNS resolution failure', async () => {
      mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.cartesia.ai'));

      const result = await adapter.synthesize(BYOK_REQUEST);

      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
    });

    it('handles non-Error thrown values gracefully', async () => {
      mockFetch.mockRejectedValue('unexpected string error');

      const result = await adapter.synthesize(BYOK_REQUEST);

      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
    });
  });

  // -----------------------------------------------------------------------
  // synthesize with non-OK HTTP response
  // -----------------------------------------------------------------------

  describe('synthesize with non-OK HTTP response', () => {
    it('returns Err(ProviderUnavailable) on 401 Unauthorized', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(401, 'Invalid API key'));

      const result = await adapter.synthesize(BYOK_REQUEST);

      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('401');
    });

    it('returns Err(ProviderUnavailable) on 429 Rate Limited', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(429, 'Rate limit exceeded'));

      const result = await adapter.synthesize(BYOK_REQUEST);

      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('429');
    });

    it('returns Err(ProviderUnavailable) on 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValue(createErrorResponse(500, 'Internal server error'));

      const result = await adapter.synthesize(BYOK_REQUEST);

      expect(isErr(result)).toBe(true);
      if (result.ok) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('500');
    });
  });

  // -----------------------------------------------------------------------
  // getVoices returns static voice list
  // -----------------------------------------------------------------------

  describe('getVoices', () => {
    it('returns Ok with a non-empty array of VoiceInfo', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!result.ok) return;
      expect(Array.isArray(result.value)).toBe(true);
      expect(result.value.length).toBeGreaterThan(0);
    });

    it('returns voices with id, name, language, and gender fields', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!result.ok) return;

      for (const voice of result.value) {
        expect(typeof voice.id).toBe('string');
        expect(voice.id.length).toBeGreaterThan(0);
        expect(typeof voice.name).toBe('string');
        expect(voice.name.length).toBeGreaterThan(0);
        expect(voice.language).toBe('en');
        expect(['male', 'female']).toContain(voice.gender);
      }
    });

    it('does not call fetch for static voices', async () => {
      await adapter.getVoices();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns the same voices regardless of language parameter', async () => {
      const result1 = await adapter.getVoices('en');
      const result2 = await adapter.getVoices('es');

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);
      if (!result1.ok || !result2.ok) return;
      expect(result1.value).toEqual(result2.value);
    });
  });
});
