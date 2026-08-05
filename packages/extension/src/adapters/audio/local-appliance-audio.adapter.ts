/**
 * Local Appliance Audio Adapter
 *
 * Talks to a user-configured local audio appliance
 * (`specs/100-local-appliance-tts/`) that exposes
 * `GET /health`, `GET /v1/capabilities` and `POST /v1/tts` and answers with raw
 * WAV. The appliance publishes `markKinds: []` for every voice, so this
 * provider never returns word timings (FR-5) — `PlaybackService` falls back to
 * its existing estimation path for `wordTimings: null`.
 *
 * The base URL is injected (FR-3): no appliance host is hard-coded here.
 *
 * @module adapters/audio/local-appliance-audio
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

/**
 * Appliance input bound (`limits.maxTextUtf8Bytes`), enforced client-side
 * before a request is issued (FR-7). Counted in UTF-8 bytes, not characters —
 * Portuguese text is multi-byte.
 */
export const APPLIANCE_MAX_TEXT_UTF8_BYTES = 8192;

/** Appliance `Idempotency-Key` length window (16..128 characters). */
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/**
 * Error codes this adapter reports through `provider_error`.
 *
 * `AudioError` has a single `network` member, so the three transport outcomes
 * the appliance can produce are distinguished by code rather than by widening
 * the shared union (which is switched on in `playback-service` and
 * `audio.handlers`).
 */
export const APPLIANCE_ERROR_CODES = {
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
interface ApplianceCapabilities {
  readonly ready?: boolean;
  readonly limits?: { readonly maxTextUtf8Bytes?: number };
  readonly tts?: { readonly voices?: readonly ApplianceVoice[] };
}

/** RFC-9457 problem document returned by the appliance on every error. */
interface ApplianceProblem {
  readonly code?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly status?: number;
  readonly retryable?: boolean;
  readonly requestId?: string;
}

export interface LocalApplianceAudioAdapterOptions {
  /** Appliance base URL, e.g. `https://host.example` (user setting, FR-3). */
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

/** UTF-8 byte length of a string (not its character count). */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Audio adapter for a local appliance reachable over the user's own network.
 *
 * Every fallible step returns `Result`; `try/catch` lives only at the fetch
 * boundary.
 */
export class LocalApplianceAudioAdapter implements IAudioGenerator {
  readonly providerId = 'local' as const;
  /** The appliance publishes `markKinds: []` — it emits no word marks (FR-5). */
  readonly supportsWordTiming = false;

  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly maxTextUtf8Bytes: number;
  private capabilities: ApplianceCapabilities | null = null;

  constructor(options: LocalApplianceAudioAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.maxTextUtf8Bytes = options.maxTextUtf8Bytes ?? APPLIANCE_MAX_TEXT_UTF8_BYTES;
  }

  /**
   * Languages published by the appliance's capabilities.
   *
   * Derived, never a literal. Empty until capabilities have been read, which
   * the port documents as "all languages" — the appliance's own voice list is
   * the only authority once it is known.
   */
  get supportedLanguages(): readonly string[] {
    const voices = this.capabilities?.tts?.voices ?? [];
    return [...new Set(voices.map((voice) => voice.language))];
  }

  async generateAudio(
    request: AudioRequest,
    signal?: AbortSignal,
  ): Promise<Result<AudioResponse, AudioError>> {
    if (signal?.aborted) {
      return Err(audioError.providerError(APPLIANCE_ERROR_CODES.aborted, 'Request aborted'));
    }

    const input = request.text;
    if (input.length === 0) {
      return Err(
        audioError.providerError(APPLIANCE_ERROR_CODES.invalidInput, 'Input text is empty'),
      );
    }

    const byteLength = utf8ByteLength(input);
    if (byteLength > this.maxTextUtf8Bytes) {
      // maxLength is the appliance's UTF-8 byte bound, not a character count.
      return Err(audioError.textTooLong(this.maxTextUtf8Bytes));
    }

    const voiceResult = await this.resolveVoice(request, signal);
    if (!voiceResult.ok) return voiceResult;
    const voice = voiceResult.value;

    // The appliance 422s on a missing speed, so it is always sent as a number.
    const speed = Number.isFinite(request.speed) ? request.speed : 1;

    const keyResult = await deriveIdempotencyKey(input, voice, speed);
    if (!keyResult.ok) return keyResult;

    const httpResult = await this.request(
      `${this.baseUrl}/v1/tts`,
      {
        method: 'POST',
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
          APPLIANCE_ERROR_CODES.invalidResponse,
          'Appliance response is not a parseable WAV stream',
        ),
      );
    }

    const contentType = httpResponse.headers.get('content-type') ?? 'audio/wav';
    return Ok({
      audioBlob: new Blob([bufferResult.value], { type: contentType.split(';')[0].trim() }),
      durationMs,
      // FR-5: the appliance publishes no marks; timings are never fabricated.
      wordTimings: null,
    });
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
   * The appliance is credential-free; readiness is the only gate.
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
   * Pick the voice to synthesize with. Voice ids are read from capabilities,
   * never hard-coded (spec D-2):
   *
   * - a requested voice the appliance does not publish declines rather than
   *   letting the appliance 422;
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
        audioError.providerError(
          APPLIANCE_ERROR_CODES.noVoice,
          'Appliance published no TTS voices',
        ),
      );
    }

    if (request.voice) {
      const requested = voices.find((v) => v.id === request.voice);
      if (!requested) {
        return Err(
          audioError.providerError(
            APPLIANCE_ERROR_CODES.noVoice,
            `Appliance does not publish voice ${request.voice}`,
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
          APPLIANCE_ERROR_CODES.invalidResponse,
          `Appliance returned unreadable JSON: ${message}`,
        ),
      );
    }
  }
}

/**
 * Stable digest of `(input, voice, speed)` (FR-8): replaying the same paragraph
 * reuses the appliance's cached audio instead of re-synthesizing. SHA-256 hex is
 * 64 characters, inside the appliance's 16..128 window.
 */
export async function deriveIdempotencyKey(
  input: string,
  voice: string,
  speed: number,
): Promise<Result<string, AudioError>> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return Err(
      audioError.providerError(
        APPLIANCE_ERROR_CODES.cryptoUnavailable,
        'Web Crypto subtle digest is unavailable; cannot derive an idempotency key',
      ),
    );
  }

  const payload = new TextEncoder().encode(`${input}\u0000${voice}\u0000${speed}`);
  const digest = await subtle.digest('SHA-256', payload);
  const key = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return Ok(key);
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
  const detail = problem.detail ?? problem.title ?? `Appliance returned ${response.status}`;
  const message = problem.requestId ? `${detail} (requestId=${problem.requestId})` : detail;

  if (response.status === 401 || response.status === 403) {
    return audioError.invalidCredentials();
  }
  if (response.status === 429) {
    const retryAfter = Number.parseFloat(response.headers.get('retry-after') ?? '');
    return audioError.rateLimit(Number.isFinite(retryAfter) ? Math.round(retryAfter * 1000) : 0);
  }
  // `retryable` is the appliance's own verdict; it decides retryable vs terminal.
  if (problem.retryable === true) {
    return audioError.network(`${code}: ${message}`);
  }
  return audioError.providerError(code, message);
}

/** Distinguish abort, DNS failure and generic network failure. */
function toTransportError(error: unknown, signal?: AbortSignal): AudioError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' || signal?.aborted) {
    return audioError.providerError(APPLIANCE_ERROR_CODES.aborted, 'Request aborted');
  }

  const message = error instanceof Error ? error.message : String(error);
  // `Error.cause` is not in this package's TS lib target; read it structurally.
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  const causeCode = typeof cause?.code === 'string' ? cause.code : '';
  if (causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN' || message.includes('ENOTFOUND')) {
    return audioError.providerError(
      APPLIANCE_ERROR_CODES.dnsFailure,
      `Appliance host could not be resolved: ${message}`,
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
