/**
 * CORS exposed-header contract.
 *
 * The extension has no host permission for the API origin, so every call it
 * makes is a cross-origin request and the browser hides any response header
 * that is neither CORS-safelisted nor named in `Access-Control-Expose-Headers`.
 * `TTSController.synthesizeAudio` answers with custom `X-` metadata headers and
 * the extension's API adapter reads all of them, so the two lists must agree —
 * a header set but not exposed reaches the extension as its default value with
 * no error anywhere.
 *
 * This asserts against the headers the controller ACTUALLY sets (captured from
 * a real success-path call), not a copy of the list, so adding a fifth header
 * without exposing it fails here.
 *
 * @module tests/unit/infrastructure/cors-exposed-headers
 */

import { Ok, TTSProvider } from '@proso/shared';
import { CORS_OPTIONS } from '../../../src/infrastructure/config/cors.config';
import { TTSController } from '../../../src/infrastructure/controllers/tts.controller';
import type { CacheStorePort } from '../../../src/ports/cache-store.port';
import type { CreditRepositoryPort } from '../../../src/ports/credit-repository.port';
import type { SubscriptionRepositoryPort } from '../../../src/ports/subscription-repository.port';
import type { TTSProviderPort } from '../../../src/ports/tts-provider.port';

function createMockProviders(): Map<TTSProvider, TTSProviderPort> {
  const provider = {
    providerId: TTSProvider.OpenAI,
    supportedLanguages: ['en'],
    synthesize: jest.fn().mockResolvedValue(
      Ok({
        audio: Buffer.from('mock-audio'),
        contentType: 'audio/mpeg',
        provider: TTSProvider.OpenAI,
      }),
    ),
    getVoices: jest.fn().mockResolvedValue(Ok([])),
  } as unknown as TTSProviderPort;

  return new Map([[TTSProvider.OpenAI, provider]]);
}

function createMockResponse() {
  const res = {
    headers: {} as Record<string, string>,
    status: jest.fn().mockImplementation(() => res),
    json: jest.fn().mockImplementation(() => res),
    setHeader: jest.fn().mockImplementation((key: string, value: string) => {
      res.headers[key] = value;
      return res;
    }),
    send: jest.fn().mockImplementation(() => res),
  };
  return res;
}

describe('CORS exposed headers', () => {
  it('exposes every custom header the TTS controller sets on success', async () => {
    const controller = new TTSController(
      {
        findCurrentAllocation: jest.fn().mockResolvedValue(null),
        deductCredits: jest.fn(),
        getAllocationHistory: jest.fn().mockResolvedValue([]),
        getTransactionCount: jest.fn().mockResolvedValue(0),
        createAllocation: jest.fn(),
      } as unknown as CreditRepositoryPort,
      {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        has: jest.fn().mockResolvedValue(false),
        delete: jest.fn().mockResolvedValue(undefined),
      } as unknown as CacheStorePort,
      {
        findById: jest.fn().mockResolvedValue(null),
        findByUserId: jest.fn().mockResolvedValue(null),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
        findByPaddleId: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
        update: jest.fn(),
      } as unknown as SubscriptionRepositoryPort,
      createMockProviders(),
    );

    const res = createMockResponse();
    // BYOK keeps the success path free of credit/subscription setup (INV-002).
    await controller.synthesizeAudio(
      {} as never,
      res as never,
      {
        text: 'CORS exposed-header contract',
        provider: 'openai',
        byokApiKey: 'sk-cors-contract',
      } as never,
    );

    // Guard the premise: a controller change that stops setting these headers
    // would otherwise make the assertion below pass over an empty list.
    const customHeaders = Object.keys(res.headers).filter((name) => /^x-/i.test(name));
    expect(customHeaders.length).toBeGreaterThan(0);

    const exposed = CORS_OPTIONS.exposedHeaders.map((name) => name.toLowerCase());
    for (const name of customHeaders) {
      expect(exposed).toContain(name.toLowerCase());
    }
  });
});
