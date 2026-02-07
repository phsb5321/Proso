/**
 * Browser TTS Audio Generator Contract Tests
 *
 * Runs the IAudioGenerator contract test suite against BrowserTtsAudioAdapter.
 * Verifies the adapter fulfills the port interface contract.
 *
 * @module tests/contract/browser-tts-audio-generator
 */

import { jest } from '@jest/globals';
import { BrowserTtsAudioAdapter } from '../../src/adapters/audio/browser-tts-audio.adapter';
import { runAudioGeneratorContractTests } from './audio-generator.contract.test';

// Set up speechSynthesis mock before contract tests run
beforeEach(() => {
  const mockVoices = [
    {
      voiceURI: 'en-US-default',
      name: 'English US',
      lang: 'en-US',
      localService: true,
      default: true,
    },
    {
      voiceURI: 'fr-FR-default',
      name: 'French',
      lang: 'fr-FR',
      localService: true,
      default: false,
    },
  ];

  (global as Record<string, unknown>).speechSynthesis = {
    getVoices: jest.fn<() => typeof mockVoices>(() => mockVoices),
    speak: jest.fn<(...args: unknown[]) => void>((...args: unknown[]) => {
      const utterance = args[0] as { onend?: (ev: unknown) => void };
      // Auto-fire onend to simulate speech completion
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
  };

  (global as Record<string, unknown>).SpeechSynthesisUtterance = jest
    .fn<(...args: unknown[]) => Record<string, unknown>>()
    .mockImplementation((...args: unknown[]) => ({
      text: (args[0] as string) ?? '',
      voice: null,
      rate: 1,
      lang: '',
      onend: null,
      onerror: null,
      onboundary: null,
    }));
});

// Run the shared contract tests against BrowserTtsAudioAdapter
runAudioGeneratorContractTests('BrowserTtsAudioAdapter', () => new BrowserTtsAudioAdapter());
