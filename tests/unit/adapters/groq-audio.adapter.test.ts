/**
 * Groq Audio Adapter Unit Tests
 *
 * Tests for the GroqAudioAdapter implementing IAudioGenerator port.
 * Uses mocked fetch for API calls.
 * 
 * Updated 2026-01-23: Only Orpheus model is available
 *
 * @module tests/unit/adapters/groq-audio
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { GroqAudioAdapter } from '../../../src/adapters/audio/groq-audio.adapter';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('GroqAudioAdapter', () => {
  const testApiKey = 'gsk_test_key_12345';
  let adapter: GroqAudioAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new GroqAudioAdapter(testApiKey);
  });

  describe('constructor', () => {
    it('initializes with default model (orpheus)', () => {
      const adapter = new GroqAudioAdapter(testApiKey);
      expect(adapter.getModel()).toBe('canopylabs/orpheus-v1-english');
    });

    it('initializes with specified model', () => {
      const adapter = new GroqAudioAdapter(testApiKey, 'canopylabs/orpheus-v1-english');
      expect(adapter.getModel()).toBe('canopylabs/orpheus-v1-english');
    });

    it('has correct providerId', () => {
      expect(adapter.providerId).toBe('groq');
    });

    it('does not support word timing', () => {
      expect(adapter.supportsWordTiming).toBe(false);
    });

    it('supports English language', () => {
      expect(adapter.supportedLanguages).toContain('en');
    });
  });

  describe('generateAudio', () => {
    it('generates audio successfully', async () => {
      const mockAudioBlob = new Blob(['fake audio data'], { type: 'audio/wav' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockAudioBlob),
      } as unknown as Response);

      const result = await adapter.generateAudio({
        text: 'Hello world',
        voice: 'troy',
        speed: 1.0,
        language: 'en',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.audioBlob).toBe(mockAudioBlob);
        expect(result.value.wordTimings).toBeNull();
      }
    });

    it('returns error for invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: {
              message: 'Invalid API Key provided',
              type: 'authentication_error',
              code: 'invalid_api_key',
            },
          }),
      } as unknown as Response);

      const result = await adapter.generateAudio({
        text: 'Hello world',
        voice: null,
        speed: 1.0,
        language: null,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('invalid_credentials');
      }
    });

    it('returns error for rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            error: {
              message: 'Rate limit exceeded',
              type: 'rate_limit_error',
              code: 'rate_limit_exceeded',
            },
          }),
      } as unknown as Response);

      const result = await adapter.generateAudio({
        text: 'Hello world',
        voice: null,
        speed: 1.0,
        language: null,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('rate_limit');
      }
    });

    it('returns error for unsupported language', async () => {
      const result = await adapter.generateAudio({
        text: 'Hola mundo',
        voice: null,
        speed: 1.0,
        language: 'es', // Spanish not supported
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('unsupported_language');
      }
    });

    it('accepts English language code', async () => {
      const mockAudioBlob = new Blob(['fake audio data'], { type: 'audio/wav' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockAudioBlob),
      } as unknown as Response);

      const result = await adapter.generateAudio({
        text: 'Hello world',
        voice: null,
        speed: 1.0,
        language: 'en-US',
      });

      expect(result.ok).toBe(true);
    });

    it('returns error when API key not set', async () => {
      const adapterNoKey = new GroqAudioAdapter('');

      const result = await adapterNoKey.generateAudio({
        text: 'Hello world',
        voice: null,
        speed: 1.0,
        language: null,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('invalid_credentials');
      }
    });

    it('uses default voice when none specified', async () => {
      const mockAudioBlob = new Blob(['fake audio data'], { type: 'audio/wav' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockAudioBlob),
      } as unknown as Response);

      await adapter.generateAudio({
        text: 'Hello world',
        voice: null,
        speed: 1.0,
        language: null,
      });

      // Verify the request includes default voice
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
      const body = JSON.parse(options?.body as string);
      expect(body.voice).toBe('troy'); // Default voice for orpheus
    });
  });

  describe('getVoices', () => {
    it('returns voices for Orpheus model', async () => {
      const adapter = new GroqAudioAdapter(testApiKey, 'canopylabs/orpheus-v1-english');
      const result = await adapter.getVoices();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value[0]).toHaveProperty('id');
        expect(result.value[0]).toHaveProperty('name');
        expect(result.value[0]).toHaveProperty('gender');
      }
    });

    it('returns 6 voices for Orpheus model', async () => {
      const adapter = new GroqAudioAdapter(testApiKey, 'canopylabs/orpheus-v1-english');
      const result = await adapter.getVoices();

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Orpheus has 6 voices: autumn, diana, hannah, austin, daniel, troy
        expect(result.value.length).toBe(6);
      }
    });
  });

  describe('validateCredentials', () => {
    it('returns true for valid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob()),
      } as unknown as Response);

      const isValid = await adapter.validateCredentials();
      expect(isValid).toBe(true);
    });

    it('returns false for 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Invalid API key' } }),
      } as unknown as Response);

      const isValid = await adapter.validateCredentials();
      expect(isValid).toBe(false);
    });

    it('returns false when no API key set', async () => {
      const adapterNoKey = new GroqAudioAdapter('');
      const isValid = await adapterNoKey.validateCredentials();
      expect(isValid).toBe(false);
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const isValid = await adapter.validateCredentials();
      expect(isValid).toBe(false);
    });
  });

  describe('setApiKey', () => {
    it('updates the API key', async () => {
      const mockAudioBlob = new Blob(['fake audio data'], { type: 'audio/wav' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockAudioBlob),
      } as unknown as Response);

      adapter.setApiKey('new_api_key');

      await adapter.generateAudio({
        text: 'Test',
        voice: null,
        speed: 1.0,
        language: null,
      });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
      const headers = options?.headers as Record<string, string>;
      expect(headers?.Authorization).toBe('Bearer new_api_key');
    });
  });

  describe('setModel', () => {
    it('changes the active model', () => {
      expect(adapter.getModel()).toBe('canopylabs/orpheus-v1-english');

      adapter.setModel('canopylabs/orpheus-v1-english');
      expect(adapter.getModel()).toBe('canopylabs/orpheus-v1-english');
    });
  });
});
