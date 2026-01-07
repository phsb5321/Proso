/**
 * Groq Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using Groq TTS API.
 * Wraps the existing GroqProvider class.
 *
 * @module adapters/audio/groq-audio
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
import { GroqProvider } from '../../utils/providers/groq';

/**
 * Groq TTS adapter implementing the IAudioGenerator port.
 *
 * Features:
 * - English only
 * - No word-level timing
 * - Free tier available
 * - Speed range: 0.25 - 4.0
 */
export class GroqAudioAdapter implements IAudioGenerator {
  readonly providerId = 'groq' as const;
  readonly supportsWordTiming = false;
  readonly supportedLanguages: readonly string[] = ['en'];

  private readonly provider: GroqProvider;

  constructor(apiKey: string) {
    this.provider = new GroqProvider();
    this.provider.setApiKey(apiKey);
  }

  async generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    try {
      if (!this.provider.hasApiKey()) {
        return Err(audioError.invalidCredentials(this.providerId));
      }

      // Check language support - Groq is English only
      if (request.language) {
        const langCode = request.language.split('-')[0].toLowerCase();
        if (langCode !== 'en') {
          return Err(audioError.unsupportedLanguage(request.language));
        }
      }

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
      // If language is specified and not English, return empty list
      if (language) {
        const langCode = language.split('-')[0].toLowerCase();
        if (langCode !== 'en') {
          return Ok([]);
        }
      }

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

    if (message.includes('only supports English') || message.includes('language')) {
      // Extract language from message if possible
      const match = message.match(/for (\w+)/);
      const lang = match ? match[1] : 'unknown';
      return Err(audioError.unsupportedLanguage(lang));
    }

    return Err(audioError.providerError(this.providerId, message));
  }
}
