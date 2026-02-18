/**
 * OpenAI Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using OpenAI TTS API.
 * Uses the gpt-4o-mini-tts model by default.
 *
 * @module adapters/audio/openai-audio
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

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_MODEL = 'gpt-4o-mini-tts';

const OPENAI_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy', language: null, gender: 'neutral' },
  { id: 'ash', name: 'Ash', language: null, gender: 'male' },
  { id: 'coral', name: 'Coral', language: null, gender: 'female' },
  { id: 'echo', name: 'Echo', language: null, gender: 'male' },
  { id: 'fable', name: 'Fable', language: null, gender: 'neutral' },
  { id: 'onyx', name: 'Onyx', language: null, gender: 'male' },
  { id: 'nova', name: 'Nova', language: null, gender: 'female' },
  { id: 'sage', name: 'Sage', language: null, gender: 'neutral' },
  { id: 'shimmer', name: 'Shimmer', language: null, gender: 'female' },
];

/**
 * OpenAI TTS adapter implementing the IAudioGenerator port.
 *
 * Features:
 * - All languages supported (auto-detect from text)
 * - 9 voices available
 * - No word-level timing
 * - Blob-based playback
 */
export class OpenAiAudioAdapter implements IAudioGenerator {
  readonly providerId = 'openai' as const;
  readonly playbackMode = 'blob' as const;
  readonly supportsWordTiming = false;
  readonly supportedLanguages: readonly string[] = []; // All languages

  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    try {
      if (!this.apiKey) {
        return Err(audioError.invalidCredentials());
      }

      const voice = request.voice || 'alloy';

      const response = await fetch(OPENAI_TTS_URL, {
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
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        return this.handleHttpError(response.status);
      }

      const audioBlob = await response.blob();

      // Estimate duration: ~150 words/min, ~5 chars/word
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

  async getVoices(_language?: string): Promise<Result<Voice[], AudioError>> {
    return Ok([...OPENAI_VOICES]);
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
