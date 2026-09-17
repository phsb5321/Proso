/**
 * Magpie bridge contract integration test
 *
 * Pedro (17/09/2026): "we need to use the same local model as lectrice is
 * using." Lectrice's local model is the pinned Magpie TTS Multilingual 357M
 * GGUF Q6_K served by its loopback bridge (`tauri-pdf-reader`
 * `tools/magpie/lectrice_magpie_bridge.py`, `http://127.0.0.1:5301`).
 *
 * This oracle replays THAT bridge's exact wire surface — its capabilities
 * document (10 preset voices, preferred 300-byte chunk bound, `runtime`
 * model-identity block), its `/health` readiness shape, its strict
 * `{input, voice, speed}` request body, and its RFC 9457 problem+json
 * failures — and proves Proso's `LocalHostAudioAdapter` interoperates with
 * it without any model- or device-specific code. The voice/model data below
 * is copied from the bridge source; if Lectrice changes its model or voice
 * map, this test is the signal to re-align.
 *
 * @module tests/integration/local-host-magpie-bridge
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LocalHostAudioAdapter } from '../../src/adapters/audio/local-host-audio.adapter';
import { isErr, isOk } from '../../src/core/shared/result';
import {
  createLocalHostFetchMock,
  ensureWebCryptoSubtle,
  jsonResponse,
  problemJsonResponse,
  wavResponse,
} from '../helpers/local-host-audio-fixtures';

const BASE_URL = 'http://127.0.0.1:5301';

/** Verbatim from the bridge: MODEL_SHA256, REVISION derives from it. */
const MODEL_SHA256 = '8291ffde2e13e2e9221a000669b5f7814c7ecc858eb0a1a9de8ee77d8da05736';
const MODEL_REVISION = `magpie-q6-vulkan-${MODEL_SHA256.slice(0, 16)}-chunk-v1`;

/** Verbatim from the bridge: SPEAKERS × {-en, -pt-BR}, in insertion order. */
const SPEAKERS = ['Aria', 'Jason', 'John', 'Leo', 'Sofia'] as const;
const VOICES = [
  ...SPEAKERS.map((speaker) => ({
    id: `${speaker}-en`,
    language: 'en-US',
    mediaTypes: ['audio/wav'],
    markKinds: [],
  })),
  ...SPEAKERS.map((speaker) => ({
    id: `${speaker}-pt-BR`,
    language: 'pt-BR',
    mediaTypes: ['audio/wav'],
    markKinds: [],
  })),
];

/** Verbatim from the bridge's GET /v1/capabilities payload. */
const CAPABILITIES = {
  status: 'ok',
  ready: true,
  limits: {
    maxTextUtf8Bytes: 300,
    idempotencyRetentionSeconds: 900,
    queueCapacity: 1,
  },
  runtime: {
    model: 'Magpie TTS Multilingual 357M',
    modelRevision: MODEL_SHA256,
    quantization: 'Q6_K',
    backend: 'Vulkan/RADV',
    device: 'AMD Radeon RX 5700 XT',
    acceleration: 'gpu',
    chunkMaxUtf8Bytes: 300,
  },
  tts: { mediaTypes: ['audio/wav'], voices: VOICES },
};

const PT_SENTENCE = 'A leitura em voz alta deve preservar a atenção do leitor.';
const PT_PARAGRAPH = `${PT_SENTENCE} A voz sintética deve seguir o texto com marcações visíveis.`;

describe('LocalHostAudioAdapter against the Lectrice Magpie bridge', () => {
  const fetchMock = createLocalHostFetchMock({
    health: { status: 'ok', ready: true, version: MODEL_REVISION },
    capabilities: CAPABILITIES,
    tts: () => wavResponse(),
  });
  const adapter = new LocalHostAudioAdapter({ baseUrl: BASE_URL, fetchFn: fetchMock });

  beforeEach(async () => {
    await ensureWebCryptoSubtle();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('accepts the bridge readiness shape (status ok + ready)', async () => {
    expect(await adapter.validateCredentials()).toBe(true);
  });

  it('discovers the ten preset Magpie voices in published order', async () => {
    const voices = await adapter.getVoices();
    expect(isOk(voices)).toBe(true);
    if (!isOk(voices)) return;
    expect(voices.value.map((v) => v.id)).toEqual([
      'Aria-en',
      'Jason-en',
      'John-en',
      'Leo-en',
      'Sofia-en',
      'Aria-pt-BR',
      'Jason-pt-BR',
      'John-pt-BR',
      'Leo-pt-BR',
      'Sofia-pt-BR',
    ]);
  });

  it('filters pt-BR and en voices by primary language subtag', async () => {
    const pt = await adapter.getVoices('pt-BR');
    expect(isOk(pt)).toBe(true);
    if (isOk(pt)) expect(pt.value.map((v) => v.id)).toEqual(SPEAKERS.map((s) => `${s}-pt-BR`));

    const en = await adapter.getVoices('en');
    expect(isOk(en)).toBe(true);
    if (isOk(en)) expect(en.value.map((v) => v.id)).toEqual(SPEAKERS.map((s) => `${s}-en`));
  });

  it('sends exactly the bridge request contract for a pt-BR sentence', async () => {
    const result = await adapter.generateAudio({
      text: PT_SENTENCE,
      voice: 'Sofia-pt-BR',
      speed: 1,
      language: 'pt-BR',
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.audioBlob.size).toBeGreaterThan(0);

    const ttsCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/v1/tts'));
    expect(ttsCalls.length).toBe(1);
    const [, init] = ttsCalls[0]!;
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['accept']).toBe('audio/wav');
    // The bridge demands a 16–128 character Idempotency-Key (422 otherwise).
    const key = headers['Idempotency-Key'];
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(key.length).toBeLessThanOrEqual(128);
    // The bridge 422s any unknown field: exactly input, voice, speed.
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['input', 'speed', 'voice']);
    expect(body['input']).toBe(PT_SENTENCE);
    expect(body['voice']).toBe('Sofia-pt-BR');
    expect(body['speed']).toBe(1);
  });

  it('keeps sentence-granular chunk inputs within the contract bounds', async () => {
    expect(adapter.supportsChunkedSynthesis).toBe(true);
    const chunks: string[] = [];
    for await (const chunk of adapter.generateAudioChunks(
      { text: PT_PARAGRAPH, voice: 'Sofia-pt-BR', speed: 1, language: 'pt-BR' },
      undefined,
    )) {
      expect(isOk(chunk)).toBe(true);
      if (isOk(chunk)) chunks.push('ok');
    }
    // One chunk per speakable sentence, in reading order.
    expect(chunks.length).toBe(2);
    const bodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith('/v1/tts'))
      .map(([, init]) => JSON.parse(String(init?.body)) as { input: string });
    expect([...bodies].map((b) => b.input).sort()).toEqual([PT_SENTENCE, expect.any(String)]);
    for (const body of bodies) {
      // Hard wire bound: the bridge 413s inputs beyond 8192 UTF-8 bytes.
      expect(new TextEncoder().encode(body.input).length).toBeLessThanOrEqual(8192);
    }
  });

  it('maps the bridge problem+json engine failure to a typed error', async () => {
    // A dedicated adapter: capabilities cache on the instance for its
    // lifetime, and the failure must land on the POST, not a lookup.
    const failing = new LocalHostAudioAdapter({ baseUrl: BASE_URL, fetchFn: fetchMock });
    await failing.validateCredentials();
    fetchMock.mockImplementationOnce(async () => problemJsonResponse(503, 'engine_failed', false));
    const result = await failing.generateAudio({
      text: PT_SENTENCE,
      voice: 'Sofia-pt-BR',
      speed: 1,
      language: 'pt-BR',
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error).toMatchObject({ type: 'provider_error', code: 'engine_failed' });
    }
  });
});
