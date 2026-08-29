/**
 * LocalHostAudioAdapter Unit Tests
 *
 * Hermetic: every appliance response is served by an injected fetch stub, so
 * the suite never needs the real appliance on the tailnet.
 *
 * @module tests/unit/adapters/audio/local-host-audio.adapter
 */

import { webcrypto } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

// jsdom's Crypto exposes no `subtle` (the #95 polyfill that shipped with the
// adapter was never merged to main). Install Node's webcrypto.subtle for this
// file only — jest gives each test file its own jsdom environment, so no other
// suite observes it.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: webcrypto.subtle,
      configurable: true,
    });
  }
});
import {
  APPLIANCE_MAX_IN_FLIGHT,
  APPLIANCE_MAX_TEXT_UTF8_BYTES,
  APPLIANCE_RECOMMENDED_CONCURRENCY,
  APPLIANCE_TTS_ADMISSION_LIMIT,
  LOCAL_HOST_ERROR_CODES,
  LocalHostAudioAdapter,
  parseWavDurationMs,
} from '../../../../src/adapters/audio/local-host-audio.adapter';
import { deriveIdempotencyKey } from '../../../../src/core/audio/idempotency-key';

/** Module-level derive helper: injects the environment's subtle at call time. */
const derive = (input: string, voice: string, speed: number) =>
  deriveIdempotencyKey(input, voice, speed, globalThis.crypto?.subtle ?? null);
import type { AudioError } from '../../../../src/core/shared/errors';
import type { Result } from '../../../../src/core/shared/result';
import { isErr, isOk } from '../../../../src/core/shared/result';
import type { AudioRequest, AudioResponse } from '../../../../src/ports/audio-generator.port';
import { runAudioGeneratorContractTests } from '../../../contract/audio-generator.contract.test';

const BASE_URL = 'https://appliance.test';

/**
 * Fictional voice ids: the adapter must read voices from capabilities, so no
 * test asserts against the appliance's real `pt_BR-faber-medium` /
 * `en_US-ljspeech-medium` ids.
 */
const CAPABILITIES = {
  apiVersion: '1',
  ready: true,
  limits: { maxTextUtf8Bytes: APPLIANCE_MAX_TEXT_UTF8_BYTES, queueCapacity: 8 },
  tts: {
    mediaTypes: ['audio/wav'],
    voices: [
      { id: 'pt_BR-test-voice', language: 'pt-BR', mediaTypes: ['audio/wav'], markKinds: [] },
      { id: 'en_US-test-voice', language: 'en-US', mediaTypes: ['audio/wav'], markKinds: [] },
    ],
  },
};

const request: AudioRequest = {
  text: 'Bom dia, mundo.',
  voice: 'pt_BR-test-voice',
  speed: 1,
  language: 'pt-BR',
};

/** Build a valid mono 16-bit RIFF/WAVE buffer of the requested duration. */
function makeWav(durationMs = 1000, sampleRate = 22050): ArrayBuffer {
  const byteRate = sampleRate * 2; // mono, 16-bit
  const dataBytes = Math.round((byteRate * durationMs) / 1000);
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeTag = (offset: number, tag: string) => {
    for (let i = 0; i < 4; i++) view.setUint8(offset + i, tag.charCodeAt(i));
  };

  writeTag(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeTag(8, 'WAVE');
  writeTag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeTag(36, 'data');
  view.setUint32(40, dataBytes, true);
  return buffer;
}

interface FakeResponseInit {
  readonly status?: number;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly buffer?: ArrayBuffer;
}

function fakeResponse(init: FakeResponseInit = {}): Response {
  const status = init.status ?? 200;
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    arrayBuffer: async () => init.buffer ?? new ArrayBuffer(0),
    json: async () => {
      if (init.body === undefined) throw new Error('no JSON body');
      return init.body;
    },
  } as unknown as Response;
}

interface StubOptions {
  readonly tts?: Response;
  readonly capabilities?: Response;
  readonly health?: Response;
  readonly throwOn?: { readonly url: string; readonly error: unknown };
}

interface FetchStub {
  (url: string, init?: RequestInit): Promise<Response>;
  calls: Array<{ url: string; init?: RequestInit }>;
}

function makeFetchStub(options: StubOptions = {}): FetchStub {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const stub = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (options.throwOn && url.includes(options.throwOn.url)) throw options.throwOn.error;
    if (url.endsWith('/v1/tts')) {
      return (
        options.tts ?? fakeResponse({ buffer: makeWav(), headers: { 'content-type': 'audio/wav' } })
      );
    }
    if (url.endsWith('/v1/capabilities')) {
      return options.capabilities ?? fakeResponse({ body: CAPABILITIES });
    }
    if (url.endsWith('/health')) {
      return (
        options.health ?? fakeResponse({ body: { status: 'ok', ready: true, version: '1.0.0' } })
      );
    }
    throw new Error(`unexpected url ${url}`);
  };
  return Object.assign(stub, { calls });
}

function makeAdapter(options: StubOptions = {}): {
  adapter: LocalHostAudioAdapter;
  fetchStub: FetchStub;
} {
  const fetchStub = makeFetchStub(options);
  return {
    adapter: new LocalHostAudioAdapter({ baseUrl: BASE_URL, fetchFn: fetchStub }),
    fetchStub,
  };
}

/** Yield to the macrotask queue so pending fetch continuations can run. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type ChunkIterator = AsyncGenerator<Result<AudioResponse, AudioError>, void, void>;

/** One `/v1/tts` request the deferred host is holding open. */
interface HeldRequest {
  readonly input: string;
  settled: boolean;
  aborted: boolean;
  finish(outcome: 'ok' | 'abort'): void;
}

/**
 * A host that answers `/v1/tts` only when the test says so.
 *
 * Priming is a claim about WHEN a request leaves the extension relative to
 * playback, and a stub that answers instantly cannot express it: every request
 * would be settled before the next one is issued, so no overlap and no cold
 * start would ever be observable. Holding requests open makes both real. An
 * abort settles the request the way a real `fetch` does, so a cancelled prime
 * genuinely releases its slot.
 */
function makeDeferredHost(options: { readonly latencyMs?: number } = {}) {
  const held: HeldRequest[] = [];
  let inFlight = 0;
  let peakInFlight = 0;

  const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.endsWith('/v1/capabilities')) return fakeResponse({ body: CAPABILITIES });
    if (!url.endsWith('/v1/tts')) throw new Error(`unexpected url ${url}`);

    const { input } = JSON.parse(String(init?.body)) as { input: string };
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);

    return new Promise<Response>((resolve, reject) => {
      const entry: HeldRequest = {
        input,
        settled: false,
        aborted: false,
        finish(outcome) {
          if (entry.settled) return;
          entry.settled = true;
          inFlight -= 1;
          if (outcome === 'abort') {
            entry.aborted = true;
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
            return;
          }
          resolve(fakeResponse({ buffer: makeWav(), headers: { 'content-type': 'audio/wav' } }));
        },
      };
      held.push(entry);
      init?.signal?.addEventListener('abort', () => entry.finish('abort'));
      if (options.latencyMs !== undefined) {
        setTimeout(() => entry.finish('ok'), options.latencyMs);
      }
    });
  };

  const releaseAll = (): void => {
    for (const entry of held) entry.finish('ok');
  };

  return {
    get maxInFlight(): number {
      return peakInFlight;
    },
    adapter: (): LocalHostAudioAdapter => new LocalHostAudioAdapter({ baseUrl: BASE_URL, fetchFn }),
    inputs: (): string[] => held.map((entry) => entry.input),
    pendingInputs: (): string[] =>
      held.filter((entry) => !entry.settled).map((entry) => entry.input),
    abortedInputs: (): string[] =>
      held.filter((entry) => entry.aborted).map((entry) => entry.input),
    countOf: (input: string): number => held.filter((entry) => entry.input === input).length,
    releaseAll,
    release(input: string): void {
      const entry = held.find((candidate) => candidate.input === input);
      if (!entry)
        throw new Error(`the host was never asked to synthesize ${JSON.stringify(input)}`);
      entry.finish('ok');
    },
    /** Resolve once the host has been asked for `input` at least `count` times. */
    async waitForRequest(input: string, count = 1): Promise<void> {
      for (let attempt = 0; attempt < 500; attempt += 1) {
        if (held.filter((entry) => entry.input === input).length >= count) return;
        await tick();
      }
      throw new Error(
        `the host was never asked to synthesize ${JSON.stringify(input)} ${count} time(s); it saw ${JSON.stringify(held.map((entry) => entry.input))}`,
      );
    },
    /**
     * Consume a chunk iterator to completion. With no configured latency the
     * held requests are answered whenever the generator would otherwise block;
     * with latency they are left to expire on their own, so the in-flight peak
     * stays the one the pipeline actually produced.
     */
    async drain(iterator: ChunkIterator): Promise<Array<Result<AudioResponse, AudioError>>> {
      const chunks: Array<Result<AudioResponse, AudioError>> = [];
      const pending = Symbol('pending');
      for (;;) {
        const step = iterator.next();
        let settled: IteratorResult<Result<AudioResponse, AudioError>, void> | null = null;
        for (let attempt = 0; attempt < 2000 && settled === null; attempt += 1) {
          const outcome = await Promise.race([step, tick().then(() => pending)]);
          if (outcome === pending) {
            if (options.latencyMs === undefined) releaseAll();
          } else {
            settled = outcome as IteratorResult<Result<AudioResponse, AudioError>, void>;
          }
        }
        if (settled === null) throw new Error('the chunk generator never made progress');
        if (settled.done) return chunks;
        chunks.push(settled.value);
      }
    },
  };
}

interface GenerateOutcome {
  readonly result: Result<AudioResponse, AudioError>;
  readonly fetchStub: FetchStub;
  readonly adapter: LocalHostAudioAdapter;
}

/** Run one synthesis against a stubbed appliance. */
async function generate(
  options: StubOptions = {},
  overrides: Partial<AudioRequest> = {},
  signal?: AbortSignal,
): Promise<GenerateOutcome> {
  const { adapter, fetchStub } = makeAdapter(options);
  const result = await adapter.generateAudio({ ...request, ...overrides }, signal);
  return { result, fetchStub, adapter };
}

function ttsCall(fetchStub: FetchStub) {
  const call = fetchStub.calls.find((c) => c.url.endsWith('/v1/tts'));
  if (!call) throw new Error('no /v1/tts request was issued');
  return call;
}

function ttsBody(fetchStub: FetchStub): Record<string, unknown> {
  return JSON.parse(String(ttsCall(fetchStub).init?.body)) as Record<string, unknown>;
}

function ttsHeaders(fetchStub: FetchStub): Record<string, string> {
  return (ttsCall(fetchStub).init?.headers ?? {}) as Record<string, string>;
}

/** Assert that no synthesis request left the extension. */
function expectNoTtsRequest(fetchStub: FetchStub): void {
  expect(fetchStub.calls.filter((c) => c.url.endsWith('/v1/tts'))).toHaveLength(0);
}

/** Assert an error Result of the given discriminant, returning it narrowed. */
function expectErrorType<T extends AudioError['type']>(
  result: Result<AudioResponse, AudioError>,
  type: T,
): Extract<AudioError, { type: T }> {
  expect(isErr(result)).toBe(true);
  if (!isErr(result)) throw new Error(`expected an error Result of type ${type}`);
  expect(result.error.type).toBe(type);
  return result.error as Extract<AudioError, { type: T }>;
}

/** Assert a `provider_error` carrying a specific appliance code. */
function expectProviderErrorCode(
  result: Result<AudioResponse, AudioError>,
  code: string,
): { code: string; message: string } {
  const error = expectErrorType(result, 'provider_error');
  expect(error.code).toBe(code);
  return error;
}

/** Assert a successful Result, returning the response. */
function expectOkResponse(result: Result<AudioResponse, AudioError>): AudioResponse {
  expect(isOk(result)).toBe(true);
  if (!isOk(result)) throw new Error('expected a successful Result');
  return result.value;
}

// The adapter must satisfy the shared IAudioGenerator contract.
runAudioGeneratorContractTests('LocalHostAudioAdapter', () => makeAdapter().adapter);

describe('LocalHostAudioAdapter', () => {
  describe('POST /v1/tts request shape', () => {
    it('sends an Idempotency-Key header inside the appliance 16..128 window', async () => {
      const { fetchStub } = await generate();

      const key = ttsHeaders(fetchStub)['Idempotency-Key'];
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(key.length).toBeGreaterThanOrEqual(16);
      expect(key.length).toBeLessThanOrEqual(128);
    });

    it('derives the same key for the same (input, voice, speed)', async () => {
      const first = await generate();
      const second = await generate();

      expect(ttsHeaders(first.fetchStub)['Idempotency-Key']).toBe(
        ttsHeaders(second.fetchStub)['Idempotency-Key'],
      );
    });

    it('derives a different key when input, voice or speed differ', async () => {
      const keys = await Promise.all([
        derive('texto', 'voice-a', 1),
        derive('outro', 'voice-a', 1),
        derive('texto', 'voice-b', 1),
        derive('texto', 'voice-a', 1.5),
      ]);

      const values = keys.flatMap((key: Result<string, AudioError>) =>
        isOk(key) ? [key.value] : [],
      );
      expect(values).toHaveLength(4);
      expect(new Set(values).size).toBe(4);
    });

    it('sends exactly input, voice and speed — no other body field', async () => {
      const { fetchStub } = await generate();

      expect(Object.keys(ttsBody(fetchStub)).sort()).toEqual(['input', 'speed', 'voice']);
    });

    it('removes non-spoken box-drawing glyphs only at the synthesis boundary', async () => {
      const text = '├ Primeiro item; └ último item.';
      const sourceRequest = { ...request, text };
      const { fetchStub } = await generate({}, sourceRequest);
      const body = ttsBody(fetchStub);

      expect(body.input).toBe('  Primeiro item;   último item.');
      expect(sourceRequest.text).toBe(text);
      expect(String(body.input)).not.toMatch(/[\u2500-\u257f]/u);
    });

    it('skips structural-only chunks while preserving the following sentence', async () => {
      const { adapter, fetchStub } = makeAdapter();
      const chunks: Array<Result<AudioResponse, AudioError>> = [];
      for await (const chunk of adapter.generateAudioChunks?.({
        ...request,
        text: '────. Conteúdo falado.',
      }) ?? []) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(ttsBody(fetchStub).input).toBe('Conteúdo falado.');
    });

    it('negotiates audio/wav with a JSON content type', async () => {
      const { fetchStub } = await generate();

      const headers = ttsHeaders(fetchStub);
      expect(headers.accept).toBe('audio/wav');
      expect(headers['content-type']).toBe('application/json');
    });

    it('always sends speed as a number, even when the request omits it', async () => {
      const { fetchStub } = await generate({}, { speed: Number.NaN });

      const body = ttsBody(fetchStub);
      expect('speed' in body).toBe(true);
      expect(typeof body.speed).toBe('number');
      expect(Number.isFinite(body.speed as number)).toBe(true);
    });

    it('POSTs to {baseUrl}/v1/tts without a hard-coded host', async () => {
      const { fetchStub } = await generate();

      expect(ttsCall(fetchStub).url).toBe(`${BASE_URL}/v1/tts`);
      expect(ttsCall(fetchStub).init?.method).toBe('POST');
    });
  });

  describe('input bounds (FR-7)', () => {
    it('accepts input exactly at the 8192 UTF-8 byte bound', async () => {
      const text = 'á'.repeat(APPLIANCE_MAX_TEXT_UTF8_BYTES / 2); // 2 bytes each

      const { result, fetchStub } = await generate({}, { text });

      expectOkResponse(result);
      expect(ttsCall(fetchStub).url).toBe(`${BASE_URL}/v1/tts`);
    });

    it('rejects input over the bound counted in bytes, not characters', async () => {
      // 4097 characters (under 8192) but 8194 UTF-8 bytes (over the bound).
      const text = 'á'.repeat(APPLIANCE_MAX_TEXT_UTF8_BYTES / 2 + 1);
      expect(text.length).toBeLessThan(APPLIANCE_MAX_TEXT_UTF8_BYTES);

      const { result, fetchStub } = await generate({}, { text });

      const error = expectErrorType(result, 'text_too_long');
      expect(error.maxLength).toBe(APPLIANCE_MAX_TEXT_UTF8_BYTES);
      expectNoTtsRequest(fetchStub);
    });

    it('rejects empty input without issuing any request', async () => {
      const { result, fetchStub } = await generate({}, { text: '' });

      expectErrorType(result, 'provider_error');
      expect(fetchStub.calls).toHaveLength(0);
    });
  });

  describe('successful synthesis', () => {
    it('returns a WAV blob with the duration parsed from the header', async () => {
      const { result } = await generate({
        tts: fakeResponse({ buffer: makeWav(2500), headers: { 'content-type': 'audio/wav' } }),
      });

      const response = expectOkResponse(result);
      expect(response.audioBlob.type).toBe('audio/wav');
      expect(response.durationMs).toBe(2500);
    });

    it('never returns word timings (FR-5)', async () => {
      const { result, adapter } = await generate();

      expect(adapter.supportsWordTiming).toBe(false);
      expect(expectOkResponse(result).wordTimings).toBeNull();
    });

    it('reports a non-WAV body as a provider error instead of guessing a duration', async () => {
      const { result } = await generate({
        tts: fakeResponse({ buffer: new TextEncoder().encode('not audio').buffer }),
      });

      expectProviderErrorCode(result, LOCAL_HOST_ERROR_CODES.invalidResponse);
    });
  });

  describe('abort handling', () => {
    it('forwards the AbortSignal to fetch', async () => {
      const controller = new AbortController();

      const { fetchStub } = await generate({}, {}, controller.signal);

      expect(ttsCall(fetchStub).init?.signal).toBe(controller.signal);
    });

    it('returns an abort error without issuing a request when already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const { result, fetchStub } = await generate({}, {}, controller.signal);

      expectProviderErrorCode(result, LOCAL_HOST_ERROR_CODES.aborted);
      expect(fetchStub.calls).toHaveLength(0);
    });

    it('maps an in-flight AbortError to the abort code', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const { result } = await generate({ throwOn: { url: '/v1/tts', error: abortError } });

      expectProviderErrorCode(result, LOCAL_HOST_ERROR_CODES.aborted);
    });
  });

  describe('problem+json mapping', () => {
    it('maps a terminal problem to provider_error and keeps the requestId', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 422,
          headers: { 'content-type': 'application/problem+json' },
          body: {
            type: 'about:blank',
            code: 'unknown_field',
            status: 422,
            retryable: false,
            detail: 'Unknown field: text',
            requestId: 'req-42',
          },
        }),
      });

      const error = expectProviderErrorCode(result, 'unknown_field');
      expect(error.message).toContain('req-42');
    });

    it('maps a retryable problem to a network error', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 503,
          body: {
            code: 'queue_full',
            status: 503,
            retryable: true,
            detail: 'Queue at capacity',
            requestId: 'req-7',
          },
        }),
      });

      const error = expectErrorType(result, 'network');
      expect(error.message).toContain('queue_full');
      expect(error.message).toContain('req-7');
    });

    it('maps 429 to rate_limit with the Retry-After delay', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 429,
          headers: { 'retry-after': '2' },
          body: { code: 'rate_limited', status: 429, retryable: true },
        }),
      });

      expect(expectErrorType(result, 'rate_limit').retryAfterMs).toBe(2000);
    });

    it('prefers the retry delay the appliance states in the body', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 429,
          headers: { 'retry-after': '30' },
          body: { code: 'queue_full', status: 429, retryable: true, retryAfterMs: 14000 },
        }),
      });

      expect(expectErrorType(result, 'rate_limit').retryAfterMs).toBe(14000);
    });

    it('accepts the snake_case spelling of the stated delay', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 503,
          body: {
            code: 'engine_not_ready',
            status: 503,
            retryable: true,
            retry_after_ms: 5000,
          },
        }),
      });

      expect(expectErrorType(result, 'rate_limit').retryAfterMs).toBe(5000);
    });

    it('maps 413 payload_too_large to text_too_long, not to a generic 4xx', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 413,
          body: {
            code: 'payload_too_large',
            status: 413,
            retryable: false,
            detail: 'Input is 8193 bytes; the limit is 8192',
          },
        }),
      });

      expect(expectErrorType(result, 'text_too_long').maxLength).toBe(
        APPLIANCE_MAX_TEXT_UTF8_BYTES,
      );
    });

    it('keeps an unknown voice terminal so the caller falls back', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 422,
          body: { code: 'unknown_voice', status: 422, retryable: false, detail: 'no such voice' },
        }),
      });

      expectProviderErrorCode(result, 'unknown_voice');
    });

    it('treats a retryable:false 503 as terminal, never as its status class', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 503,
          body: { code: 'engine_failed', status: 503, retryable: false, requestId: 'req-9' },
        }),
      });

      expectProviderErrorCode(result, 'engine_failed');
    });

    it('treats a 409 key reuse as terminal, since a derived key cannot collide', async () => {
      const { result } = await generate({
        tts: fakeResponse({
          status: 409,
          body: { code: 'idempotency_key_reused', status: 409, retryable: false },
        }),
      });

      expectProviderErrorCode(result, 'idempotency_key_reused');
    });

    it('maps 401 to invalid_credentials', async () => {
      const { result } = await generate({
        tts: fakeResponse({ status: 401, body: { code: 'unauthorized', status: 401 } }),
      });

      expectErrorType(result, 'invalid_credentials');
    });

    it('falls back to the HTTP status when the body is not a problem document', async () => {
      const { result } = await generate({ tts: fakeResponse({ status: 500 }) });

      expectProviderErrorCode(result, 'http_500');
    });
  });

  describe('transport failures', () => {
    it('distinguishes a DNS failure from a generic network failure', async () => {
      const dnsError = new Error('fetch failed');
      (dnsError as Error & { cause?: unknown }).cause = { code: 'ENOTFOUND' };

      const { result } = await generate({ throwOn: { url: '/v1/tts', error: dnsError } });

      expectProviderErrorCode(result, LOCAL_HOST_ERROR_CODES.dnsFailure);
    });

    it('maps a generic connection failure to a network error', async () => {
      const { result } = await generate({
        throwOn: { url: '/v1/tts', error: new TypeError('NetworkError when fetching') },
      });

      expect(expectErrorType(result, 'network').message).toContain('NetworkError');
    });
  });

  describe('getVoices()', () => {
    it('maps voices from GET /v1/capabilities', async () => {
      const { adapter, fetchStub } = makeAdapter();

      const result = await adapter.getVoices();

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.map((v) => v.id)).toEqual(['pt_BR-test-voice', 'en_US-test-voice']);
      expect(result.value[0].language).toBe('pt-BR');
      expect(fetchStub.calls.some((c) => c.url === `${BASE_URL}/v1/capabilities`)).toBe(true);
    });

    it('filters by primary language subtag', async () => {
      const { adapter } = makeAdapter();

      const result = await adapter.getVoices('pt');

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.map((v) => v.id)).toEqual(['pt_BR-test-voice']);
    });

    it('derives supportedLanguages from capabilities rather than a literal', async () => {
      const { adapter } = makeAdapter();
      expect(adapter.supportedLanguages).toEqual([]);

      await adapter.getVoices();

      expect(adapter.supportedLanguages).toEqual(['pt-BR', 'en-US']);
    });
  });

  describe('voice resolution (D-2)', () => {
    it('picks a published voice matching the request language when none is given', async () => {
      const { fetchStub } = await generate({}, { voice: null, language: 'en' });

      expect(ttsBody(fetchStub).voice).toBe('en_US-test-voice');
    });

    it('matches on the primary subtag, so pt-PT reaches the pt-BR voice', async () => {
      const { fetchStub } = await generate({}, { voice: null, language: 'pt-PT' });

      expect(ttsBody(fetchStub).voice).toBe('pt_BR-test-voice');
    });

    it('declines a language no published voice serves', async () => {
      const { result, fetchStub } = await generate({}, { voice: null, language: 'de' });

      expect(expectErrorType(result, 'unsupported_language').language).toBe('de');
      expectNoTtsRequest(fetchStub);
    });

    it('declines an undetermined language instead of guessing a voice', async () => {
      const { result, fetchStub } = await generate({}, { voice: null, language: null });

      expectErrorType(result, 'unsupported_language');
      expectNoTtsRequest(fetchStub);
    });

    it('declines a requested voice the appliance does not publish', async () => {
      const { result, fetchStub } = await generate({}, { voice: 'nl_NL-absent-voice' });

      expectProviderErrorCode(result, LOCAL_HOST_ERROR_CODES.noVoice);
      expectNoTtsRequest(fetchStub);
    });
  });

  describe('validateCredentials()', () => {
    it('is true only when health reports status ok and ready true', async () => {
      const { adapter } = makeAdapter();
      await expect(adapter.validateCredentials()).resolves.toBe(true);
    });

    it('is false when the appliance is not ready', async () => {
      const { adapter } = makeAdapter({
        health: fakeResponse({ body: { status: 'ok', ready: false, version: '1.0.0' } }),
      });
      await expect(adapter.validateCredentials()).resolves.toBe(false);
    });

    it('is false when health reports a non-ok status', async () => {
      const { adapter } = makeAdapter({
        health: fakeResponse({ body: { status: 'degraded', ready: true } }),
      });
      await expect(adapter.validateCredentials()).resolves.toBe(false);
    });

    it('is false when the appliance is unreachable', async () => {
      const { adapter } = makeAdapter({
        throwOn: { url: '/health', error: new TypeError('connection refused') },
      });
      await expect(adapter.validateCredentials()).resolves.toBe(false);
    });
  });

  describe('base URL handling', () => {
    it('tolerates a trailing slash in the configured base URL', async () => {
      const fetchStub = makeFetchStub();
      const adapter = new LocalHostAudioAdapter({
        baseUrl: `${BASE_URL}/`,
        fetchFn: fetchStub,
      });

      await adapter.generateAudio(request);

      expect(ttsCall(fetchStub).url).toBe(`${BASE_URL}/v1/tts`);
    });
  });

  describe('cross-paragraph priming (PROSO-209)', () => {
    const PARAGRAPH_A = 'A one. A two.';
    const PARAGRAPH_B = 'B one. B two.';

    it('starts the next paragraph before it yields the current one’s last chunk', async () => {
      const host = makeDeferredHost();
      const adapter = host.adapter();
      const iterator = adapter.generateAudioChunks({ ...request, text: PARAGRAPH_A }, undefined, {
        nextText: PARAGRAPH_B,
      });

      const firstChunk = iterator.next();
      await host.waitForRequest('A one.');
      host.release('A one.');
      expect((await firstChunk).done).toBe(false);

      // Asking for the last chunk is what frees the prefetch slot, so the next
      // paragraph's first sentence must already be at the host before that
      // chunk comes back — not after playback has drained.
      const lastChunk = iterator.next();
      await host.waitForRequest('B one.');
      expect(host.pendingInputs()).toContain('B one.');

      host.release('A two.');
      host.release('B one.');
      expect((await lastChunk).done).toBe(false);
      expect((await iterator.next()).done).toBe(true);
    });

    /**
     * Read paragraph A to completion while announcing B, then wait until the
     * host has actually been asked for B's first sentence.
     *
     * Three boundary tests need exactly this preamble, and repeating it tripped
     * the duplication gate. Naming it also names the thing under test: the
     * prime happens DURING paragraph A, not after it.
     */
    const primeAcrossBoundary = async () => {
      const host = makeDeferredHost();
      const adapter = host.adapter();
      const iterator = adapter.generateAudioChunks({ ...request, text: PARAGRAPH_A }, undefined, {
        nextText: PARAGRAPH_B,
      });

      // Step A explicitly: generic drain() releases every held request and may
      // settle the B prime in the same tick as A's last sentence.
      const first = iterator.next();
      await host.waitForRequest('A one.');
      host.release('A one.');
      expect((await first).done).toBe(false);

      const last = iterator.next();
      await host.waitForRequest('A two.');
      await host.waitForRequest('B one.');
      host.release('A two.');
      expect((await last).done).toBe(false);
      expect((await iterator.next()).done).toBe(true);

      return { host, adapter };
    };

    it('yields the next paragraph’s first chunk without a new round trip', async () => {
      // The prime completed while the reader was still hearing paragraph A.
      const { host, adapter } = await primeAcrossBoundary();
      host.release('B one.');
      expect(host.pendingInputs()).not.toContain('B one.');

      const iterator = adapter.generateAudioChunks({ ...request, text: PARAGRAPH_B }, undefined, {
        nextText: null,
      });
      const first = await iterator.next();
      if (first.done) throw new Error('the primed paragraph yielded nothing');
      expectOkResponse(first.value);

      // The whole point: no second request for the sentence that starts the
      // paragraph. On the pre-PROSO-209 pipeline this is 2 — a full synthesis
      // round trip of silence at every boundary.
      expect(host.countOf('B one.')).toBe(1);
      await host.drain(iterator);
    });

    it('never exceeds two synthesis requests in flight across a boundary', async () => {
      // Real latency, so overlap actually happens and the peak is meaningful.
      const host = makeDeferredHost({ latencyMs: 20 });
      const adapter = host.adapter();
      const paragraphs = ['A one. A two. A three.', 'B one. B two.', 'C one.'];

      for (const [index, text] of paragraphs.entries()) {
        await host.drain(
          adapter.generateAudioChunks({ ...request, text }, undefined, {
            nextText: paragraphs[index + 1] ?? null,
          }),
        );
      }

      expect(host.maxInFlight).toBe(APPLIANCE_MAX_IN_FLIGHT);
      expect(host.maxInFlight).toBeLessThanOrEqual(CAPABILITIES.limits.queueCapacity);
    });

    it('abandons a prime the next request does not match', async () => {
      const { host, adapter } = await primeAcrossBoundary();
      expect(host.pendingInputs()).toContain('B one.');

      // The reader changed voice mid-article: the primed audio is the wrong
      // voice, so it is cancelled rather than played or left holding a slot.
      const iterator = adapter.generateAudioChunks(
        { ...request, text: PARAGRAPH_B, voice: 'en_US-test-voice', language: 'en-US' },
        undefined,
        { nextText: null },
      );
      const first = iterator.next();
      await host.waitForRequest('B one.', 2);

      expect(host.abortedInputs()).toEqual(['B one.']);
      expect(host.countOf('B one.')).toBe(2);
      host.releaseAll();
      expect((await first).done).toBe(false);
      await host.drain(iterator);
    });

    it('primes nothing when no paragraph follows', async () => {
      const host = makeDeferredHost();
      const adapter = host.adapter();

      await host.drain(
        adapter.generateAudioChunks({ ...request, text: PARAGRAPH_A }, undefined, {
          nextText: null,
        }),
      );

      const inputs = host.inputs();
      expect(inputs).toHaveLength(2);
      expect(inputs).toEqual(expect.arrayContaining(['A one.', 'A two.']));
    });
  });

  describe('published limits', () => {
    it('admits fewer requests than the advertised queueCapacity', () => {
      // queueCapacity is TTS plus STT; a measured burst admitted 4, not 8.
      expect(APPLIANCE_TTS_ADMISSION_LIMIT).toBeLessThan(CAPABILITIES.limits.queueCapacity);
      expect(APPLIANCE_TTS_ADMISSION_LIMIT).toBe(4);
    });

    it('recommends a single in-flight synthesis, since the appliance has one worker', () => {
      expect(APPLIANCE_RECOMMENDED_CONCURRENCY).toBe(1);
    });
  });

  describe('parseWavDurationMs()', () => {
    it('reads duration from the fmt byte rate and data chunk size', () => {
      expect(parseWavDurationMs(makeWav(1500))).toBe(1500);
      expect(parseWavDurationMs(makeWav(250, 48000))).toBe(250);
    });

    it('returns null for a non-RIFF buffer', () => {
      expect(parseWavDurationMs(new TextEncoder().encode('MP3 maybe not').buffer)).toBeNull();
    });

    it('returns null for a truncated buffer', () => {
      expect(parseWavDurationMs(new ArrayBuffer(4))).toBeNull();
    });
  });

  describe('idempotency key derivation', () => {
    let subtle: SubtleCrypto;

    beforeEach(() => {
      subtle = globalThis.crypto.subtle;
    });

    it('reports a typed error rather than hand-rolling a hash when subtle is missing', async () => {
      Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true });

      const result = await derive('texto', 'voice-a', 1);

      Object.defineProperty(globalThis.crypto, 'subtle', { value: subtle, configurable: true });

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.type).toBe('provider_error');
      if (result.error.type !== 'provider_error') return;
      expect(result.error.code).toBe(LOCAL_HOST_ERROR_CODES.cryptoUnavailable);
    });
  });
});
