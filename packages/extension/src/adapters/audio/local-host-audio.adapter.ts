/**
 * Local Host Audio Adapter (PROSO-110)
 *
 * Talks to a reader-operated synthesis host — a machine on the reader's own
 * network that publishes `GET /v1/capabilities` and `POST /v1/tts` and
 * answers with raw WAV (the capability, of which the Orange Pi appliance is
 * the first instance). Named for the capability, not the device.
 *
 * The base URL is injected (constitution: the address comes from the user,
 * never from a shipped constant or a discovery probe). The host publishes
 * `markKinds: []` for every voice, so this provider never returns word
 * timings (FR-5) — `PlaybackService` falls back to its existing estimation
 * path.
 *
 * The host cannot stream, so time-to-first-audio equals full synthesis time
 * for whatever is requested. This adapter therefore also exposes
 * `generateAudioChunks` (spec 100 FR-7): sentence-granular synthesis with one
 * request in flight plus at most one prefetched, yielding each chunk as it
 * completes so playback starts after the first sentence (~1-2s warm) instead
 * of after a paragraph (~8s).
 *
 * @module adapters/audio/local-host-audio
 */

import { deriveIdempotencyKey } from '../../core/audio/idempotency-key';
import {
  CHUNK_MAX_TEXT_UTF8_BYTES,
  splitSentences,
  utf8ByteLength,
} from '../../core/audio/sentence-chunker';
import { hasSpeakableWords } from '../../core/playback/word-timing-estimator';
import type { AudioError } from '../../core/shared/errors';
import { audioError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type {
  AudioRequest,
  AudioResponse,
  ChunkedSynthesisOptions,
  IAudioGenerator,
  Voice,
} from '../../ports/audio-generator.port';

/**
 * Appliance input bound (`limits.maxTextUtf8Bytes`), enforced client-side
 * before a request is issued (FR-7). Counted in UTF-8 bytes, not characters —
 * Portuguese text is multi-byte.
 */
export const APPLIANCE_MAX_TEXT_UTF8_BYTES = CHUNK_MAX_TEXT_UTF8_BYTES;

/** Keep non-spoken page layout glyphs out of strict local TTS tokenizers. */
export function normalizeLocalHostSynthesisText(text: string): string {
  return text.replace(/[\u2500-\u259f]/gu, ' ');
}

/**
 * Concurrent synthesis requests the appliance actually admits.
 *
 * `/v1/capabilities` publishes `queueCapacity: 8`, which is the TTS budget plus
 * the STT budget; the split is not exposed. A measured 12-way burst admitted 4
 * and refused 8 with `queue_full`. Using the published 8 would over-admit by 2x.
 */
export const APPLIANCE_TTS_ADMISSION_LIMIT = 4;

/**
 * In-flight synthesis requests a client should actually issue.
 *
 * The host runs a single inference worker with no preemption, so concurrency
 * above one buys no throughput — it only converts queueing into 429s. The
 * chunk pipeline keeps one synthesis in flight plus at most one prefetch.
 */
export const APPLIANCE_RECOMMENDED_CONCURRENCY = 1;

/**
 * Synthesis requests this adapter will ever have in flight at once.
 *
 * The chunk pipeline holds one in flight plus one prefetch, and the
 * cross-paragraph prime (PROSO-209) reuses the prefetch slot rather than
 * adding a third: it starts only on the last sentence, when the prefetch would
 * otherwise be idle. The measured host answers a third concurrent request with
 * 429 `queue_full` (`queueCapacity: 2`), so this is a ceiling, not a target.
 */
export const APPLIANCE_MAX_IN_FLIGHT = 2;

/**
 * Error codes this adapter reports through `provider_error`.
 *
 * `AudioError` has a single `network` member, so the three transport outcomes
 * the appliance can produce are distinguished by code rather than by widening
 * the shared union (which is switched on in `playback-service` and
 * `audio.handlers`).
 */
export const LOCAL_HOST_ERROR_CODES = {
  aborted: 'appliance_aborted',
  dnsFailure: 'appliance_dns_failure',
  cryptoUnavailable: 'appliance_crypto_unavailable',
  invalidInput: 'appliance_invalid_input',
  invalidResponse: 'appliance_invalid_response',
  noVoice: 'appliance_no_voice',
} as const;

/** Minimal `fetch` shape this adapter depends on (keeps tests free of DOM types). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A voice as published by `GET /v1/capabilities`. */
interface ApplianceVoice {
  readonly id: string;
  readonly language: string;
  readonly mediaTypes?: readonly string[];
  readonly markKinds?: readonly string[];
}

/** The subset of `GET /v1/capabilities` this adapter reads. */
export interface ApplianceCapabilities {
  readonly ready?: boolean;
  readonly limits?: { readonly maxTextUtf8Bytes?: number };
  readonly tts?: { readonly voices?: readonly ApplianceVoice[] };
}

/** RFC-9457 problem document returned by the host on every error. */
interface ApplianceProblem {
  readonly code?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly status?: number;
  readonly retryable?: boolean;
  readonly requestId?: string;
  /** Delay the host states for a retryable refusal (both spellings seen). */
  readonly retryAfterMs?: number;
  readonly retry_after_ms?: number;
}

export interface LocalHostAudioAdapterOptions {
  /** Host base URL, e.g. `https://host.example` (user setting, PROSO-110). */
  readonly baseUrl: string;
  /** Injectable fetch, defaults to the global one. */
  readonly fetchFn?: FetchLike;
  /** Override for the client-side input bound (defaults to the published limit). */
  readonly maxTextUtf8Bytes?: number;
}

/**
 * Parse the duration of a RIFF/WAVE buffer from its header.
 *
 * Duration is read from the `data` chunk size divided by the `fmt ` chunk's
 * byte rate; nothing is estimated from the payload size. Returns `null` when
 * the buffer is not a WAV or the required chunks are missing.
 */
export function parseWavDurationMs(buffer: ArrayBuffer): number | null {
  if (buffer.byteLength < 12) return null;
  const view = new DataView(buffer);
  const tag = (offset: number): string =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let byteRate = 0;
  let dataBytes = 0;
  let offset = 12;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = tag(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (chunkId === 'fmt ' && chunkSize >= 16 && body + 16 <= buffer.byteLength) {
      byteRate = view.getUint32(body + 8, true);
    } else if (chunkId === 'data') {
      // Streamed WAVs may declare size 0; fall back to the remaining bytes.
      if (chunkSize === 0) {
        dataBytes = buffer.byteLength - body;
        break;
      }
      dataBytes = chunkSize;
    }

    // Chunks are word-aligned: an odd size is followed by a pad byte.
    offset = body + chunkSize + (chunkSize % 2);
  }

  if (byteRate <= 0 || dataBytes <= 0) return null;
  return Math.round((dataBytes / byteRate) * 1000);
}

/**
 * Audio adapter for a synthesis host reachable over the user's own network.
 *
 * Every fallible step returns `Result`; `try/catch` lives only at the fetch
 * boundary.
 */
export class LocalHostAudioAdapter implements IAudioGenerator {
  readonly providerId = 'local' as const;
  /** The host publishes `markKinds: []` — it emits no word marks (FR-5). */
  readonly supportsWordTiming = false;
  /** Sentence-granular chunked synthesis (spec 100 FR-7). */
  readonly supportsChunkedSynthesis = true;

  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly maxTextUtf8Bytes: number;
  private capabilities: ApplianceCapabilities | null = null;
  /**
   * The next paragraph's first sentence, started early (PROSO-209). Holds its
   * own controller for replacement, linked to the originating session signal.
   * Completed audio may be reused; pending work must not outlive cancellation.
   */
  private primed: {
    readonly key: string;
    readonly promise: Promise<Result<AudioResponse, AudioError>>;
    readonly controller: AbortController;
  } | null = null;

  constructor(options: LocalHostAudioAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.maxTextUtf8Bytes = options.maxTextUtf8Bytes ?? APPLIANCE_MAX_TEXT_UTF8_BYTES;
  }

  /**
   * Languages published by the host's capabilities.
   *
   * Derived, never a literal. Empty until capabilities have been read, which
   * the port documents as "all languages" — the host's own voice list is the
   * only authority once it is known.
   */
  get supportedLanguages(): readonly string[] {
    const voices = this.capabilities?.tts?.voices ?? [];
    return [...new Set(voices.map((voice) => voice.language))];
  }

  async generateAudio(
    request: AudioRequest,
    signal?: AbortSignal,
  ): Promise<Result<AudioResponse, AudioError>> {
    return this.synthesize(request, signal);
  }

  /**
   * Sentence-granular chunked synthesis (spec 100 FR-7/FR-11).
   *
   * Splits the paragraph at sentence boundaries, synthesizes sentence 0 and
   * yields it as soon as it is ready (~1-2s warm). Each subsequent pull admits
   * one request; the consumer owns pause and bounded buffering.
   *
   * A paragraph that is a single sentence yields one chunk — the whole
   * paragraph — which is also the honest upper bound on first audio.
   *
   * The pipeline spans paragraphs (PROSO-209): the pull after the last
   * sentence primes `options.nextText`'s first sentence, and the next run
   * adopts completed work instead of re-issuing it.
   * Without this the reader heard a full synthesis round trip (~3s measured)
   * of silence at every paragraph boundary, because each run started cold.
   */
  async *generateAudioChunks(
    request: AudioRequest,
    signal?: AbortSignal,
    options?: ChunkedSynthesisOptions,
  ): AsyncGenerator<Result<AudioResponse, AudioError>, void, void> {
    const split = splitSentences(request.text);
    if (!split.ok) {
      yield Err(split.error);
      return;
    }

    const sentences = split.value.filter((sentence) =>
      hasSpeakableWords(normalizeLocalHostSynthesisText(sentence)),
    );
    if (sentences.length === 0) return;
    // Pull-driven: each next() admits one sentence. Playback owns the bounded
    // lookahead; eager work here would bypass its pause and capacity checks.
    for (const [index, sentence] of sentences.entries()) {
      if (signal?.aborted) return;
      const result = await (index === 0
        ? (this.adoptPrimed(request, sentence) ??
          this.synthesize({ ...request, text: sentence }, signal))
        : this.synthesize({ ...request, text: sentence }, signal));
      yield result;
      if (!result.ok) return;
    }
    // Reaching here requires another admitted pull after the last sentence.
    // That leaves time to prime while its buffered audio is still playing.
    this.prime(request, options?.nextText ?? null, signal);
  }

  /**
   * Take over a previously primed first sentence when it is exactly the work
   * this run is about to issue. A mismatch — the reader changed voice, speed
   * or jumped elsewhere — aborts the primed request rather than leaving it to
   * hold a slot against the host's concurrency limit.
   */
  private adoptPrimed(
    request: AudioRequest,
    sentence: string,
  ): Promise<Result<AudioResponse, AudioError>> | null {
    const primed = this.primed;
    if (!primed) return null;
    this.primed = null;
    if (primed.key === primedKey(request, sentence)) return primed.promise;
    primed.controller.abort();
    return null;
  }

  /** Start the next paragraph's first sentence, replacing any stale prime. */
  private prime(request: AudioRequest, nextText: string | null, signal?: AbortSignal): void {
    this.primed?.controller.abort();
    this.primed = null;
    if (!nextText || signal?.aborted) return;

    const split = splitSentences(nextText);
    if (!split.ok) return;
    const sentence = split.value.find((candidate) =>
      hasSpeakableWords(normalizeLocalHostSynthesisText(candidate)),
    );
    if (!sentence) return;

    const controller = new AbortController();
    const abort = () => {
      controller.abort();
      if (this.primed?.controller === controller) this.primed = null;
    };
    signal?.addEventListener('abort', abort, { once: true });
    this.primed = {
      key: primedKey(request, sentence),
      promise: this.synthesize({ ...request, text: sentence }, controller.signal).finally(() => {
        signal?.removeEventListener('abort', abort);
      }),
      controller,
    };
  }

  async getVoices(language?: string): Promise<Result<Voice[], AudioError>> {
    const capabilities = await this.loadCapabilities();
    if (!capabilities.ok) return capabilities;

    const voices = capabilities.value.tts?.voices ?? [];
    const matching = language
      ? voices.filter((v) => matchesLanguage(v.language, language))
      : voices;

    return Ok(
      matching.map((voice) => ({
        id: voice.id,
        name: voice.id,
        language: voice.language ?? null,
        gender: null,
      })),
    );
  }

  /**
   * The host is credential-free; readiness is the only gate.
   * True only when `status === "ok"` and `ready === true`.
   */
  async validateCredentials(): Promise<boolean> {
    const response = await this.request(`${this.baseUrl}/health`, { method: 'GET' });
    if (!response.ok || !response.value.ok) return false;

    const body = await this.readJson(response.value);
    if (!body.ok) return false;

    const health = body.value as { status?: unknown; ready?: unknown };
    return health.status === 'ok' && health.ready === true;
  }

  /** Read capabilities once and cache them for the adapter's lifetime. */
  private async loadCapabilities(
    signal?: AbortSignal,
  ): Promise<Result<ApplianceCapabilities, AudioError>> {
    if (this.capabilities) return Ok(this.capabilities);

    const response = await this.request(
      `${this.baseUrl}/v1/capabilities`,
      { method: 'GET', headers: { accept: 'application/json' }, signal },
      signal,
    );
    if (!response.ok) return response;

    if (!response.value.ok) {
      return Err(await mapProblemResponse(response.value));
    }

    const body = await this.readJson(response.value);
    if (!body.ok) return body;

    this.capabilities = body.value as ApplianceCapabilities;
    return Ok(this.capabilities);
  }

  /**
   * Synthesize one request (one sentence in the chunked path).
   */
  private async synthesize(
    request: AudioRequest,
    signal: AbortSignal | undefined,
  ): Promise<Result<AudioResponse, AudioError>> {
    if (signal?.aborted) {
      return Err(audioError.providerError(LOCAL_HOST_ERROR_CODES.aborted, 'Request aborted'));
    }

    const input = normalizeLocalHostSynthesisText(request.text);
    if (!input.trim()) {
      return Err(
        audioError.providerError(LOCAL_HOST_ERROR_CODES.invalidInput, 'Input text is empty'),
      );
    }

    const byteLength = utf8ByteLength(input);
    if (byteLength > this.maxTextUtf8Bytes) {
      // maxLength is the host's UTF-8 byte bound, not a character count.
      return Err(audioError.textTooLong(this.maxTextUtf8Bytes));
    }

    const voiceResult = await this.resolveVoice(request, signal);
    if (!voiceResult.ok) return voiceResult;
    const voice = voiceResult.value;

    // The host 422s on a missing speed, so it is always sent as a number.
    const speed = Number.isFinite(request.speed) ? request.speed : 1;

    const keyResult = await deriveIdempotencyKey(
      input,
      voice,
      speed,
      globalThis.crypto?.subtle ?? null,
    );
    if (!keyResult.ok) return keyResult;

    const httpResult = await this.request(
      `${this.baseUrl}/v1/tts`,
      {
        method: 'POST',
        redirect: 'error',
        credentials: 'omit',
        headers: {
          'content-type': 'application/json',
          accept: 'audio/wav',
          'Idempotency-Key': keyResult.value,
        },
        // Exactly these three fields: any other key is 422 `unknown_field`.
        body: JSON.stringify({ input, voice, speed }),
        signal,
      },
      signal,
    );
    if (!httpResult.ok) return httpResult;

    const httpResponse = httpResult.value;
    if (!httpResponse.ok) {
      return Err(await mapProblemResponse(httpResponse));
    }

    const bufferResult = await this.readBody(httpResponse, signal);
    if (!bufferResult.ok) return bufferResult;

    const durationMs = parseWavDurationMs(bufferResult.value);
    if (durationMs === null) {
      return Err(
        audioError.providerError(
          LOCAL_HOST_ERROR_CODES.invalidResponse,
          'Host response is not a parseable WAV stream',
        ),
      );
    }

    const contentType = httpResponse.headers.get('content-type') ?? 'audio/wav';
    return Ok({
      audioBlob: new Blob([bufferResult.value], { type: contentType.split(';')[0].trim() }),
      durationMs,
      // FR-5: the host publishes no marks; timings are never fabricated.
      wordTimings: null,
    });
  }

  /**
   * Pick the voice to synthesize with. Voice ids are read from capabilities,
   * never hard-coded (spec D-2):
   *
   * - a requested voice the host does not publish declines rather than
   *   letting the host 422;
   * - the language's primary subtag decides which published voice is used;
   * - a language with no published voice, and an undetermined language,
   *   decline so the caller falls back instead of hearing the wrong language.
   */
  private async resolveVoice(
    request: AudioRequest,
    signal?: AbortSignal,
  ): Promise<Result<string, AudioError>> {
    const capabilities = await this.loadCapabilities(signal);
    if (!capabilities.ok) return capabilities;

    const voices = capabilities.value.tts?.voices ?? [];
    if (voices.length === 0) {
      return Err(
        audioError.providerError(LOCAL_HOST_ERROR_CODES.noVoice, 'Host published no TTS voices'),
      );
    }

    if (request.voice) {
      const requested = voices.find((v) => v.id === request.voice);
      if (!requested) {
        return Err(
          audioError.providerError(
            LOCAL_HOST_ERROR_CODES.noVoice,
            `Host does not publish voice ${request.voice}`,
          ),
        );
      }
      return Ok(requested.id);
    }

    const language = request.language;
    if (!language) {
      return Err(audioError.unsupportedLanguage('und'));
    }

    const match = voices.find((v) => matchesLanguage(v.language, language));
    if (!match) {
      return Err(audioError.unsupportedLanguage(language));
    }

    return Ok(match.id);
  }

  /** The single fetch boundary: every transport failure becomes a typed error. */
  private async request(
    url: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<Result<Response, AudioError>> {
    try {
      return Ok(await this.fetchFn(url, init));
    } catch (error: unknown) {
      return Err(toTransportError(error, signal));
    }
  }

  private async readBody(
    response: Response,
    signal?: AbortSignal,
  ): Promise<Result<ArrayBuffer, AudioError>> {
    try {
      return Ok(await response.arrayBuffer());
    } catch (error: unknown) {
      return Err(toTransportError(error, signal));
    }
  }

  private async readJson(response: Response): Promise<Result<unknown, AudioError>> {
    try {
      return Ok(await response.json());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return Err(
        audioError.providerError(
          LOCAL_HOST_ERROR_CODES.invalidResponse,
          `Host returned unreadable JSON: ${message}`,
        ),
      );
    }
  }
}

/**
 * Identity of a primed synthesis: the exact parameters that produced it.
 * Anything that would change the audio changes the key, so a prime is adopted
 * only when it is indistinguishable from the request it replaces.
 */
function primedKey(request: AudioRequest, sentence: string): string {
  return JSON.stringify([sentence, request.voice, request.speed, request.language]);
}

/** Map an `application/problem+json` reply onto a typed `AudioError`. */
async function mapProblemResponse(response: Response): Promise<AudioError> {
  let problem: ApplianceProblem = {};
  try {
    problem = (await response.json()) as ApplianceProblem;
  } catch {
    // Body was not a problem document; status alone drives the mapping.
  }

  const code = problem.code ?? `http_${response.status}`;
  const detail = problem.detail ?? problem.title ?? `Host returned ${response.status}`;
  const message = problem.requestId ? `${detail} (requestId=${problem.requestId})` : detail;

  // The problem document's `code` decides, never the status class: `engine_failed`
  // is a 503 with `retryable: false`, so a rule keyed on 5xx would treat a
  // permanent failure as retryable. Oversize arrives as 413 `payload_too_large`.
  switch (problem.code) {
    case 'payload_too_large':
      return audioError.textTooLong(APPLIANCE_MAX_TEXT_UTF8_BYTES);
    case 'engine_failed':
      return audioError.providerError(code, message);
    default:
      break;
  }

  if (response.status === 401 || response.status === 403) {
    return audioError.invalidCredentials();
  }

  // A retryable refusal that states its own delay keeps that delay: `rate_limit`
  // is the only typed error that carries one, and the caller needs it to retry
  // once with the same idempotency key rather than backing off blindly.
  const statedDelayMs = retryDelayMs(problem, response);
  if (problem.retryable === true) {
    return statedDelayMs === null
      ? audioError.network(`${code}: ${message}`)
      : audioError.rateLimit(statedDelayMs);
  }
  if (response.status === 429) {
    return audioError.rateLimit(statedDelayMs ?? 0);
  }

  return audioError.providerError(code, message);
}

/**
 * Retry delay the host stated, in milliseconds. The problem body carries it
 * as `retryAfterMs` or `retry_after_ms` depending on the refusal; the
 * `Retry-After` header (seconds) is the fallback.
 */
function retryDelayMs(problem: ApplianceProblem, response: Response): number | null {
  for (const value of [problem.retryAfterMs, problem.retry_after_ms]) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  }
  const header = Number.parseFloat(response.headers.get('retry-after') ?? '');
  return Number.isFinite(header) ? Math.round(header * 1000) : null;
}

/** Distinguish abort, DNS failure and generic network failure. */
function toTransportError(error: unknown, signal?: AbortSignal): AudioError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' || signal?.aborted) {
    return audioError.providerError(LOCAL_HOST_ERROR_CODES.aborted, 'Request aborted');
  }

  const message = error instanceof Error ? error.message : String(error);
  // `Error.cause` is not in this package's TS lib target; read it structurally.
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const causeCode = typeof cause?.code === 'string' ? cause.code : '';
  if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN' || message.includes('ENOTFOUND')) {
    return audioError.providerError(
      LOCAL_HOST_ERROR_CODES.dnsFailure,
      `Host could not be resolved: ${message}`,
    );
  }

  return audioError.network(message);
}

/**
 * Match a published voice language against a requested one on the primary
 * subtag (spec D-2): `pt`, `pt-BR` and `pt-PT` all reach the `pt-BR` voice,
 * while a third language reaches none.
 */
function matchesLanguage(voiceLanguage: string, requested: string): boolean {
  const primary = (tag: string): string => tag.toLowerCase().split('-')[0];
  return primary(voiceLanguage) === primary(requested);
}
