/**
 * ServerTtsAudioAdapter BYOK Forwarding Tests
 *
 * Verifies that the ServerTtsAudioAdapter correctly forwards
 * BYOK API keys to the server via the apiClient.synthesize() call.
 *
 * @module tests/unit/adapters/audio/server-tts-byok
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { TTSSynthesizeRequest } from '@proso/shared';
import { ErrorCode, TTSProvider } from '@proso/shared';
import { ServerTtsAudioAdapter } from '../../../../src/adapters/audio/server-tts-audio.adapter';
import type { AudioError } from '../../../../src/core/shared/errors';
import { Err, Ok } from '../../../../src/core/shared/result';
import type {
  ApiClientError,
  IApiClient,
  SynthesizeResponse,
} from '../../../../src/ports/api-client.port';
import { createApiClientStub as createMockApiClient } from '../../../helpers/mock-api-client';

// ── Helpers ──

const defaultAudioRequest = {
  text: 'Hello world',
  voice: null,
  speed: 1,
  language: null,
} as const;

function lastSynthesizeRequest(apiClient: IApiClient): TTSSynthesizeRequest {
  return (apiClient.synthesize as jest.Mock).mock.calls.at(-1)?.[0] as TTSSynthesizeRequest;
}

const mockSynthesizeResponse: SynthesizeResponse = {
  audioBlob: new Blob(['audio-data'], { type: 'audio/mpeg' }),
  contentType: 'audio/mpeg',
  creditsUsed: 0,
  creditsRemaining: 100000,
  cacheHit: false,
  provider: 'openai',
};

describe('ServerTtsAudioAdapter — BYOK key forwarding', () => {
  let apiClient: IApiClient;

  beforeEach(() => {
    apiClient = createMockApiClient({
      synthesize: jest.fn<IApiClient['synthesize']>().mockResolvedValue(Ok(mockSynthesizeResponse)),
    });
  });

  // ── Constructor accepts byokApiKey ──

  it('can be constructed with a BYOK API key', () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI, 'sk-byok-test');
    expect(adapter).toBeDefined();
  });

  it('can be constructed without a BYOK API key', () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI);
    expect(adapter).toBeDefined();
  });

  // ── generateAudio forwards byokApiKey ──

  it('includes byokApiKey in the synthesize request when provided', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI, 'sk-byok-key-123');

    await adapter.generateAudio(defaultAudioRequest);

    expect(apiClient.synthesize).toHaveBeenCalledTimes(1);
    expect(lastSynthesizeRequest(apiClient).byokApiKey).toBe('sk-byok-key-123');
  });

  it('does not include byokApiKey when not provided in constructor', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI);

    await adapter.generateAudio(defaultAudioRequest);

    expect(apiClient.synthesize).toHaveBeenCalledTimes(1);
    expect(lastSynthesizeRequest(apiClient).byokApiKey).toBeUndefined();
  });

  // ── Provider and voice forwarding ──

  it('sends the preferred provider in the synthesize request', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.ElevenLabs, 'key');

    await adapter.generateAudio({ ...defaultAudioRequest, text: 'Test' });

    expect(lastSynthesizeRequest(apiClient).provider).toBe(TTSProvider.ElevenLabs);
  });

  it('sends voice and language from audio request', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI, 'key');

    await adapter.generateAudio({
      text: 'Test voice',
      voice: 'alloy',
      speed: 1,
      language: 'en',
    });

    const request = lastSynthesizeRequest(apiClient);
    expect(request).toMatchObject({ voice: 'alloy', language: 'en' });
  });

  // ── Success response mapping ──

  it('returns Ok with audioBlob and durationMs on success', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI, 'key');

    const result = await adapter.generateAudio(defaultAudioRequest);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.audioBlob).toBeDefined();
    expect(typeof result.value.durationMs).toBe('number');
    expect(result.value.wordTimings).toBeNull();
  });

  // ── Error response mapping ──

  /**
   * Drive one synthesize failure through the adapter and hand back the AudioError
   * it produced. Every case below differs only in the ApiClientError going in and
   * the AudioError expected out, so that is all each test states.
   */
  async function mapError(apiError: ApiClientError): Promise<AudioError> {
    const failClient = createMockApiClient({
      synthesize: jest.fn<IApiClient['synthesize']>().mockResolvedValue(Err(apiError)),
    });
    const adapter = new ServerTtsAudioAdapter(failClient, TTSProvider.OpenAI, 'key');

    const result = await adapter.generateAudio(defaultAudioRequest);

    if (result.ok) throw new Error('expected generateAudio to fail, but it returned Ok');
    return result.error;
  }

  it('maps unauthorized error to invalid_credentials', async () => {
    const error = await mapError({ type: 'unauthorized', message: 'Invalid BYOK key' });
    expect(error.type).toBe('invalid_credentials');
  });

  it('maps timeout error to network error', async () => {
    const error = await mapError({ type: 'timeout', timeoutMs: 10000 });
    expect(error.type).toBe('network');
  });

  // Regression lock. The server gates managed TTS on FEATURE_MATRIX.managedTts
  // and answers an unentitled request with 402. Before this branch existed the
  // reader saw "Network error: <copy>" for an entitlement refusal.
  it('maps a 402 to payment_required, carrying the server copy through unchanged', async () => {
    const message = 'Managed TTS is not included in the free tier. Add your own provider API key.';

    const error = await mapError({
      type: 'server_error',
      status: 402,
      message,
      code: ErrorCode.InsufficientCredits,
    });

    expect(error.type).toBe('payment_required');
    expect((error as { message: string }).message).toBe(message);
  });

  it('still maps 429 to rate_limit with the retry delay', async () => {
    const error = await mapError({
      type: 'server_error',
      status: 429,
      message: 'Too many requests',
      retryAfterMs: 2_000,
    });

    expect(error).toEqual({ type: 'rate_limit', retryAfterMs: 2_000 });
  });

  it('still maps other server errors to network — the 402 branch is narrow', async () => {
    const error = await mapError({ type: 'server_error', status: 503, message: 'Upstream down' });
    expect(error.type).toBe('network');
  });

  it('maps not_configured error to provider_error with original message', async () => {
    const error = await mapError({ type: 'not_configured', message: 'API key required' });
    expect(error.type).toBe('provider_error');
    expect((error as { message: string }).message).toBe('API key required');
  });

  // ── validateCredentials ──

  it('returns true when apiClient is configured', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI, 'key');
    expect(await adapter.validateCredentials()).toBe(true);
  });

  it('returns false when apiClient is not configured', async () => {
    const unconfigured = createMockApiClient({ isConfigured: false });
    // Need to override the getter
    Object.defineProperty(unconfigured, 'isConfigured', { get: () => false });
    const adapter = new ServerTtsAudioAdapter(unconfigured, TTSProvider.OpenAI, 'key');
    expect(await adapter.validateCredentials()).toBe(false);
  });
});
