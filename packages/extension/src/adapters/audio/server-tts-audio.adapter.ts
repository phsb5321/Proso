/**
 * Server TTS Audio Adapter
 *
 * Routes audio generation through the Proso server proxy.
 * Used for managed-credit users (INV-002: BYOK users use direct providers).
 *
 * @module adapters/audio/server-tts-audio
 */

import type { AudioError } from '../../core/shared/errors';
import { audioError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Ok, Err } from '../../core/shared/result';
import type {
  IAudioGenerator,
  AudioRequest,
  AudioResponse,
  Voice,
} from '../../ports/audio-generator.port';
import type { IApiClient } from '../../ports/api-client.port';
import type { TTSProvider } from '@proso/shared';

/**
 * Audio adapter that proxies TTS requests through the Proso server.
 *
 * The server handles provider routing, credit deduction, and caching (INV-006).
 * This adapter maps between the extension's IAudioGenerator interface and
 * the server's synthesize API.
 */
export class ServerTtsAudioAdapter implements IAudioGenerator {
  readonly providerId = 'openai' as const; // Default; server chooses actual provider
  readonly supportsWordTiming = false; // Server proxy doesn't return word timings yet
  readonly supportedLanguages: readonly string[] = []; // All languages (server handles routing)

  constructor(
    private readonly apiClient: IApiClient,
    private readonly preferredProvider?: TTSProvider,
    private readonly byokApiKey?: string,
  ) {}

  async generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    const result = await this.apiClient.synthesize({
      text: request.text,
      provider: this.preferredProvider,
      voice: request.voice ?? undefined,
      language: request.language ?? undefined,
      byokApiKey: this.byokApiKey,
    });

    if (!result.ok) {
      const error = result.error;
      switch (error.type) {
        case 'unauthorized':
          return Err(audioError.invalidCredentials());
        case 'timeout':
          return Err(audioError.network(`Server request timed out (${error.timeoutMs}ms)`));
        case 'not_configured':
          return Err(audioError.network('Server not configured'));
        default:
          return Err(
            audioError.network('message' in error ? error.message : 'Server request failed'),
          );
      }
    }

    const { audioBlob, contentType } = result.value;

    // Estimate duration from blob size (rough: ~16kB/s for MP3 at 128kbps)
    const estimatedDurationMs =
      contentType.includes('mpeg') || contentType.includes('mp3')
        ? Math.round((audioBlob.size / 16000) * 1000)
        : 0;

    return Ok({
      audioBlob,
      durationMs: estimatedDurationMs,
      wordTimings: null,
    });
  }

  async getVoices(_language?: string): Promise<Result<Voice[], AudioError>> {
    // Server voices would require a separate API call; return empty for now
    return Ok([]);
  }

  async validateCredentials(): Promise<boolean> {
    return this.apiClient.isConfigured;
  }
}
