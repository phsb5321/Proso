/**
 * Cartesia Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using Cartesia TTS API.
 * English-only — returns unsupported_language error for non-English.
 *
 * @module adapters/audio/cartesia-audio
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

const CARTESIA_TTS_URL = 'https://api.cartesia.ai/tts/bytes';

const CARTESIA_VOICES: Voice[] = [
  { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Barbershop Man', language: 'en', gender: 'male' },
  { id: '156fb8d2-335b-4950-9cb3-a2d33f8c717e', name: 'British Lady', language: 'en', gender: 'female' },
  { id: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', name: 'Confident British Man', language: 'en', gender: 'male' },
  { id: 'e00d0480-4cb5-4c47-99df-d85b3b0465c1', name: 'Female Narrator', language: 'en', gender: 'female' },
  { id: '41534e16-2966-4c6b-9670-111411def906', name: 'Newsman', language: 'en', gender: 'male' },
  { id: 'bf991597-6c13-47e4-8411-91ec2de5c466', name: 'Nonfiction Man', language: 'en', gender: 'male' },
  { id: 'b7d50908-b89b-4ec4-b157-2d0df75e1f33', name: 'Reflective Woman', language: 'en', gender: 'female' },
  { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'Reading Man', language: 'en', gender: 'male' },
];

/**
 * Cartesia TTS adapter implementing the IAudioGenerator port.
 *
 * Features:
 * - English only (returns unsupported_language for other languages)
 * - Blob-based playback
 * - No word-level timing
 */
export class CartesiaAudioAdapter implements IAudioGenerator {
  readonly providerId = 'cartesia' as const;
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

      const voice = request.voice || CARTESIA_VOICES[0].id;

      const response = await fetch(CARTESIA_TTS_URL, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey,
          'Cartesia-Version': '2024-06-10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'sonic-2',
          transcript: request.text,
          voice: {
            mode: 'id',
            id: voice,
          },
          output_format: {
            container: 'mp3',
            bit_rate: 128000,
            sample_rate: 44100,
          },
          language: 'en',
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
    return Ok([...CARTESIA_VOICES]);
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
