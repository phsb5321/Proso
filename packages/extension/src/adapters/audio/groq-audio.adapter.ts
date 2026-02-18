/**
 * Groq Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using Groq TTS API.
 * English-only — returns unsupported_language error for non-English.
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

const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech';
const DEFAULT_MODEL = 'playai-tts';

const GROQ_VOICES: Voice[] = [
  { id: 'Arista-PlayAI', name: 'Arista', language: 'en', gender: 'female' },
  { id: 'Atlas-PlayAI', name: 'Atlas', language: 'en', gender: 'male' },
  { id: 'Basil-PlayAI', name: 'Basil', language: 'en', gender: 'male' },
  { id: 'Briggs-PlayAI', name: 'Briggs', language: 'en', gender: 'male' },
  { id: 'Calista-PlayAI', name: 'Calista', language: 'en', gender: 'female' },
  { id: 'Celeste-PlayAI', name: 'Celeste', language: 'en', gender: 'female' },
  { id: 'Cheyenne-PlayAI', name: 'Cheyenne', language: 'en', gender: 'female' },
  { id: 'Chip-PlayAI', name: 'Chip', language: 'en', gender: 'male' },
  { id: 'Cillian-PlayAI', name: 'Cillian', language: 'en', gender: 'male' },
  { id: 'Deedee-PlayAI', name: 'Deedee', language: 'en', gender: 'female' },
  { id: 'Fritz-PlayAI', name: 'Fritz', language: 'en', gender: 'male' },
  { id: 'Gail-PlayAI', name: 'Gail', language: 'en', gender: 'female' },
  { id: 'Indigo-PlayAI', name: 'Indigo', language: 'en', gender: 'neutral' },
  { id: 'Mamaw-PlayAI', name: 'Mamaw', language: 'en', gender: 'female' },
  { id: 'Mason-PlayAI', name: 'Mason', language: 'en', gender: 'male' },
  { id: 'Mikail-PlayAI', name: 'Mikail', language: 'en', gender: 'male' },
  { id: 'Mitch-PlayAI', name: 'Mitch', language: 'en', gender: 'male' },
  { id: 'Quinn-PlayAI', name: 'Quinn', language: 'en', gender: 'neutral' },
  { id: 'Thunder-PlayAI', name: 'Thunder', language: 'en', gender: 'male' },
];

/**
 * Groq TTS adapter implementing the IAudioGenerator port.
 *
 * Features:
 * - English only (returns unsupported_language for other languages)
 * - Free pricing tier
 * - No word-level timing
 * - Blob-based playback
 */
export class GroqAudioAdapter implements IAudioGenerator {
  readonly providerId = 'groq' as const;
  readonly playbackMode = 'blob' as const;
  readonly supportsWordTiming = false;
  readonly supportedLanguages: readonly string[] = ['en'];

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    try {
      if (!this.apiKey) {
        return Err(audioError.invalidCredentials());
      }

      // Language guard: English only
      if (request.language) {
        const langCode = request.language.split('-')[0].toLowerCase();
        if (langCode !== 'en') {
          return Err(audioError.unsupportedLanguage(request.language));
        }
      }

      const voice = request.voice || 'Fritz-PlayAI';

      const response = await fetch(GROQ_TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          input: request.text,
          voice,
          speed: request.speed,
          response_format: 'wav',
        }),
      });

      if (!response.ok) {
        return this.handleHttpError(response.status);
      }

      const audioBlob = await response.blob();

      // Estimate duration
      const wordCount = request.text.split(/\s+/).filter(Boolean).length;
      const estimatedDurationMs = Math.max(100, (wordCount * 60000) / (150 * request.speed));

      return Ok({
        audioBlob,
        durationMs: estimatedDurationMs,
        wordTimings: null,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVoices(language?: string): Promise<Result<Voice[], AudioError>> {
    if (language) {
      const langCode = language.split('-')[0].toLowerCase();
      if (langCode !== 'en') {
        return Ok([]);
      }
    }
    return Ok([...GROQ_VOICES]);
  }

  async validateCredentials(): Promise<boolean> {
    return !!this.apiKey;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  private handleHttpError(status: number): Result<never, AudioError> {
    if (status === 401) {
      return Err(audioError.invalidCredentials());
    }
    if (status === 429) {
      return Err(audioError.rateLimit(60000));
    }
    return Err(audioError.providerError(this.providerId, `HTTP ${status}`));
  }

  private handleError(error: unknown): Result<never, AudioError> {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('network') || message.includes('fetch') || message.includes('Failed to fetch')) {
      return Err(audioError.network(message));
    }

    return Err(audioError.providerError(this.providerId, message));
  }
}
