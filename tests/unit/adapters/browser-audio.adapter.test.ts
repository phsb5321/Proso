// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Browser Audio Adapter Tests
 * 048-multilingual-tts-pillar: Unit tests for Browser TTS adapter
 *
 * @jest-environment jsdom
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { BrowserAudioAdapter } from '../../../src/adapters/audio/browser-audio.adapter';
import { runAudioGeneratorContractTests } from '../../contract/audio-generator.contract.test';
import { isOk, isErr } from '../../../src/core/shared/result';

// Mock SpeechSynthesis API
const mockVoices: SpeechSynthesisVoice[] = [
  {
    voiceURI: 'Google US English',
    name: 'Google US English',
    lang: 'en-US',
    localService: false,
    default: true,
  } as SpeechSynthesisVoice,
  {
    voiceURI: 'Google Spanish',
    name: 'Google Spanish',
    lang: 'es-ES',
    localService: false,
    default: false,
  } as SpeechSynthesisVoice,
  {
    voiceURI: 'Microsoft Samantha',
    name: 'Microsoft Samantha',
    lang: 'en-US',
    localService: true,
    default: false,
  } as SpeechSynthesisVoice,
];

const mockSpeechSynthesis = {
  getVoices: jest.fn<() => SpeechSynthesisVoice[]>(() => mockVoices),
  speak: jest.fn<(utterance: SpeechSynthesisUtterance) => void>((utterance: SpeechSynthesisUtterance) => {
    // Simulate successful speech
    setTimeout(() => {
      if (utterance.onend) {
        utterance.onend(new Event('end') as SpeechSynthesisEvent);
      }
    }, 10);
  }),
  cancel: jest.fn<() => void>(),
  pause: jest.fn<() => void>(),
  resume: jest.fn<() => void>(),
  onvoiceschanged: null as ((this: SpeechSynthesis, ev: Event) => void) | null,
};

// Setup global speechSynthesis mock
Object.defineProperty(global, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true,
});

// Mock SpeechSynthesisUtterance
class MockSpeechSynthesisUtterance {
  text: string;
  lang: string = '';
  rate: number = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisErrorEvent) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance as unknown as typeof SpeechSynthesisUtterance;

describe('BrowserAudioAdapter', () => {
  let adapter: BrowserAudioAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new BrowserAudioAdapter();
  });

  describe('basic properties', () => {
    it('has correct providerId', () => {
      expect(adapter.providerId).toBe('browser');
    });

    it('does not support word timing', () => {
      expect(adapter.supportsWordTiming).toBe(false);
    });

    it('supports dynamic languages (empty array)', () => {
      expect(adapter.supportedLanguages).toEqual([]);
    });
  });

  describe('generateAudio', () => {
    it('generates audio with valid request', async () => {
      const result = await adapter.generateAudio({
        text: 'Hello world',
        voice: null,
        speed: 1.0,
        language: 'en',
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.audioBlob).toBeInstanceOf(Blob);
        expect(result.value.durationMs).toBeGreaterThan(0);
        expect(result.value.wordTimings).toBeNull();
      }

      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
    });

    it('handles missing SpeechSynthesis API', async () => {
      // Temporarily remove speechSynthesis
      const originalSpeechSynthesis = global.speechSynthesis;
      Object.defineProperty(global, 'speechSynthesis', {
        value: undefined,
        writable: true,
      });

      const newAdapter = new BrowserAudioAdapter();
      const result = await newAdapter.generateAudio({
        text: 'Hello',
        voice: null,
        speed: 1.0,
        language: null,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('provider_error');
      }

      // Restore
      Object.defineProperty(global, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        writable: true,
      });
    });

    it('applies speed setting', async () => {
      await adapter.generateAudio({
        text: 'Test speed',
        voice: null,
        speed: 1.5,
        language: 'en',
      });

      const speakCall = mockSpeechSynthesis.speak.mock.calls[0][0];
      expect(speakCall.rate).toBe(1.5);
    });

    it('sets language on utterance', async () => {
      await adapter.generateAudio({
        text: 'Hola mundo',
        voice: null,
        speed: 1.0,
        language: 'es',
      });

      const speakCall = mockSpeechSynthesis.speak.mock.calls[0][0];
      expect(speakCall.lang).toBe('es');
    });
  });

  describe('getVoices', () => {
    it('returns available system voices', async () => {
      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.length).toBe(mockVoices.length);
        expect(result.value.map((v) => v.id)).toContain('Google US English');
      }
    });

    it('filters voices by language', async () => {
      const result = await adapter.getVoices('en');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should return voices starting with 'en'
        expect(result.value.every((v) => v.language?.startsWith('en'))).toBe(true);
      }
    });

    it('returns all voices when language not found', async () => {
      const result = await adapter.getVoices('zz'); // Non-existent language

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Falls back to all voices
        expect(result.value.length).toBe(mockVoices.length);
      }
    });
  });

  describe('validateCredentials', () => {
    it('returns true when SpeechSynthesis is available', async () => {
      const result = await adapter.validateCredentials();
      expect(result).toBe(true);
    });

    it('returns false when SpeechSynthesis is unavailable', async () => {
      // Temporarily remove speechSynthesis
      const originalSpeechSynthesis = global.speechSynthesis;
      Object.defineProperty(global, 'speechSynthesis', {
        value: undefined,
        writable: true,
      });

      const newAdapter = new BrowserAudioAdapter();
      const result = await newAdapter.validateCredentials();
      expect(result).toBe(false);

      // Restore
      Object.defineProperty(global, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        writable: true,
      });
    });
  });

  describe('control methods', () => {
    it('stop() cancels speech', () => {
      adapter.stop();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });

    it('pause() pauses speech', () => {
      adapter.pause();
      expect(mockSpeechSynthesis.pause).toHaveBeenCalled();
    });

    it('resume() resumes speech', () => {
      adapter.resume();
      expect(mockSpeechSynthesis.resume).toHaveBeenCalled();
    });
  });
});

// Run contract tests with mock adapter
describe('BrowserAudioAdapter Contract Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  runAudioGeneratorContractTests('BrowserAudioAdapter', () => new BrowserAudioAdapter());
});
