// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Fallback audio generator decorator (spec 100 FR-4).
 *
 * Wraps the local-host adapter as primary and the existing server route as
 * secondary. The decorator — not the adapter — owns the fallback decision, so
 * the adapter stays a faithful mapping of one HTTP contract and the fallback
 * policy is testable on its own.
 *
 * Order: local (if enabled, configured, permitted, ready, and language-
 * capable) → existing server route → the caller's own no-op fallback (today's
 * behaviour when nothing is configured).
 *
 * The gate runs before every attempt: a revoked host permission disables the
 * local route (spec FR-6) rather than producing a stream of failures. The
 * last fallback reason is retained and exposed for the settings UI and the
 * playback error path, so failure is never silent (FR-4).
 *
 * @module adapters/audio/fallback-audio
 */

import type { AudioError, ProviderId } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import type { AudioRequest, AudioResponse, IAudioGenerator, Voice } from '../../ports/audio-generator.port';

/**
 * Result of the pre-flight gate: may the local route be attempted?
 */
export interface FallbackGateResult {
  readonly ok: boolean;
  /** Human-readable reason for a failed gate (also surfaced in the UI). */
  readonly reason?: string;
}

export interface FallbackAudioAdapterOptions {
  /** Primary adapter (e.g. the local host). Either this or primaryFactory. */
  readonly primary?: IAudioGenerator;
  /**
   * Lazy primary constructor (PROSO-110): the primary is only ever built when
   * the gate passes, so an unconfigured or unpermitted local host never
   * constructs its adapter — and therefore issues no request (FR-2).
   */
  readonly primaryFactory?: () => Promise<IAudioGenerator>;
  readonly secondary: IAudioGenerator;
  /**
   * Pre-flight gate: e.g. host configured + runtime host permission granted.
   * A failed gate routes straight to the secondary with the reason retained.
   */
  readonly gate?: () => Promise<FallbackGateResult>;
}

/**
 * Primary-first audio generator with an honest fallback.
 */
export class FallbackAudioAdapter implements IAudioGenerator {
  readonly providerId: ProviderId = 'local';
  readonly supportsWordTiming = false;
  readonly supportsChunkedSynthesis = true;

  private readonly primaryFactory: (() => Promise<IAudioGenerator>) | null;
  private readonly secondary: IAudioGenerator;
  private readonly gate: () => Promise<FallbackGateResult>;
  private lastReason: string | null = null;
  private primary: IAudioGenerator | null = null;

  constructor(options: FallbackAudioAdapterOptions) {
    this.primaryFactory = options.primaryFactory ?? (options.primary ? async () => options.primary! : null);
    const factory = this.primaryFactory;
    if (!factory) {
      throw new Error('FallbackAudioAdapter requires primary or primaryFactory');
    }
    this.primaryFactory = factory;
    this.secondary = options.secondary;
    this.gate = options.gate ?? (async () => ({ ok: true }));
  }

  /** Build (once) and cache the primary adapter. */
  private async getPrimary(): Promise<IAudioGenerator> {
    const factory = this.primaryFactory;
    if (!factory) throw new Error('FallbackAudioAdapter requires primary or primaryFactory');
    if (!this.primary) {
      this.primary = await factory();
    }
    return this.primary;
  }

  /** Last fallback reason (null when the local route served the request). */
  get lastFallbackReason(): string | null {
    return this.lastReason;
  }

  get supportedLanguages(): readonly string[] {
    // The primary is built lazily (FR-2); before that, nothing is known.
    return this.primary?.supportedLanguages ?? [];
  }

  async generateAudio(
    request: AudioRequest,
    signal?: AbortSignal,
  ): Promise<Result<AudioResponse, AudioError>> {
    const gate = await this.gate();
    if (!gate.ok) {
      this.lastReason = gate.reason ?? 'local route not permitted';
      return this.secondary.generateAudio(request, signal);
    }

    let local;
    try {
      local = await (await this.getPrimary()).generateAudio(request, signal);
    } catch (error) {
      this.lastReason = error instanceof Error ? error.message : String(error);
      return this.secondary.generateAudio(request, signal);
    }
    if (local.ok) {
      this.lastReason = null;
      return local;
    }

    // Abort is never a fallback trigger: the reader stopped or moved on.
    if (isAbortError(local.error)) return local;

    this.lastReason = errorMessage(local.error);
    return this.secondary.generateAudio(request, signal);
  }

  async *generateAudioChunks(
    request: AudioRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<Result<AudioResponse, AudioError>, void, void> {
    const gate = await this.gate();
    if (!gate.ok) {
      this.lastReason = gate.reason ?? 'local route not permitted';
      // The secondary (server route) is paragraph-granular: fall back to its
      // single-shot result as one chunk.
      yield await this.secondary.generateAudio(request, signal);
      return;
    }

    let primary;
    try {
      primary = await this.getPrimary();
    } catch (error) {
      this.lastReason = error instanceof Error ? error.message : String(error);
      yield await this.secondary.generateAudio(request, signal);
      return;
    }
    const local = primary.generateAudioChunks;
    if (!local) {
      yield await this.secondary.generateAudio(request, signal);
      return;
    }

    const iterator = local(request, signal);
    const first = await iterator.next();
    if (first.done) {
      this.lastReason = 'local route produced no audio';
      yield await this.secondary.generateAudio(request, signal);
      return;
    }
    if (!first.value.ok) {
      if (isAbortError(first.value.error)) {
        yield first.value;
        return;
      }
      this.lastReason = errorMessage(first.value.error);
      yield await this.secondary.generateAudio(request, signal);
      return;
    }

    this.lastReason = null;
    yield first.value;
    // Keep draining the SAME iterator; a mid-paragraph failure surfaces as an
    // error chunk and the consumer shows it (never a silent stall, FR-4).
    for await (const chunk of iterator) {
      yield chunk;
    }
  }

  async getVoices(language?: string): Promise<Result<Voice[], AudioError>> {
    const gate = await this.gate();
    if (!gate.ok) return this.secondary.getVoices(language);
    const voices = await (await this.getPrimary()).getVoices(language);
    return voices.ok || voices.error.type === 'unsupported_language'
      ? voices
      : this.secondary.getVoices(language);
  }

  async validateCredentials(): Promise<boolean> {
    const gate = await this.gate();
    if (!gate.ok) return false;
    return (await this.getPrimary()).validateCredentials();
  }
}

/** Abort errors never trigger fallback (spec FR-4). */
function isAbortError(error: AudioError): boolean {
  return (
    error.type === 'provider_error' &&
    (error.code === 'appliance_aborted' ||
      error.code === 'aborted' ||
      error.code === 'request_aborted')
  );
}

/** Human-readable message for any AudioError variant. */
function errorMessage(error: AudioError): string {
  switch (error.type) {
    case 'network':
    case 'provider_error':
      return error.message;
    case 'rate_limit':
      return `Rate limited; retry in ${error.retryAfterMs}ms`;
    case 'unsupported_language':
      return `Language not supported: ${error.language}`;
    case 'text_too_long':
      return `Text exceeds ${error.maxLength} bytes`;
    case 'invalid_credentials':
      return 'Invalid credentials';
    case 'payment_required':
      return error.message;
    default:
      return String(error);
  }
}

