/**
 * Mock Audio Generator
 *
 * Mock implementation of IAudioGenerator for testing.
 * Returns predictable results without network calls.
 *
 * @module tests/mocks/mock-audio-generator
 */

import type {
  IAudioGenerator,
  AudioRequest,
  AudioResponse,
  Voice,
} from '../../src/ports/audio-generator.port';
import type { Result } from '../../src/core/shared/result';
import type { AudioError, ProviderId } from '../../src/core/shared/errors';
import { Ok, Err } from '../../src/core/shared/result';

/**
 * Configuration for mock audio generator.
 */
export interface MockAudioGeneratorConfig {
  /** Provider ID to report */
  providerId?: ProviderId;
  /** Whether to simulate word timing support */
  supportsWordTiming?: boolean;
  /** Supported languages (empty = all) */
  supportedLanguages?: readonly string[];
  /** Delay in ms to simulate network latency */
  latencyMs?: number;
  /** Force specific error */
  forceError?: AudioError | null;
  /** Credential validation result */
  credentialsValid?: boolean;
  /** Available voices */
  voices?: Voice[];
}

/**
 * Mock audio generator for testing PlaybackService.
 */
export class MockAudioGenerator implements IAudioGenerator {
  readonly providerId: ProviderId;
  readonly supportsWordTiming: boolean;
  readonly supportedLanguages: readonly string[];

  private latencyMs: number;
  private forceError: AudioError | null;
  private credentialsValid: boolean;
  private voices: Voice[];

  // Tracking for test assertions
  public generateAudioCalls: AudioRequest[] = [];
  public getVoicesCalls: (string | undefined)[] = [];
  public validateCredentialsCalls: number = 0;

  constructor(config: MockAudioGeneratorConfig = {}) {
    this.providerId = config.providerId ?? 'elevenlabs';
    this.supportsWordTiming = config.supportsWordTiming ?? false;
    this.supportedLanguages = config.supportedLanguages ?? [];
    this.latencyMs = config.latencyMs ?? 0;
    this.forceError = config.forceError ?? null;
    this.credentialsValid = config.credentialsValid ?? true;
    this.voices = config.voices ?? [
      { id: 'mock-voice-1', name: 'Mock Voice 1', language: 'en', gender: 'neutral' },
      { id: 'mock-voice-2', name: 'Mock Voice 2', language: 'en', gender: 'female' },
    ];
  }

  async generateAudio(
    request: AudioRequest
  ): Promise<Result<AudioResponse, AudioError>> {
    this.generateAudioCalls.push(request);

    // Simulate latency
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    // Return forced error if configured
    if (this.forceError) {
      return Err(this.forceError);
    }

    // Generate mock audio
    const wordCount = request.text.split(/\s+/).filter(Boolean).length;
    const durationMs = Math.max(100, wordCount * 300 / request.speed);

    // Create minimal audio blob (empty wav header)
    const audioBlob = new Blob(
      [new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // "RIFF"
        0x24, 0x00, 0x00, 0x00, // File size (36 bytes)
        0x57, 0x41, 0x56, 0x45, // "WAVE"
        0x66, 0x6D, 0x74, 0x20, // "fmt "
        0x10, 0x00, 0x00, 0x00, // Subchunk1Size (16)
        0x01, 0x00,             // AudioFormat (1 = PCM)
        0x01, 0x00,             // NumChannels (1)
        0x22, 0x56, 0x00, 0x00, // SampleRate (22050)
        0x44, 0xAC, 0x00, 0x00, // ByteRate
        0x02, 0x00,             // BlockAlign
        0x10, 0x00,             // BitsPerSample (16)
        0x64, 0x61, 0x74, 0x61, // "data"
        0x00, 0x00, 0x00, 0x00, // Subchunk2Size (0)
      ])],
      { type: 'audio/wav' }
    );

    // Generate word timings if supported
    let wordTimings = null;
    if (this.supportsWordTiming) {
      const words = request.text.split(/\s+/).filter(Boolean);
      let currentTime = 0;
      wordTimings = words.map((word) => {
        const wordDuration = (durationMs / words.length);
        const timing = {
          word,
          startMs: currentTime,
          endMs: currentTime + wordDuration,
        };
        currentTime += wordDuration;
        return timing;
      });
    }

    return Ok({
      audioBlob,
      durationMs,
      wordTimings,
    });
  }

  async getVoices(language?: string): Promise<Result<Voice[], AudioError>> {
    this.getVoicesCalls.push(language);

    // Simulate latency
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    // Return forced error if configured
    if (this.forceError) {
      return Err(this.forceError);
    }

    // Filter by language if specified
    let voices = this.voices;
    if (language) {
      voices = voices.filter(
        (v) => v.language === null || v.language === language
      );
    }

    return Ok(voices);
  }

  async validateCredentials(): Promise<boolean> {
    this.validateCredentialsCalls++;

    // Simulate latency
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    return this.credentialsValid;
  }

  // Test helpers

  /**
   * Reset all tracking counters.
   */
  reset(): void {
    this.generateAudioCalls = [];
    this.getVoicesCalls = [];
    this.validateCredentialsCalls = 0;
  }

  /**
   * Set forced error for next calls.
   */
  setForceError(error: AudioError | null): void {
    this.forceError = error;
  }

  /**
   * Set credential validation result.
   */
  setCredentialsValid(valid: boolean): void {
    this.credentialsValid = valid;
  }

  /**
   * Set latency for simulated network delay.
   */
  setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  /**
   * Set available voices.
   */
  setVoices(voices: Voice[]): void {
    this.voices = voices;
  }
}

/**
 * Create a mock audio generator with default configuration.
 */
export function createMockAudioGenerator(
  config?: MockAudioGeneratorConfig
): MockAudioGenerator {
  return new MockAudioGenerator(config);
}
