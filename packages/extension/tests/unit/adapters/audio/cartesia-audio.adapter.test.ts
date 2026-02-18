/**
 * Cartesia Audio Adapter Unit Tests
 *
 * Tests for CartesiaAudioAdapter implementing IAudioGenerator port.
 * Mocks global.fetch to control API responses.
 *
 * @module tests/unit/adapters/audio/cartesia-audio.adapter
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CartesiaAudioAdapter } from '../../../../src/adapters/audio/cartesia-audio.adapter';
import { isOk, isErr } from '../../../../src/core/shared/result';
import type { AudioRequest } from '../../../../src/ports/audio-generator.port';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<AudioRequest> = {}): AudioRequest {
  return {
    text: 'Hello world',
    voice: null,
    speed: 1.0,
    language: 'en',
    ...overrides,
  };
}

function mockFetchOk(blob?: Blob) {
  const responseBlob = blob ?? new Blob(['fake-audio'], { type: 'audio/mpeg' });
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    blob: jest.fn<() => Promise<Blob>>().mockResolvedValue(responseBlob),
  });
}

function mockFetchStatus(status: number) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status,
    blob: jest.fn<() => Promise<Blob>>().mockResolvedValue(new Blob()),
  });
}

function mockFetchNetworkError(message = 'Failed to fetch') {
  (global.fetch as jest.Mock).mockRejectedValue(new Error(message));
}

// Default voice ID (first entry in CARTESIA_VOICES)
const DEFAULT_VOICE_ID = 'a0e99841-438c-4a64-b679-ae501e7d6091';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CartesiaAudioAdapter', () => {
  let adapter: CartesiaAudioAdapter;
  const API_KEY = 'cart-test-key-1234';

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof global.fetch;
    adapter = new CartesiaAudioAdapter(API_KEY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Static properties
  // -----------------------------------------------------------------------

  describe('static properties', () => {
    it('should have providerId of "cartesia"', () => {
      expect(adapter.providerId).toBe('cartesia');
    });

    it('should have playbackMode of "blob"', () => {
      expect(adapter.playbackMode).toBe('blob');
    });

    it('should not support word timing', () => {
      expect(adapter.supportsWordTiming).toBe(false);
    });

    it('should only support English', () => {
      expect(adapter.supportedLanguages).toEqual(['en']);
    });
  });

  // -----------------------------------------------------------------------
  // generateAudio - success
  // -----------------------------------------------------------------------

  describe('generateAudio() - success', () => {
    it('should return Ok with audio blob on successful response', async () => {
      const audioBlob = new Blob(['mp3-data'], { type: 'audio/mpeg' });
      mockFetchOk(audioBlob);

      const result = await adapter.generateAudio(makeRequest());

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.audioBlob).toBeInstanceOf(Blob);
      expect(result.value.audioBlob).toBe(audioBlob);
    });

    it('should return null wordTimings', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(makeRequest());

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.wordTimings).toBeNull();
    });

    it('should estimate duration based on word count and speed', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(
        makeRequest({ text: 'one two three four five', speed: 1.0 }),
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.durationMs).toBe(2000);
    });

    it('should scale duration estimate inversely with speed', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(
        makeRequest({ text: 'one two three four five', speed: 2.0 }),
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.durationMs).toBe(1000);
    });

    it('should enforce a minimum duration of 100ms', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(makeRequest({ text: '', speed: 1.0 }));

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.durationMs).toBe(100);
    });

    it('should use first Cartesia voice as default when none specified', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ voice: null }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.voice.id).toBe(DEFAULT_VOICE_ID);
    });

    it('should use the specified voice when provided', async () => {
      const customVoiceId = 'bf991597-6c13-47e4-8411-91ec2de5c466';
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ voice: customVoiceId }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.voice.id).toBe(customVoiceId);
    });

    it('should send Cartesia-specific request body format', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ text: 'Test text' }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.model_id).toBe('sonic-2');
      expect(body.transcript).toBe('Test text');
      expect(body.voice.mode).toBe('id');
      expect(body.language).toBe('en');
      expect(body.output_format).toEqual({
        container: 'mp3',
        bit_rate: 128000,
        sample_rate: 44100,
      });
    });

    it('should send X-API-Key header (not Bearer token)', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers['X-API-Key']).toBe(API_KEY);
      expect(fetchCall[1].headers.Authorization).toBeUndefined();
    });

    it('should send Cartesia-Version header', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers['Cartesia-Version']).toBe('2024-06-10');
    });

    it('should send Content-Type application/json header', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
    });

    it('should call the correct Cartesia TTS endpoint', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.cartesia.ai/tts/bytes');
    });

    it('should accept English language explicitly', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(makeRequest({ language: 'en' }));

      expect(isOk(result)).toBe(true);
    });

    it('should accept en-US variant as English', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(makeRequest({ language: 'en-US' }));

      expect(isOk(result)).toBe(true);
    });

    it('should accept en-GB variant as English', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(makeRequest({ language: 'en-GB' }));

      expect(isOk(result)).toBe(true);
    });

    it('should accept null language (no language guard applied)', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(makeRequest({ language: null }));

      expect(isOk(result)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // generateAudio - unsupported language
  // -----------------------------------------------------------------------

  describe('generateAudio() - unsupported language', () => {
    it('should return Err with unsupported_language for French', async () => {
      const result = await adapter.generateAudio(makeRequest({ language: 'fr' }));

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('unsupported_language');
      if (result.error.type === 'unsupported_language') {
        expect(result.error.language).toBe('fr');
      }
    });

    it('should return Err with unsupported_language for Spanish', async () => {
      const result = await adapter.generateAudio(makeRequest({ language: 'es' }));

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('unsupported_language');
    });

    it('should return Err with unsupported_language for Japanese', async () => {
      const result = await adapter.generateAudio(makeRequest({ language: 'ja' }));

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('unsupported_language');
    });

    it('should return Err for non-English BCP-47 variant (fr-FR)', async () => {
      const result = await adapter.generateAudio(makeRequest({ language: 'fr-FR' }));

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('unsupported_language');
      if (result.error.type === 'unsupported_language') {
        expect(result.error.language).toBe('fr-FR');
      }
    });

    it('should not call fetch when language is unsupported', async () => {
      await adapter.generateAudio(makeRequest({ language: 'de' }));

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // generateAudio - credential errors
  // -----------------------------------------------------------------------

  describe('generateAudio() - credential errors', () => {
    it('should return Err with invalid_credentials when API key is empty', async () => {
      const noKeyAdapter = new CartesiaAudioAdapter('');

      const result = await noKeyAdapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('invalid_credentials');
    });

    it('should not call fetch when API key is empty', async () => {
      const noKeyAdapter = new CartesiaAudioAdapter('');

      await noKeyAdapter.generateAudio(makeRequest());

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // generateAudio - HTTP errors
  // -----------------------------------------------------------------------

  describe('generateAudio() - HTTP errors', () => {
    it('should return invalid_credentials for HTTP 401', async () => {
      mockFetchStatus(401);

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('invalid_credentials');
    });

    it('should return rate_limit with retryAfterMs for HTTP 429', async () => {
      mockFetchStatus(429);

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('rate_limit');
      if (result.error.type === 'rate_limit') {
        expect(result.error.retryAfterMs).toBe(60000);
      }
    });

    it('should return provider_error for HTTP 500', async () => {
      mockFetchStatus(500);

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('provider_error');
      if (result.error.type === 'provider_error') {
        expect(result.error.message).toBe('HTTP 500');
        expect(result.error.code).toBe('cartesia');
      }
    });

    it('should return provider_error for HTTP 400', async () => {
      mockFetchStatus(400);

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('provider_error');
      if (result.error.type === 'provider_error') {
        expect(result.error.message).toBe('HTTP 400');
      }
    });

    it('should return provider_error for HTTP 503', async () => {
      mockFetchStatus(503);

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('provider_error');
    });
  });

  // -----------------------------------------------------------------------
  // generateAudio - network errors
  // -----------------------------------------------------------------------

  describe('generateAudio() - network errors', () => {
    it('should return network error for "Failed to fetch"', async () => {
      mockFetchNetworkError('Failed to fetch');

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('network');
      if (result.error.type === 'network') {
        expect(result.error.message).toContain('Failed to fetch');
      }
    });

    it('should return network error for fetch-related messages', async () => {
      mockFetchNetworkError('network error occurred');

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('network');
    });

    it('should return provider_error for non-network exceptions', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('unexpected error'));

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('provider_error');
      if (result.error.type === 'provider_error') {
        expect(result.error.message).toContain('unexpected error');
      }
    });

    it('should handle non-Error thrown values', async () => {
      (global.fetch as jest.Mock).mockRejectedValue('string-error');

      const result = await adapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('provider_error');
      if (result.error.type === 'provider_error') {
        expect(result.error.message).toBe('string-error');
      }
    });
  });

  // -----------------------------------------------------------------------
  // getVoices
  // -----------------------------------------------------------------------

  describe('getVoices()', () => {
    it('should return Ok with array of 8 voices', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(8);
    });

    it('should return voices with correct Voice interface shape', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      for (const voice of result.value) {
        expect(typeof voice.id).toBe('string');
        expect(typeof voice.name).toBe('string');
        expect(voice.language === null || typeof voice.language === 'string').toBe(true);
        expect(
          voice.gender === null || ['male', 'female', 'neutral'].includes(voice.gender),
        ).toBe(true);
      }
    });

    it('should include known Cartesia voices', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const names = result.value.map((v) => v.name);
      expect(names).toContain('Barbershop Man');
      expect(names).toContain('British Lady');
      expect(names).toContain('Newsman');
      expect(names).toContain('Reading Man');
    });

    it('should return voices with UUID-format IDs', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      for (const voice of result.value) {
        expect(voice.id).toMatch(uuidRegex);
      }
    });

    it('should return all voices with language "en"', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      for (const voice of result.value) {
        expect(voice.language).toBe('en');
      }
    });

    it('should return all voices when language filter is "en"', async () => {
      const result = await adapter.getVoices('en');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(8);
    });

    it('should return all voices when language filter is "en-US"', async () => {
      const result = await adapter.getVoices('en-US');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(8);
    });

    it('should return empty array for non-English language filter', async () => {
      const result = await adapter.getVoices('fr');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(0);
    });

    it('should return empty array for Japanese language filter', async () => {
      const result = await adapter.getVoices('ja');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(0);
    });

    it('should return all voices when no language filter is provided', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(8);
    });

    it('should return a copy (not a reference to internal array)', async () => {
      const result1 = await adapter.getVoices();
      const result2 = await adapter.getVoices();

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);
      if (!isOk(result1) || !isOk(result2)) return;
      expect(result1.value).not.toBe(result2.value);
      expect(result1.value).toEqual(result2.value);
    });
  });

  // -----------------------------------------------------------------------
  // validateCredentials
  // -----------------------------------------------------------------------

  describe('validateCredentials()', () => {
    it('should return true when API key is set', async () => {
      expect(await adapter.validateCredentials()).toBe(true);
    });

    it('should return false when API key is empty', async () => {
      const noKeyAdapter = new CartesiaAudioAdapter('');
      expect(await noKeyAdapter.validateCredentials()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setApiKey
  // -----------------------------------------------------------------------

  describe('setApiKey()', () => {
    it('should update the API key used for requests', async () => {
      mockFetchOk();
      adapter.setApiKey('cart-new-key');

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers['X-API-Key']).toBe('cart-new-key');
    });

    it('should cause validateCredentials to reflect new key', async () => {
      adapter.setApiKey('');
      expect(await adapter.validateCredentials()).toBe(false);

      adapter.setApiKey('cart-restored');
      expect(await adapter.validateCredentials()).toBe(true);
    });
  });
});
