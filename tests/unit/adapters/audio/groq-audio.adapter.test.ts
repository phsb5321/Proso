/**
 * Groq Audio Adapter Unit Tests
 *
 * Tests for GroqAudioAdapter implementing IAudioGenerator port.
 * Mocks global.fetch to control API responses.
 *
 * @module tests/unit/adapters/audio/groq-audio.adapter
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { GroqAudioAdapter } from '../../../../src/adapters/audio/groq-audio.adapter';
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
  const responseBlob = blob ?? new Blob(['fake-audio'], { type: 'audio/wav' });
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

describe('GroqAudioAdapter', () => {
  let adapter: GroqAudioAdapter;
  const API_KEY = 'gsk-test-key-1234';

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof global.fetch;
    adapter = new GroqAudioAdapter(API_KEY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Static properties
  // -----------------------------------------------------------------------

  describe('static properties', () => {
    it('should have providerId of "groq"', () => {
      expect(adapter.providerId).toBe('groq');
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
      const audioBlob = new Blob(['wav-data'], { type: 'audio/wav' });
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

    it('should use "Fritz-PlayAI" as default voice when none specified', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ voice: null }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.voice).toBe('Fritz-PlayAI');
    });

    it('should use the specified voice when provided', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ voice: 'Atlas-PlayAI' }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.voice).toBe('Atlas-PlayAI');
    });

    it('should pass model, input, speed, and response_format in request body', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest({ text: 'Test text', speed: 1.5 }));

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.model).toBe('playai-tts');
      expect(body.input).toBe('Test text');
      expect(body.speed).toBe(1.5);
      expect(body.response_format).toBe('wav');
    });

    it('should send Authorization header with Bearer token', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers.Authorization).toBe(`Bearer ${API_KEY}`);
    });

    it('should call the correct Groq TTS endpoint', async () => {
      mockFetchOk();

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.groq.com/openai/v1/audio/speech');
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
      const noKeyAdapter = new GroqAudioAdapter('');

      const result = await noKeyAdapter.generateAudio(makeRequest());

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('invalid_credentials');
    });

    it('should not call fetch when API key is empty', async () => {
      const noKeyAdapter = new GroqAudioAdapter('');

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
        expect(result.error.code).toBe('groq');
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
    it('should return Ok with array of 19 voices', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(19);
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

    it('should include known Groq voices', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const ids = result.value.map((v) => v.id);
      expect(ids).toContain('Fritz-PlayAI');
      expect(ids).toContain('Atlas-PlayAI');
      expect(ids).toContain('Arista-PlayAI');
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
      expect(result.value).toHaveLength(19);
    });

    it('should return all voices when language filter is "en-US"', async () => {
      const result = await adapter.getVoices('en-US');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(19);
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
      expect(result.value).toHaveLength(19);
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
      const noKeyAdapter = new GroqAudioAdapter('');
      expect(await noKeyAdapter.validateCredentials()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // setApiKey
  // -----------------------------------------------------------------------

  describe('setApiKey()', () => {
    it('should update the API key used for requests', async () => {
      mockFetchOk();
      adapter.setApiKey('gsk-new-key');

      await adapter.generateAudio(makeRequest());

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers.Authorization).toBe('Bearer gsk-new-key');
    });

    it('should cause validateCredentials to reflect new key', async () => {
      adapter.setApiKey('');
      expect(await adapter.validateCredentials()).toBe(false);

      adapter.setApiKey('gsk-restored');
      expect(await adapter.validateCredentials()).toBe(true);
    });
  });
});
