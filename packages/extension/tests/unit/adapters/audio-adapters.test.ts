/**
 * Audio Adapter Unit Tests
 *
 * Tests for all audio generator adapters using the contract test suite
 * and mock implementations.
 *
 * @module tests/unit/adapters/audio-adapters
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockAudioGenerator, MockAudioGenerator } from '../../mocks/mock-audio-generator';
import { runAudioGeneratorContractTests } from '../../contract/audio-generator.contract.test';
import { isOk, isErr } from '../../../src/core/shared/result';

// Run contract tests against mock adapter
runAudioGeneratorContractTests(
  'MockAudioGenerator',
  () => createMockAudioGenerator()
);

describe('MockAudioGenerator additional tests', () => {
  let mock: MockAudioGenerator;

  beforeEach(() => {
    mock = createMockAudioGenerator();
  });

  describe('tracking', () => {
    it('should track generateAudio calls', async () => {
      await mock.generateAudio({
        text: 'Hello world',
        voice: null,
        speed: 1.0,
        language: 'en',
      });

      expect(mock.generateAudioCalls).toHaveLength(1);
      expect(mock.generateAudioCalls[0].text).toBe('Hello world');
    });

    it('should track getVoices calls', async () => {
      await mock.getVoices('en');
      await mock.getVoices('fr');

      expect(mock.getVoicesCalls).toEqual(['en', 'fr']);
    });

    it('should track validateCredentials calls', async () => {
      await mock.validateCredentials();
      await mock.validateCredentials();

      expect(mock.validateCredentialsCalls).toBe(2);
    });

    it('should reset tracking', async () => {
      await mock.generateAudio({
        text: 'Test',
        voice: null,
        speed: 1.0,
        language: null,
      });
      await mock.getVoices();
      await mock.validateCredentials();

      mock.reset();

      expect(mock.generateAudioCalls).toHaveLength(0);
      expect(mock.getVoicesCalls).toHaveLength(0);
      expect(mock.validateCredentialsCalls).toBe(0);
    });
  });

  describe('error simulation', () => {
    it('should return forced error on generateAudio', async () => {
      mock.setForceError({
        type: 'network',
        message: 'Connection failed',
      });

      const result = await mock.generateAudio({
        text: 'Test',
        voice: null,
        speed: 1.0,
        language: null,
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('network');
      }
    });

    it('should return forced error on getVoices', async () => {
      mock.setForceError({
        type: 'invalid_credentials',
      });

      const result = await mock.getVoices();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('invalid_credentials');
      }
    });
  });

  describe('latency simulation', () => {
    it('should simulate network latency', async () => {
      mock.setLatency(50);

      const start = Date.now();
      await mock.generateAudio({
        text: 'Test',
        voice: null,
        speed: 1.0,
        language: null,
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });

  describe('word timing support', () => {
    it('should return word timings when enabled', async () => {
      const mockWithTiming = createMockAudioGenerator({
        supportsWordTiming: true,
      });

      const result = await mockWithTiming.generateAudio({
        text: 'Hello world test',
        voice: null,
        speed: 1.0,
        language: null,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.wordTimings).not.toBeNull();
        expect(result.value.wordTimings).toHaveLength(3);
      }
    });

    it('should not return word timings when disabled', async () => {
      const mockWithoutTiming = createMockAudioGenerator({
        supportsWordTiming: false,
      });

      const result = await mockWithoutTiming.generateAudio({
        text: 'Hello world test',
        voice: null,
        speed: 1.0,
        language: null,
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.wordTimings).toBeNull();
      }
    });
  });

  describe('credentials validation', () => {
    it('should return configured validation result', async () => {
      const validMock = createMockAudioGenerator({ credentialsValid: true });
      const invalidMock = createMockAudioGenerator({ credentialsValid: false });

      expect(await validMock.validateCredentials()).toBe(true);
      expect(await invalidMock.validateCredentials()).toBe(false);
    });

    it('should update validation result dynamically', async () => {
      expect(await mock.validateCredentials()).toBe(true);

      mock.setCredentialsValid(false);
      expect(await mock.validateCredentials()).toBe(false);

      mock.setCredentialsValid(true);
      expect(await mock.validateCredentials()).toBe(true);
    });
  });

  describe('voice management', () => {
    it('should return custom voices', async () => {
      const customVoices = [
        { id: 'custom-1', name: 'Custom Voice', language: 'en', gender: 'neutral' as const },
      ];

      mock.setVoices(customVoices);

      const result = await mock.getVoices();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(customVoices);
      }
    });

    it('should filter voices by language', async () => {
      mock.setVoices([
        { id: 'en-1', name: 'English', language: 'en', gender: 'neutral' },
        { id: 'fr-1', name: 'French', language: 'fr', gender: 'neutral' },
        { id: 'all-1', name: 'All Languages', language: null, gender: 'neutral' },
      ]);

      const result = await mock.getVoices('en');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should include 'en' voices and null language voices
        expect(result.value).toHaveLength(2);
        expect(result.value.map((v) => v.id)).toContain('en-1');
        expect(result.value.map((v) => v.id)).toContain('all-1');
      }
    });
  });
});
