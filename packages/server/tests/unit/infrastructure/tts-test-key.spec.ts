/**
 * TTS Controller test-key endpoint tests
 *
 * Verifies the controller's BYOK key validation logic:
 * - Missing provider or apiKey returns BadRequestException
 * - Invalid provider returns BadRequestException
 * - Successful synthesis returns { success: true, latencyMs }
 * - Failed synthesis returns { success: false, error }
 * - Missing adapter returns { success: false, error: 'Provider not available...' }
 * - apiKey is forwarded as byokApiKey to adapter.synthesize
 * - Minimal text 'a' is used for the test synthesis call
 *
 * @module tests/unit/infrastructure/tts-test-key
 */

import { BadRequestException } from '@nestjs/common';
import {
  TTSProvider,
  ErrorCode,
  Ok,
  Err,
} from '@proso/shared';
import { TTSController } from '../../../src/infrastructure/controllers/tts.controller';
import type {
  CreditRepositoryPort,
} from '../../../src/ports/credit-repository.port';
import type { CacheStorePort } from '../../../src/ports/cache-store.port';
import type { SubscriptionRepositoryPort } from '../../../src/ports/subscription-repository.port';
import type { TTSProviderPort } from '../../../src/ports/tts-provider.port';
import type { TTSError } from '../../../src/core/shared/domain-errors';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockCreditRepo(): jest.Mocked<CreditRepositoryPort> {
  return {
    findCurrentAllocation: jest.fn().mockResolvedValue(null),
    deductCredits: jest.fn(),
    getAllocationHistory: jest.fn().mockResolvedValue([]),
    getTransactionCount: jest.fn().mockResolvedValue(0),
    createAllocation: jest.fn(),
  } as unknown as jest.Mocked<CreditRepositoryPort>;
}

function createMockCacheStore(): jest.Mocked<CacheStorePort> {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    has: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CacheStorePort>;
}

function createMockSubscriptionRepo(): jest.Mocked<SubscriptionRepositoryPort> {
  return {
    findById: jest.fn().mockResolvedValue(null),
    findByUserId: jest.fn().mockResolvedValue(null),
    findActiveByUserId: jest.fn().mockResolvedValue(null),
    findByPaddleId: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<SubscriptionRepositoryPort>;
}

function createMockTTSProvider(providerId: TTSProvider): jest.Mocked<TTSProviderPort> {
  return {
    providerId,
    supportedLanguages: ['en'],
    synthesize: jest.fn().mockResolvedValue(
      Ok({
        audio: Buffer.from('mock-audio'),
        contentType: 'audio/mpeg',
        provider: providerId,
      }),
    ),
    getVoices: jest.fn().mockResolvedValue(Ok([])),
  } as unknown as jest.Mocked<TTSProviderPort>;
}

function createMockProviders(): Map<TTSProvider, jest.Mocked<TTSProviderPort>> {
  const providers = new Map<TTSProvider, jest.Mocked<TTSProviderPort>>();
  providers.set(TTSProvider.OpenAI, createMockTTSProvider(TTSProvider.OpenAI));
  providers.set(TTSProvider.ElevenLabs, createMockTTSProvider(TTSProvider.ElevenLabs));
  providers.set(TTSProvider.Groq, createMockTTSProvider(TTSProvider.Groq));
  providers.set(TTSProvider.Cartesia, createMockTTSProvider(TTSProvider.Cartesia));
  return providers;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TTSController — test-key endpoint', () => {
  let controller: TTSController;
  let creditRepo: jest.Mocked<CreditRepositoryPort>;
  let cacheStore: jest.Mocked<CacheStorePort>;
  let subscriptionRepo: jest.Mocked<SubscriptionRepositoryPort>;
  let providers: Map<TTSProvider, jest.Mocked<TTSProviderPort>>;

  beforeEach(() => {
    creditRepo = createMockCreditRepo();
    cacheStore = createMockCacheStore();
    subscriptionRepo = createMockSubscriptionRepo();
    providers = createMockProviders();

    controller = new TTSController(
      creditRepo,
      cacheStore,
      subscriptionRepo,
      providers as Map<TTSProvider, TTSProviderPort>,
    );
  });

  // -----------------------------------------------------------------------
  // 1. Missing provider
  // -----------------------------------------------------------------------
  describe('input validation — missing fields', () => {
    it('throws BadRequestException when provider is missing', async () => {
      await expect(
        controller.testKey({ apiKey: 'sk-test-key-123' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.testKey({ apiKey: 'sk-test-key-123' }),
      ).rejects.toThrow('provider and apiKey are required');
    });

    // -------------------------------------------------------------------
    // 2. Missing apiKey
    // -------------------------------------------------------------------
    it('throws BadRequestException when apiKey is missing', async () => {
      await expect(
        controller.testKey({ provider: 'openai' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.testKey({ provider: 'openai' }),
      ).rejects.toThrow('provider and apiKey are required');
    });

    it('throws BadRequestException when both provider and apiKey are missing', async () => {
      await expect(
        controller.testKey({}),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.testKey({}),
      ).rejects.toThrow('provider and apiKey are required');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Invalid provider
  // -----------------------------------------------------------------------
  describe('input validation — invalid provider', () => {
    it('throws BadRequestException for an unrecognized provider', async () => {
      await expect(
        controller.testKey({ provider: 'nonexistent-provider', apiKey: 'sk-key' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.testKey({ provider: 'nonexistent-provider', apiKey: 'sk-key' }),
      ).rejects.toThrow('Invalid provider: nonexistent-provider');
    });

    it('includes valid provider names in the error message', async () => {
      try {
        await controller.testKey({ provider: 'bad-provider', apiKey: 'sk-key' });
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const message = (err as BadRequestException).message;
        expect(message).toContain('Valid providers:');
      }
    });
  });

  // -----------------------------------------------------------------------
  // 4. Successful synthesis — success:true with latencyMs
  // -----------------------------------------------------------------------
  describe('successful key validation', () => {
    it('returns success:true with latencyMs when adapter.synthesize returns Ok', async () => {
      const result = await controller.testKey({
        provider: 'openai',
        apiKey: 'sk-valid-key',
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe('openai');
      expect(result.latencyMs).toBeDefined();
      expect(typeof result.latencyMs).toBe('number');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('returns success:true for each valid provider with a registered adapter', async () => {
      for (const providerKey of [TTSProvider.OpenAI, TTSProvider.ElevenLabs, TTSProvider.Groq, TTSProvider.Cartesia]) {
        const result = await controller.testKey({
          provider: providerKey,
          apiKey: 'sk-valid-key',
        });

        expect(result.success).toBe(true);
        expect(result.provider).toBe(providerKey);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 5. Failed synthesis — success:false with error
  // -----------------------------------------------------------------------
  describe('failed key validation', () => {
    it('returns success:false with error message when adapter.synthesize returns Err', async () => {
      const openaiAdapter = providers.get(TTSProvider.OpenAI)!;
      const ttsErr: TTSError = {
        code: ErrorCode.ProviderUnavailable,
        message: 'Invalid API key: authentication failed',
      };
      openaiAdapter.synthesize.mockResolvedValueOnce(Err(ttsErr));

      const result = await controller.testKey({
        provider: 'openai',
        apiKey: 'sk-invalid-key',
      });

      expect(result.success).toBe(false);
      expect(result.provider).toBe('openai');
      expect(result.error).toBe('Invalid API key: authentication failed');
      expect(result.latencyMs).toBeDefined();
      expect(typeof result.latencyMs).toBe('number');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Provider not in map — 'Provider not available on this server'
  // -----------------------------------------------------------------------
  describe('provider not available', () => {
    it('returns success:false with provider-not-available error when adapter is not in map', async () => {
      // Remove a provider from the map to simulate it not being configured
      const sparseProviders = new Map<TTSProvider, TTSProviderPort>();
      // Leave the map empty so no provider is available

      const sparseController = new TTSController(
        creditRepo,
        cacheStore,
        subscriptionRepo,
        sparseProviders,
      );

      const result = await sparseController.testKey({
        provider: 'openai',
        apiKey: 'sk-key',
      });

      expect(result.success).toBe(false);
      expect(result.provider).toBe('openai');
      expect(result.error).toBe('Provider not available on this server');
      expect(result.latencyMs).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Passes apiKey as byokApiKey to adapter.synthesize
  // -----------------------------------------------------------------------
  describe('apiKey forwarding', () => {
    it('passes the provided apiKey as byokApiKey to adapter.synthesize', async () => {
      const testApiKey = 'sk-my-secret-key-12345';

      await controller.testKey({
        provider: 'openai',
        apiKey: testApiKey,
      });

      const openaiAdapter = providers.get(TTSProvider.OpenAI)!;
      expect(openaiAdapter.synthesize).toHaveBeenCalledTimes(1);
      expect(openaiAdapter.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          byokApiKey: testApiKey,
        }),
      );
    });

    it('does not leak apiKey into other synthesize params', async () => {
      await controller.testKey({
        provider: 'elevenlabs',
        apiKey: 'sk-el-key',
      });

      const elevenLabsAdapter = providers.get(TTSProvider.ElevenLabs)!;
      const callArgs = elevenLabsAdapter.synthesize.mock.calls[0][0];

      // Verify no extra properties beyond text and byokApiKey
      expect(callArgs).toEqual({
        text: 'a',
        byokApiKey: 'sk-el-key',
      });
    });
  });

  // -----------------------------------------------------------------------
  // 8. Uses minimal text 'a' for the test synthesis call
  // -----------------------------------------------------------------------
  describe('minimal text usage', () => {
    it('sends text "a" to adapter.synthesize for minimal cost', async () => {
      await controller.testKey({
        provider: 'openai',
        apiKey: 'sk-key',
      });

      const openaiAdapter = providers.get(TTSProvider.OpenAI)!;
      expect(openaiAdapter.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'a',
        }),
      );
    });

    it('always uses text "a" regardless of provider', async () => {
      for (const providerKey of [TTSProvider.OpenAI, TTSProvider.ElevenLabs, TTSProvider.Groq, TTSProvider.Cartesia]) {
        const adapter = providers.get(providerKey)!;

        await controller.testKey({
          provider: providerKey,
          apiKey: 'sk-key',
        });

        const callArgs = adapter.synthesize.mock.calls[0][0];
        expect(callArgs.text).toBe('a');
      }
    });
  });
});
