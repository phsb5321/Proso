/**
 * OpenAI Audio Adapter Unit Tests
 *
 * Tests for OpenAiAudioAdapter implementing IAudioGenerator port.
 * Mocks global.fetch to control API responses.
 *
 * @module tests/unit/adapters/audio/openai-audio.adapter
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OpenAiAudioAdapter } from '../../../../src/adapters/audio/openai-audio.adapter';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenAiAudioAdapter', () => {
  let adapter: OpenAiAudioAdapter;
  const API_KEY = 'sk-test-key-1234';

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof global.fetch;
    adapter = new OpenAiAudioAdapter(API_KEY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Static properties
  // -----------------------------------------------------------------------

  describe('static properties', () => {
    it('should have providerId of "openai"', () => {
      expect(adapter.providerId).toBe('openai');
    });

    it('should have playbackMode of "blob"', () => {
      expect(adapter.playbackMode).toBe('blob');
    });

    it('should not support word timing', () => {
      expect(adapter.supportsWordTiming).toBe(false);
    });

    it('should support all languages (empty array)', () => {
      expect(adapter.supportedLanguages).toEqual([]);
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

    it('should return null wordTimings (no word-level timing support)', async () => {
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
      // 5 words at 150 wpm = 5 * 60000 / 150 = 2000ms
      expect(result.value.durationMs).toBe(2000);
    });

    it('should scale duration estimate inversely with speed', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(
        makeRequest({ text: 'one two three four five', speed: 2.0 }),
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      // 5 words at 150 wpm * 2.0 speed = 5 * 60000 / 300 = 1000ms
      expect(result.value.durationMs).toBe(1000);
    });

    it('should enforce a minimum duration of 100ms', async () => {
      mockFetchOk();

      const result = await adapter.generateAudio(makeRequest({ text: '', speed: 1.0 }));

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.durationMs).toBe(100);
    });

    it('should use "alloy" as default voice when none specified', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ voice: null }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.voice).toBe('alloy');
    });

    it('should use the specified voice when provided', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ voice: 'nova' }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.voice).toBe('nova');
    });

    it('should pass text, model, speed, and response_format in the request body', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ text: 'Test text', speed: 1.5 }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.model).toBe('gpt-4o-mini-tts');
      expect(body.input).toBe('Test text');
      expect(body.speed).toBe(1.5);
      expect(body.response_format).toBe('mp3');
    });

    it('should send Authorization header with Bearer token', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers.Authorization).toBe(`Bearer ${API_KEY}`);
    });

    it('should send Content-Type application/json header', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
    });

    it('should call the correct OpenAI TTS endpoint', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.openai.com/v1/audio/speech');
    });
  });

  // -----------------------------------------------------------------------
  // generateAudio - credential errors
  // -----------------------------------------------------------------------

  describe('generateAudio() - credential errors', () => {
    it('should return Err with invalid_credentials when API key is empty', async () => {
      const noKeyAdapter = new OpenAiAudioAdapter('');

      const result = await noKeyAdapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('invalid_credentials');
    });

    it('should not call fetch when API key is empty', async () => {
      const noKeyAdapter = new OpenAiAudioAdapter('');

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
        expect(result.error.code).toBe('openai');
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
    it('should return Ok with array of 9 voices', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(9);
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

    it('should include known OpenAI voices', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const ids = result.value.map((v) => v.id);
      expect(ids).toContain('alloy');
      expect(ids).toContain('nova');
      expect(ids).toContain('echo');
      expect(ids).toContain('shimmer');
    });

    it('should return voices with null language (all languages supported)', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      for (const voice of result.value) {
        expect(voice.language).toBeNull();
      }
    });

    it('should return the same voices regardless of language filter', async () => {
      const allResult = await adapter.getVoices();
      const enResult = await adapter.getVoices('en');
      const frResult = await adapter.getVoices('fr');

      expect(isOk(allResult)).toBe(true);
      expect(isOk(enResult)).toBe(true);
      expect(isOk(frResult)).toBe(true);
      if (!isOk(allResult) || !isOk(enResult) || !isOk(frResult)) return;
      expect(enResult.value).toEqual(allResult.value);
      expect(frResult.value).toEqual(allResult.value);
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
      const noKeyAdapter = new OpenAiAudioAdapter('');
      expect(await noKeyAdapter.validateCredentials()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setApiKey
  // -----------------------------------------------------------------------

  describe('setApiKey()', () => {
    it('should update the API key used for requests', async () => {
      mockFetchOk();
      adapter.setApiKey('sk-new-key');

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers.Authorization).toBe('Bearer sk-new-key');
    });

    it('should cause validateCredentials to reflect new key', async () => {
      adapter.setApiKey('');
      expect(await adapter.validateCredentials()).toBe(false);

      adapter.setApiKey('sk-restored');
      expect(await adapter.validateCredentials()).toBe(true);
    });
  });
});
