/**
 * No-Op Audio Generator Adapter
 *
 * A fallback adapter that implements IAudioGenerator but always returns errors.
 * Used when the server is not configured and no audio generation is possible.
 *
 * This ensures the container always initializes successfully, even without
 * a configured server, preventing cascade failures across all handlers.
 *
 * @module adapters/audio/noop-audio-generator
 */

import type { AudioError, ProviderId } from '../../core/shared/errors';
import { audioError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Err } from '../../core/shared/result';
import type {
  AudioRequest,
  AudioResponse,
  IAudioGenerator,
  Voice,
} from '../../ports/audio-generator.port';

/**
 * No-op audio generator that returns errors for all operations.
 *
 * Use this adapter as a fallback when the server is not configured
 * and audio generation cannot be performed.
 */
export class NoOpAudioGeneratorAdapter implements IAudioGenerator {
  readonly providerId: ProviderId = 'elevenlabs';
  readonly supportsWordTiming = false;
  readonly supportedLanguages: readonly string[] = [];

  private readonly reason: string;

  constructor(reason = 'Server not configured') {
    this.reason = reason;
  }

  async generateAudio(_request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    return Err(audioError.providerError('not_configured', this.reason));
  }

  async getVoices(_language?: string): Promise<Result<Voice[], AudioError>> {
    return Err(audioError.providerError('not_configured', this.reason));
  }

  async validateCredentials(): Promise<boolean> {
    return false;
  }
}
