/**
 * Instant audio generator for playback tests.
 *
 * Resolves synthesis immediately with a tiny audio blob so a test can focus on
 * ordering, lifecycle and error handling instead of synthesis timing.
 *
 * @module tests/helpers/instant-audio-generator
 */

import { jest } from '@jest/globals';

import { Ok } from '../../src/core/shared/result';
import type { IAudioGenerator } from '../../src/ports/audio-generator.port';

export function createInstantAudioGenerator(): IAudioGenerator {
  return {
    providerId: 'elevenlabs',
    supportsWordTiming: false,
    supportedLanguages: [],
    generateAudio: jest.fn(async () =>
      Ok({
        audioBlob: new Blob(['audio'], { type: 'audio/mpeg' }),
        durationMs: 1_000,
        wordTimings: null,
      }),
    ),
    getVoices: jest.fn(async () => Ok([])),
    validateCredentials: jest.fn(async () => true),
  } as unknown as IAudioGenerator;
}
