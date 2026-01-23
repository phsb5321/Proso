/**
 * Groq Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using Groq TTS API.
 * Wraps the GroqProvider class with proper error handling.
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
import type { GroqModel } from '../../utils/config/schema';
import { GroqProvider, GROQ_MODELS } from '../../utils/providers/groq';

/**
 * Groq TTS adapter implementing the IAudioGenerator port.
 *
 * Features:
 * - PlayAI Dialog model (10K char limit)
 * - Distil Whisper model (10K char limit)
 * - Automatic text chunking for long content
 * - English language support
 */
export class GroqAudioAdapter implements IAudioGenerator {
  readonly providerId = 'groq' as const;
  readonly supportsWordTiming = false; // Groq doesn't provide word-level timing
  readonly supportedLanguages: readonly string[] = ['en']; // English only for now

  private readonly provider: GroqProvider;
  private model: GroqModel;

  constructor(apiKey: string, model: GroqModel = 'playai-tts') {
    this.provider = new GroqProvider();
    this.provider.setApiKey(apiKey);
    this.model = model;
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

      const modelConfig = GROQ_MODELS[this.model];

      // Get format based on model support
      const format =
        modelConfig.supportedFormats.includes('mp3') && modelConfig.supportedFormats.length > 1
          ? 'mp3'
          : 'wav';

      const audioBlob = await this.provider.generateAudio(request.text, {
        model: this.model,
        voice: request.voice ?? modelConfig.defaultVoice,
        speed: modelConfig.supportsSpeed ? request.speed : undefined,
        responseFormat: format,
      });

      return Ok({
        audioBlob,
        durationMs: 0, // Groq doesn't return duration, will be calculated from audio
        wordTimings: null, // Groq doesn't support word-level timing
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVoices(_language?: string): Promise<Result<Voice[], AudioError>> {
    try {
      const voices = this.provider.getVoices(this.model);

      return Ok(
        voices.map((v) => ({
          id: v.id,
          name: v.name,
          language: 'en', // Groq only supports English for now
          gender: v.gender,
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
      return await this.provider.validateApiKey();
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
   * Update the model to use.
   */
  setModel(model: GroqModel): void {
    this.model = model;
  }

  /**
   * Get the current model.
   */
  getModel(): GroqModel {
    return this.model;
  }

  /**
   * Convert provider errors to AudioError.
   */
  private handleError(error: unknown): Result<never, AudioError> {
    const message = error instanceof Error ? error.message : String(error);
    const messageLower = message.toLowerCase();

    if (messageLower.includes('api key') || message.includes('401')) {
      return Err(audioError.invalidCredentials());
    }

    if (messageLower.includes('rate') || message.includes('429')) {
      return Err(audioError.rateLimit(60000));
    }

    if (messageLower.includes('network') || messageLower.includes('fetch')) {
      return Err(audioError.network(message));
    }

    if (messageLower.includes('language')) {
      return Err(audioError.unsupportedLanguage('unknown'));
    }

    if (messageLower.includes('characters') || messageLower.includes('too long')) {
      const modelConfig = GROQ_MODELS[this.model];
      return Err(audioError.textTooLong(modelConfig.maxCharacters));
    }

    return Err(audioError.providerError(this.providerId, message));
  }
}
