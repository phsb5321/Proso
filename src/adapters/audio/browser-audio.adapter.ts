// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Browser Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using Web Speech API.
 * 048-multilingual-tts-pillar: Free offline TTS fallback
 *
 * @module adapters/audio/browser-audio
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
import { BrowserTTSProvider } from '../../utils/providers/browser';

/**
 * Browser TTS adapter implementing the IAudioGenerator port.
 *
 * Features:
 * - System-dependent language support (varies by OS/browser)
 * - No word-level timing
 * - No API key required (free)
 * - Works offline
 */
export class BrowserAudioAdapter implements IAudioGenerator {
  readonly providerId = 'browser' as const;
  readonly supportsWordTiming = false;
  readonly supportedLanguages: readonly string[] = []; // Dynamic - depends on system

  private readonly provider: BrowserTTSProvider;

  constructor() {
    this.provider = new BrowserTTSProvider();
  }

  async generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    try {
      if (!this.provider.isAvailable()) {
        return Err(audioError.providerError(this.providerId, 'Browser TTS not available'));
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
        wordTimings: null, // Browser TTS does not support word timing
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
    // Browser TTS doesn't require credentials
    // Just check if the API is available
    return this.provider.isAvailable();
  }

  /**
   * Stop current speech
   */
  stop(): void {
    this.provider.stop();
  }

  /**
   * Pause speech
   */
  pause(): void {
    this.provider.pause();
  }

  /**
   * Resume speech
   */
  resume(): void {
    this.provider.resume();
  }

  /**
   * Convert provider errors to AudioError.
   */
  private handleError(error: unknown): Result<never, AudioError> {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('not available') || message.includes('not supported')) {
      return Err(audioError.providerError(this.providerId, 'Browser TTS not supported'));
    }

    if (message.includes('network')) {
      return Err(audioError.network(message));
    }

    if (message.includes('canceled') || message.includes('interrupted')) {
      return Err(audioError.providerError(this.providerId, 'Speech was interrupted'));
    }

    return Err(audioError.providerError(this.providerId, message));
  }
}
