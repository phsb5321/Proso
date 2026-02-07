/**
 * Browser TTS Audio Adapter Unit Tests
 *
 * TDD tests for BrowserTtsAudioAdapter implementing IAudioGenerator.
 * Tests are written BEFORE the adapter implementation.
 *
 * @module tests/unit/adapters/browser-tts-audio
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BrowserTtsAudioAdapter } from '../../../src/adapters/audio/browser-tts-audio.adapter';
import { isOk, isErr } from '../../../src/core/shared/result';
import type { AudioRequest, AudioResponse, Voice } from '../../../src/ports/audio-generator.port';
import type { AudioError } from '../../../src/core/shared/errors';
import type { Result } from '../../../src/core/shared/result';

// --- speechSynthesis mock helpers ---

interface MockSpeechSynthesisVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

function createMockVoice(
  overrides: Partial<MockSpeechSynthesisVoice> = {},
): MockSpeechSynthesisVoice {
  return {
    voiceURI: 'mock-uri',
    name: 'Mock Voice',
    lang: 'en-US',
    localService: true,
    default: false,
    ...overrides,
  };
}

interface MockUtterance {
  text: string;
  voice: MockSpeechSynthesisVoice | null;
  rate: number;
  lang: string;
  onend: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onboundary: ((ev: unknown) => void) | null;
}

/**
 * Set up the global speechSynthesis mock.
 * Returns the mock object for assertion access.
 */
function setupSpeechSynthesisMock(voices: MockSpeechSynthesisVoice[] = []) {
  const mockSpeechSynthesis = {
    getVoices: jest.fn<() => MockSpeechSynthesisVoice[]>(() => voices),
    speak: jest.fn<(utterance: MockUtterance) => void>((utterance) => {
      // Auto-fire onend after a microtask to simulate speech completion
      Promise.resolve().then(() => {
        if (utterance.onend) {
          utterance.onend({ type: 'end' });
        }
      });
    }),
    cancel: jest.fn(),
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null as (() => void) | null,
  };

  // Mock SpeechSynthesisUtterance constructor
  const MockUtteranceClass = jest
    .fn<(...args: unknown[]) => MockUtterance>()
    .mockImplementation((...args: unknown[]) => {
      const text = (args[0] as string) ?? '';
      return {
        text,
        voice: null,
        rate: 1,
        lang: '',
        onend: null,
        onerror: null,
        onboundary: null,
      };
    });

  (global as Record<string, unknown>).speechSynthesis = mockSpeechSynthesis;
  (global as Record<string, unknown>).SpeechSynthesisUtterance = MockUtteranceClass;

  return { mockSpeechSynthesis, MockUtteranceClass };
}

describe('BrowserTtsAudioAdapter', () => {
  let adapter: BrowserTtsAudioAdapter;

  beforeEach(() => {
    setupSpeechSynthesisMock([
      createMockVoice({ voiceURI: 'en-voice-1', name: 'English Voice', lang: 'en-US' }),
      createMockVoice({ voiceURI: 'en-voice-2', name: 'English Voice 2', lang: 'en-GB' }),
      createMockVoice({ voiceURI: 'fr-voice-1', name: 'French Voice', lang: 'fr-FR' }),
      createMockVoice({ voiceURI: 'de-voice-1', name: 'German Voice', lang: 'de-DE' }),
    ]);
    adapter = new BrowserTtsAudioAdapter();
  });

  describe('static properties', () => {
    it('should have providerId of "browser"', () => {
      expect(adapter.providerId).toBe('browser');
    });

    it('should have supportsWordTiming set to false', () => {
      expect(adapter.supportsWordTiming).toBe(false);
    });

    it('should have supportedLanguages as an empty array (all languages)', () => {
      expect(adapter.supportedLanguages).toEqual([]);
    });
  });

  describe('validateCredentials()', () => {
    it('should always return true (no API key needed)', async () => {
      const result = await adapter.validateCredentials();
      expect(result).toBe(true);
    });

    it('should return true even when speechSynthesis has no voices', async () => {
      setupSpeechSynthesisMock([]);
      const freshAdapter = new BrowserTtsAudioAdapter();
      const result = await freshAdapter.validateCredentials();
      expect(result).toBe(true);
    });
  });

  describe('getVoices()', () => {
    it('should return available speechSynthesis voices mapped to Voice interface', async () => {
      const result = (await adapter.getVoices()) as Result<Voice[], AudioError>;

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(4);
      // Check Voice interface shape
      for (const voice of result.value) {
        expect(typeof voice.id).toBe('string');
        expect(typeof voice.name).toBe('string');
        expect(voice.language === null || typeof voice.language === 'string').toBe(true);
        expect(
          voice.gender === null || ['male', 'female', 'neutral'].includes(voice.gender),
        ).toBe(true);
      }
    });

    it('should map SpeechSynthesisVoice properties correctly', async () => {
      const result = (await adapter.getVoices()) as Result<Voice[], AudioError>;

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const first = result.value[0];
      expect(first.name).toBe('English Voice');
      // id should be the voiceURI or name (implementation decides)
      expect(first.id).toBeTruthy();
      // language should be mapped from lang
      expect(first.language).toBeTruthy();
    });

    it('should filter voices by language when provided', async () => {
      const result = (await adapter.getVoices('en')) as Result<Voice[], AudioError>;

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      // Should include en-US and en-GB voices (both start with 'en')
      expect(result.value.length).toBeGreaterThanOrEqual(2);
      for (const voice of result.value) {
        expect(voice.language?.startsWith('en')).toBe(true);
      }
    });

    it('should return empty array when no voices match language filter', async () => {
      const result = (await adapter.getVoices('ja')) as Result<Voice[], AudioError>;

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(0);
    });

    it('should return all voices when no language filter is provided', async () => {
      const result = (await adapter.getVoices()) as Result<Voice[], AudioError>;

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(4);
    });

    it('should return empty array when speechSynthesis has no voices', async () => {
      setupSpeechSynthesisMock([]);
      const freshAdapter = new BrowserTtsAudioAdapter();

      const result = (await freshAdapter.getVoices()) as Result<Voice[], AudioError>;

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value).toHaveLength(0);
    });
  });

  describe('generateAudio()', () => {
    it('should use speechSynthesis to speak text', async () => {
      const request: AudioRequest = {
        text: 'Hello world',
        voice: null,
        speed: 1.0,
        language: 'en',
      };

      const result = await adapter.generateAudio(request);

      expect(isOk(result)).toBe(true);
      // Verify speechSynthesis.speak was called
      const synth = (global as Record<string, unknown>).speechSynthesis as {
        speak: jest.Mock;
      };
      expect(synth.speak).toHaveBeenCalled();
    });

    it('should create a SpeechSynthesisUtterance with the correct text', async () => {
      const request: AudioRequest = {
        text: 'Testing speech synthesis',
        voice: null,
        speed: 1.0,
        language: null,
      };

      await adapter.generateAudio(request);

      const UtteranceClass = (global as Record<string, unknown>)
        .SpeechSynthesisUtterance as jest.Mock;
      expect(UtteranceClass).toHaveBeenCalledWith('Testing speech synthesis');
    });

    it('should set the speed/rate on the utterance', async () => {
      const request: AudioRequest = {
        text: 'Fast speech',
        voice: null,
        speed: 1.5,
        language: null,
      };

      await adapter.generateAudio(request);

      const UtteranceClass = (global as Record<string, unknown>)
        .SpeechSynthesisUtterance as jest.Mock;
      const utterance = UtteranceClass.mock.results[0].value as MockUtterance;
      expect(utterance.rate).toBe(1.5);
    });

    it('should return an AudioResponse with null wordTimings', async () => {
      const request: AudioRequest = {
        text: 'No timings',
        voice: null,
        speed: 1.0,
        language: null,
      };

      const result: Result<AudioResponse, AudioError> = await adapter.generateAudio(request);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.wordTimings).toBeNull();
    });

    it('should return an AudioResponse with a Blob', async () => {
      const request: AudioRequest = {
        text: 'Blob test',
        voice: null,
        speed: 1.0,
        language: null,
      };

      const result: Result<AudioResponse, AudioError> = await adapter.generateAudio(request);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.audioBlob).toBeInstanceOf(Blob);
    });

    it('should return an AudioResponse with positive durationMs', async () => {
      const request: AudioRequest = {
        text: 'Duration test',
        voice: null,
        speed: 1.0,
        language: null,
      };

      const result: Result<AudioResponse, AudioError> = await adapter.generateAudio(request);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.durationMs).toBeGreaterThan(0);
    });

    it('should handle speechSynthesis errors', async () => {
      // Override speak to fire onerror
      const synth = (global as Record<string, unknown>).speechSynthesis as {
        speak: jest.Mock;
      };
      synth.speak.mockImplementation((...args: unknown[]) => {
        const utterance = args[0] as { onerror?: (ev: { error: string }) => void };
        Promise.resolve().then(() => {
          if (utterance.onerror) {
            utterance.onerror({ error: 'synthesis-failed' });
          }
        });
      });

      const request: AudioRequest = {
        text: 'Error test',
        voice: null,
        speed: 1.0,
        language: null,
      };

      const result: Result<AudioResponse, AudioError> = await adapter.generateAudio(request);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBeDefined();
    });

    it('should handle empty text gracefully', async () => {
      const request: AudioRequest = {
        text: '',
        voice: null,
        speed: 1.0,
        language: null,
      };

      const result = await adapter.generateAudio(request);

      // Should either succeed or return a typed error, not throw
      expect(typeof result.ok).toBe('boolean');
    });

    it('should set language on utterance when provided', async () => {
      const request: AudioRequest = {
        text: 'Bonjour',
        voice: null,
        speed: 1.0,
        language: 'fr',
      };

      await adapter.generateAudio(request);

      const UtteranceClass = (global as Record<string, unknown>)
        .SpeechSynthesisUtterance as jest.Mock;
      const utterance = UtteranceClass.mock.results[0].value as MockUtterance;
      expect(utterance.lang).toBe('fr');
    });

    it('should set voice on utterance when voice id is provided', async () => {
      const request: AudioRequest = {
        text: 'Voiced speech',
        voice: 'en-voice-1',
        speed: 1.0,
        language: null,
      };

      await adapter.generateAudio(request);

      const UtteranceClass = (global as Record<string, unknown>)
        .SpeechSynthesisUtterance as jest.Mock;
      const utterance = UtteranceClass.mock.results[0].value as MockUtterance;
      // Voice should be set (the adapter should look up the voice by id)
      expect(utterance.voice).toBeTruthy();
    });
  });
});
