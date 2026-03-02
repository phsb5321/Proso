/**
 * ServerTtsAudioAdapter BYOK Forwarding Tests
 *
 * Verifies that the ServerTtsAudioAdapter correctly forwards
 * BYOK API keys to the server via the apiClient.synthesize() call.
 *
 * @module tests/unit/adapters/audio/server-tts-byok
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ServerTtsAudioAdapter } from '../../../../src/adapters/audio/server-tts-audio.adapter';
import { Ok, Err } from '../../../../src/core/shared/result';
import type { IApiClient, SynthesizeResponse } from '../../../../src/ports/api-client.port';
import type { TTSSynthesizeRequest } from '@proso/shared';
import { TTSProvider } from '@proso/shared';

// ── Helpers ──

const defaultAudioRequest = {
  text: 'Hello world',
  voice: null,
  speed: 1,
  language: null,
} as const;

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    isConfigured: true,
    validateLicense: jest.fn<IApiClient['validateLicense']>(),
    getSubscription: jest.fn<IApiClient['getSubscription']>(),
    getCreditBalance: jest.fn<IApiClient['getCreditBalance']>(),
    getCreditHistory: jest.fn<IApiClient['getCreditHistory']>(),
    createCheckout: jest.fn<IApiClient['createCheckout']>(),
    synthesize: jest.fn<IApiClient['synthesize']>(),
    testApiKey: jest.fn<IApiClient['testApiKey']>(),
    ...overrides,
  };
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
    const request = (apiClient.synthesize as jest.Mock).mock.calls[0][0] as TTSSynthesizeRequest;
    expect(request.byokApiKey).toBe('sk-byok-key-123');
  });

  it('does not include byokApiKey when not provided in constructor', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI);

    await adapter.generateAudio(defaultAudioRequest);

    expect(apiClient.synthesize).toHaveBeenCalledTimes(1);
    const request = (apiClient.synthesize as jest.Mock).mock.calls[0][0] as TTSSynthesizeRequest;
    expect(request.byokApiKey).toBeUndefined();
  });

  // ── Provider and voice forwarding ──

  it('sends the preferred provider in the synthesize request', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.ElevenLabs, 'key');

    await adapter.generateAudio({ ...defaultAudioRequest, text: 'Test' });

    const request = (apiClient.synthesize as jest.Mock).mock.calls[0][0] as TTSSynthesizeRequest;
    expect(request.provider).toBe(TTSProvider.ElevenLabs);
  });

  it('sends voice and language from audio request', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI, 'key');

    await adapter.generateAudio({
      text: 'Test voice',
      voice: 'alloy',
      speed: 1,
      language: 'en',
    });

    const request = (apiClient.synthesize as jest.Mock).mock.calls[0][0] as TTSSynthesizeRequest;
    expect(request.voice).toBe('alloy');
    expect(request.language).toBe('en');
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

  it('maps unauthorized error to invalid_credentials', async () => {
    const failClient = createMockApiClient({
      synthesize: jest.fn<IApiClient['synthesize']>().mockResolvedValue(
        Err({ type: 'unauthorized', message: 'Invalid BYOK key' }),
      ),
    });
    const adapter = new ServerTtsAudioAdapter(failClient, TTSProvider.OpenAI, 'bad-key');

    const result = await adapter.generateAudio(defaultAudioRequest);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('invalid_credentials');
  });

  it('maps timeout error to network error', async () => {
    const failClient = createMockApiClient({
      synthesize: jest.fn<IApiClient['synthesize']>().mockResolvedValue(
        Err({ type: 'timeout', timeoutMs: 10000 }),
      ),
    });
    const adapter = new ServerTtsAudioAdapter(failClient, TTSProvider.OpenAI, 'key');

    const result = await adapter.generateAudio(defaultAudioRequest);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('network');
  });

  it('maps not_configured error to network error', async () => {
    const failClient = createMockApiClient({
      synthesize: jest.fn<IApiClient['synthesize']>().mockResolvedValue(
        Err({ type: 'not_configured', message: 'Server not configured' }),
      ),
    });
    const adapter = new ServerTtsAudioAdapter(failClient, TTSProvider.OpenAI);

    const result = await adapter.generateAudio(defaultAudioRequest);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('network');
  });

  // ── validateCredentials ──

  it('returns true when apiClient is configured', async () => {
    const adapter = new ServerTtsAudioAdapter(apiClient, TTSProvider.OpenAI, 'key');
    expect(await adapter.validateCredentials()).toBe(true);
  });

  it('returns false when apiClient is not configured', async () => {
    const unconfigured = createMockApiClient({ isConfigured: false } as any);
    // Need to override the getter
    Object.defineProperty(unconfigured, 'isConfigured', { get: () => false });
    const adapter = new ServerTtsAudioAdapter(unconfigured, TTSProvider.OpenAI, 'key');
    expect(await adapter.validateCredentials()).toBe(false);
  });
});
