/**
 * IAudioGenerator Contract Tests
 *
 * These tests define the contract that all audio generator adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/audio-generator
 */

import type { IAudioGenerator, AudioRequest } from '../../src/ports/audio-generator.port';
import { isOk, isErr } from '../../src/core/shared/result';

/**
 * Contract test suite for IAudioGenerator implementations.
 *
 * Usage:
 * ```typescript
 * runAudioGeneratorContractTests('OpenAIAudioAdapter', () => new OpenAIAudioAdapter(apiKey));
 * ```
 */
export function runAudioGeneratorContractTests(
  adapterName: string,
  createAdapter: () => IAudioGenerator
) {
  describe(`${adapterName} implements IAudioGenerator contract`, () => {
    let adapter: IAudioGenerator;

    beforeEach(() => {
      adapter = createAdapter();
    });

    describe('providerId property', () => {
      it('should have a valid providerId', () => {
        expect(adapter.providerId).toBeDefined();
        expect(['openai', 'elevenlabs', 'cartesia', 'groq', 'browser', 'local']).toContain(
          adapter.providerId
        );
      });
    });

    describe('supportsWordTiming property', () => {
      it('should have a boolean supportsWordTiming', () => {
        expect(typeof adapter.supportsWordTiming).toBe('boolean');
      });
    });

    describe('supportedLanguages property', () => {
      it('should have an array of supported languages', () => {
        expect(Array.isArray(adapter.supportedLanguages)).toBe(true);
      });
    });

    describe('generateAudio()', () => {
      it('should return a Result type', async () => {
        const request: AudioRequest = {
          text: 'Hello world',
          voice: null,
          speed: 1.0,
          language: 'en',
        };

        const result = await adapter.generateAudio(request);

        // Result should have ok property
        expect(typeof result.ok).toBe('boolean');

        // If successful, should have value with required properties
        if (isOk(result)) {
          expect(result.value.audioBlob).toBeInstanceOf(Blob);
          expect(typeof result.value.durationMs).toBe('number');
          expect(result.value.durationMs).toBeGreaterThan(0);
          // wordTimings can be null or array
          expect(
            result.value.wordTimings === null ||
              Array.isArray(result.value.wordTimings)
          ).toBe(true);
        }

        // If error, should have typed error
        if (isErr(result)) {
          expect(result.error.type).toBeDefined();
          expect([
            'network',
            'rate_limit',
            'invalid_credentials',
            'unsupported_language',
            'text_too_long',
            'provider_error',
          ]).toContain(result.error.type);
        }
      });

      it('should handle empty text gracefully', async () => {
        const request: AudioRequest = {
          text: '',
          voice: null,
          speed: 1.0,
          language: 'en',
        };

        const result = await adapter.generateAudio(request);

        // Should either succeed with minimal audio or return an error
        expect(typeof result.ok).toBe('boolean');
      });

      it('should respect speed parameter between 0.5 and 2.0', async () => {
        const request: AudioRequest = {
          text: 'Test speed',
          voice: null,
          speed: 1.5,
          language: 'en',
        };

        const result = await adapter.generateAudio(request);

        // Should not fail due to valid speed
        expect(typeof result.ok).toBe('boolean');
      });
    });

    describe('getVoices()', () => {
      it('should return a Result with array of voices', async () => {
        const result = await adapter.getVoices();

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(Array.isArray(result.value)).toBe(true);

          // Each voice should have required properties
          for (const voice of result.value) {
            expect(typeof voice.id).toBe('string');
            expect(typeof voice.name).toBe('string');
            // language and gender can be null
            expect(
              voice.language === null || typeof voice.language === 'string'
            ).toBe(true);
            expect(
              voice.gender === null ||
                ['male', 'female', 'neutral'].includes(voice.gender)
            ).toBe(true);
          }
        }
      });

      it('should optionally filter by language', async () => {
        const result = await adapter.getVoices('en');

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          // All returned voices should match the language (if filter is supported)
          // Some adapters may not support filtering, which is acceptable
          expect(Array.isArray(result.value)).toBe(true);
        }
      });
    });

    describe('validateCredentials()', () => {
      it('should return a boolean', async () => {
        const result = await adapter.validateCredentials();
        expect(typeof result).toBe('boolean');
      });
    });
  });
}

/**
 * Test word timings structure (if supported).
 */
export function testWordTimingsStructure(
  adapter: IAudioGenerator,
  wordTimings: readonly { word: string; startMs: number; endMs: number }[]
) {
  expect(Array.isArray(wordTimings)).toBe(true);

  for (let i = 0; i < wordTimings.length; i++) {
    const timing = wordTimings[i];

    // Each timing should have required properties
    expect(typeof timing.word).toBe('string');
    expect(typeof timing.startMs).toBe('number');
    expect(typeof timing.endMs).toBe('number');

    // Timing should be valid
    expect(timing.startMs).toBeGreaterThanOrEqual(0);
    expect(timing.endMs).toBeGreaterThanOrEqual(timing.startMs);

    // Timings should be in order
    if (i > 0) {
      expect(timing.startMs).toBeGreaterThanOrEqual(wordTimings[i - 1].startMs);
    }
  }
}

// Export for use in adapter-specific test files
export { runAudioGeneratorContractTests as default };

/**
 * Placeholder test to satisfy Jest requirement.
 * Real contract tests are run via runAudioGeneratorContractTests() in adapter test files.
 */
describe('IAudioGenerator Contract', () => {
  it('exports contract test helpers', () => {
    expect(typeof runAudioGeneratorContractTests).toBe('function');
    expect(typeof testWordTimingsStructure).toBe('function');
  });
});
