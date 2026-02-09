/**
 * Audio Generator Port Interface
 *
 * Defines the contract for TTS audio generation.
 * Adapter: ElevenLabs
 *
 * @module ports/audio-generator
 */

import type { AudioError, ProviderId } from '../core/shared/errors';
import type { Result } from '../core/shared/result';

/**
 * Audio generation request parameters.
 */
export interface AudioRequest {
  readonly text: string;
  readonly voice: string | null;
  readonly speed: number;
  readonly language: string | null;
}

/**
 * Audio generation response with optional word timing.
 */
export interface AudioResponse {
  readonly audioBlob: Blob;
  readonly durationMs: number;
  readonly wordTimings: readonly WordTiming[] | null;
  /** True if audio was already played by the adapter (e.g., Browser TTS via speechSynthesis) */
  readonly playedDirectly?: boolean;
  /** Promise that resolves when direct playback completes (Browser TTS). Used for paragraph advancement. */
  readonly onEndPromise?: Promise<void>;
}

/**
 * Word-level timing for synchronized highlighting.
 */
export interface WordTiming {
  readonly word: string;
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * Voice information for provider.
 */
export interface Voice {
  readonly id: string;
  readonly name: string;
  readonly language: string | null;
  readonly gender: 'male' | 'female' | 'neutral' | null;
}

/**
 * Port interface for TTS audio generation.
 *
 * Implementation:
 * - ElevenLabsAudioAdapter - ElevenLabs API
 */
export interface IAudioGenerator {
  /**
   * Generate audio from text.
   * @param request - Audio generation request
   * @returns Result with audio response or error
   */
  generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>>;

  /**
   * Get available voices for a language.
   * @param language - Optional BCP-47 language code
   * @returns Result with voice list or error
   */
  getVoices(language?: string): Promise<Result<Voice[], AudioError>>;

  /**
   * Check if provider credentials are valid.
   * @returns True if credentials are valid
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Provider identifier.
   */
  readonly providerId: ProviderId;

  /**
   * Playback strategy: 'blob' returns audio data for HTMLAudioElement,
   * 'direct' plays audio via system APIs (e.g., speechSynthesis) and returns a sentinel blob.
   */
  readonly playbackMode: 'blob' | 'direct';

  /**
   * Whether this provider supports word-level timing.
   */
  readonly supportsWordTiming: boolean;

  /**
   * Supported languages (BCP-47 codes).
   * Empty array means all languages supported.
   */
  readonly supportedLanguages: readonly string[];
}
