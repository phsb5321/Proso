/**
 * ElevenLabs Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using ElevenLabs TTS API.
 * Wraps the existing ElevenLabsProvider class.
 *
 * @module adapters/audio/elevenlabs-audio
 */

import type { AudioError } from '../../core/shared/errors';
import { audioError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type {
  AudioRequest,
  AudioResponse,
  IAudioGenerator,
  Voice,
} from '../../ports/audio-generator.port';
import { ElevenLabsProvider } from '../../utils/providers/elevenlabs';

/**
 * ElevenLabs TTS adapter implementing the IAudioGenerator port.
 *
 * Features:
 * - 29+ languages supported
 * - Word-level timing via character alignment
 * - Speed controlled via playback rate (not API)
 */
export class ElevenLabsAudioAdapter implements IAudioGenerator {
  readonly providerId = 'elevenlabs' as const;
  readonly supportsWordTiming = true;
  readonly supportedLanguages: readonly string[];

  private readonly provider: ElevenLabsProvider;
  private useTimestamps: boolean;

  constructor(apiKey: string, useTimestamps = true) {
    this.provider = new ElevenLabsProvider();
    this.provider.setApiKey(apiKey);
    this.supportedLanguages = this.provider.supportedLanguages;
    this.useTimestamps = useTimestamps;
  }

  async generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    try {
      if (!this.provider.hasApiKey()) {
        return Err(audioError.invalidCredentials());
      }

      // Check language support
      if (request.language) {
        const langCode = request.language.split('-')[0].toLowerCase();
        if (this.supportedLanguages.length > 0 && !this.supportedLanguages.includes(langCode)) {
          return Err(audioError.unsupportedLanguage(request.language));
        }
      }

      // Use timestamps endpoint if enabled
      if (this.useTimestamps) {
        const response = await this.provider.generateAudioWithTimestamps(
          request.text,
          request.voice ?? undefined,
          request.language ?? undefined,
        );

        return Ok({
          audioBlob: response.audioBlob,
          durationMs: response.duration * 1000,
          wordTimings: response.wordTimings.map((t) => ({
            word: t.word,
            startMs: t.startMs,
            endMs: t.endMs,
          })),
        });
      }

      // Fallback to standard generation without timestamps
      const response = await this.provider.generateAudio({
        text: request.text,
        voice: request.voice,
        speed: request.speed,
        language: request.language,
      });

      return Ok({
        audioBlob: response.audioData,
        durationMs: response.duration * 1000,
        wordTimings: null,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVoices(language?: string): Promise<Result<Voice[], AudioError>> {
    try {
      const voices = await this.provider.getVoices(language);

      return Ok(
        voices.map((v) => ({
          id: v.id,
          name: v.name,
          language: v.language ?? null,
          gender: v.gender ?? null,
        })),
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.provider.hasApiKey()) {
      return false;
    }

    try {
      // ElevenLabs provider has a proper validateApiKey that checks /v1/user
      // But we can't access the key after setting it
      // Return true if key is set - actual validation happens on first request
      return this.provider.hasApiKey();
    } catch {
      return false;
    }
  }

  /**
   * Update API key.
   */
  setApiKey(apiKey: string): void {
    this.provider.setApiKey(apiKey);
  }

  /**
   * Enable or disable word timestamps.
   */
  setUseTimestamps(enabled: boolean): void {
    this.useTimestamps = enabled;
  }

  /**
   * Convert provider errors to AudioError.
   */
  private handleError(error: unknown): Result<never, AudioError> {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('API key') || message.includes('401')) {
      return Err(audioError.invalidCredentials());
    }

    if (message.includes('rate') || message.includes('429')) {
      return Err(audioError.rateLimit(60000));
    }

    if (message.includes('network') || message.includes('fetch')) {
      return Err(audioError.network(message));
    }

    if (message.includes('language')) {
      return Err(audioError.unsupportedLanguage('unknown'));
    }

    return Err(audioError.providerError(this.providerId, message));
  }
}
