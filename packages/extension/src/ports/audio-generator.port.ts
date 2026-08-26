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
 * Extra context for a chunked synthesis run (PROSO-209).
 */
export interface ChunkedSynthesisOptions {
  /**
   * The `request.text` the caller will pass for the paragraph AFTER this one,
   * or null when there is none. It must be byte-identical to that future
   * request's text: a generator primes on this string and adopts the primed
   * work by comparing it, so a paraphrase silently degrades to a cold start.
   *
   * Why it exists: a chunked generator keeps one synthesis in flight plus one
   * prefetch, and that pipeline is per paragraph. On the last sentence the
   * prefetch slot goes idle, and the next paragraph then starts from nothing —
   * a full synthesis round trip of silence at every paragraph boundary. This
   * lets the generator spend the idle slot on the next paragraph's first
   * sentence instead.
   */
  readonly nextText?: string | null;
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
 * Implementations:
 * - ServerTtsAudioAdapter - Server-proxied TTS (all providers)
 */
export interface IAudioGenerator {
  /**
   * Generate audio from text.
   * @param request - Audio generation request
   * @param signal - Optional AbortSignal for real cancellation of a superseded
   *   or stopped request (T015), instead of letting it complete and discarding
   *   the result via the generation counter.
   * @returns Result with audio response or error
   */
  generateAudio(
    request: AudioRequest,
    signal?: AbortSignal,
  ): Promise<Result<AudioResponse, AudioError>>;

  /**
   * Whether this provider supports sentence-granular chunked synthesis
   * (PROSO-110 / spec 100 FR-7). A generator that advertises this MUST
   * implement `generateAudioChunks`.
   *
   * Chunked synthesis exists because the local host cannot stream: a
   * paragraph-sized request means ~8s of silence before playback starts, so
   * playback consumes sentence chunks as they complete. Absent/undefined =
   * paragraph-granular synthesis only.
   */
  readonly supportsChunkedSynthesis?: boolean;

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
   * Whether this provider supports word-level timing.
   */
  readonly supportsWordTiming: boolean;

  /**
   * Synthesize a request at sentence granularity, yielding each chunk as it
   * completes. The first yielded result is the first sentence's audio; the
   * consumer plays it while the generator prefetches the rest (at most one
   * in flight plus at most one prefetched). Only required when
   * `supportsChunkedSynthesis` is true.
   *
   * `options.nextText` lets the generator carry its prefetch across the
   * paragraph boundary; a caller that omits it still gets correct audio, just
   * a cold start per paragraph.
   */
  generateAudioChunks?(
    request: AudioRequest,
    signal?: AbortSignal,
    options?: ChunkedSynthesisOptions,
  ): AsyncGenerator<Result<AudioResponse, AudioError>, void, void>;

  /**
   * Supported languages (BCP-47 codes).
   * Empty array means all languages supported.
   */
  readonly supportedLanguages: readonly string[];
}
