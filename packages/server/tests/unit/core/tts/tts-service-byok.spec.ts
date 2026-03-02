/**
 * BYOK (Bring Your Own Key) path tests for TTSService.synthesize()
 *
 * When a request includes byokApiKey, the service:
 * - Skips credit deduction entirely (user pays provider directly)
 * - Uses the requested provider directly (no tier-based routing via selectProvider)
 * - Passes byokApiKey through to the provider adapter
 * - Still applies caching (INV-006: cached content never re-charges)
 * - Does not use a fallback chain (BYOK key is provider-specific)
 *
 * @module tests/unit/core/tts/tts-service-byok
 */

import {
  TTSProvider,
  SubscriptionTier,
  ErrorCode,
  Ok,
  Err,
  isOk,
  isErr,
} from '@proso/shared';
import {
  synthesize,
  type TTSServiceDeps,
  type TTSRequest,
} from '../../../../src/core/tts/tts.service';
import type {
  CreditRepositoryPort,
  CreditAllocationRecord,
  CreditTransactionRecord,
} from '../../../../src/ports/credit-repository.port';
import type { CacheStorePort } from '../../../../src/ports/cache-store.port';
import type {
  TTSProviderPort,
} from '../../../../src/ports/tts-provider.port';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockAllocation(
  overrides: Partial<CreditAllocationRecord> = {},
): CreditAllocationRecord {
  return {
    id: 'alloc-1',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    totalCredits: 500_000,
    remainingCredits: 350_000,
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-03-01'),
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeMockTransaction(
  overrides: Partial<CreditTransactionRecord> = {},
): CreditTransactionRecord {
  return {
    id: 'tx-1',
    userId: 'user-1',
    allocationId: 'alloc-1',
    type: 'deduction',
    amount: 1000,
    provider: 'openai',
    characterCount: 100,
    description: 'TTS synthesis via openai',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockCacheStore(): jest.Mocked<CacheStorePort> {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    has: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CacheStorePort>;
}

function makeMockCreditRepository(): jest.Mocked<CreditRepositoryPort> {
  return {
    findCurrentAllocation: jest.fn(),
    deductCredits: jest.fn(),
    getAllocationHistory: jest.fn(),
    createAllocation: jest.fn(),
  } as unknown as jest.Mocked<CreditRepositoryPort>;
}

function createMockTTSProvider(
  providerId: TTSProvider,
  overrides: Partial<{
    synthesize: jest.Mock;
    getVoices: jest.Mock;
    supportedLanguages: string[];
  }> = {},
): jest.Mocked<TTSProviderPort> {
  return {
    providerId,
    supportedLanguages: overrides.supportedLanguages ?? ['en'],
    synthesize:
      overrides.synthesize ??
      jest.fn().mockResolvedValue(
        Ok({
          audio: Buffer.from('byok-audio-data'),
          contentType: 'audio/mpeg',
          provider: providerId,
        }),
      ),
    getVoices:
      overrides.getVoices ?? jest.fn().mockResolvedValue(Ok([])),
  } as unknown as jest.Mocked<TTSProviderPort>;
}

function makeDefaultDeps(overrides: Partial<TTSServiceDeps> = {}): TTSServiceDeps {
  const cacheStore = makeMockCacheStore();
  const creditRepository = makeMockCreditRepository();
  const providers = new Map<TTSProvider, TTSProviderPort>();

  // Register server-side providers (no Browser since it is client-side only)
  providers.set(TTSProvider.OpenAI, createMockTTSProvider(TTSProvider.OpenAI));
  providers.set(TTSProvider.ElevenLabs, createMockTTSProvider(TTSProvider.ElevenLabs));
  providers.set(TTSProvider.Groq, createMockTTSProvider(TTSProvider.Groq));
  providers.set(TTSProvider.Cartesia, createMockTTSProvider(TTSProvider.Cartesia));

  return {
    cacheStore,
    creditRepository,
    providers,
    ...overrides,
  };
}

function makeByokRequest(overrides: Partial<TTSRequest> = {}): TTSRequest {
  return {
    userId: 'byok-user',
    text: 'Hello, this is a BYOK test sentence.',
    tier: SubscriptionTier.Free,
    byokApiKey: 'user-provided-api-key-123',
    provider: TTSProvider.OpenAI,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TTSService.synthesize — BYOK path', () => {
  let deps: TTSServiceDeps;

  beforeEach(() => {
    deps = makeDefaultDeps();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1. BYOK skips credit deduction
  // -----------------------------------------------------------------------
  describe('Credit deduction bypass', () => {
    it('does not call deductCredits when byokApiKey is provided', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;

      const request = makeByokRequest();
      await synthesize(request, deps);

      expect(repo.deductCredits).not.toHaveBeenCalled();
    });

    it('does not call findCurrentAllocation when byokApiKey is provided', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;

      const request = makeByokRequest();
      await synthesize(request, deps);

      expect(repo.findCurrentAllocation).not.toHaveBeenCalled();
    });

    it('returns creditsUsed=0 in the result', async () => {
      const request = makeByokRequest();
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.creditsUsed).toBe(0);
    });

    it('returns creditsRemaining=0 in the result (BYOK has no managed credits)', async () => {
      const request = makeByokRequest();
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.creditsRemaining).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. BYOK uses requested provider directly (no routing)
  // -----------------------------------------------------------------------
  describe('Direct provider usage (no routing)', () => {
    it('calls the requested provider directly instead of selectProvider routing', async () => {
      const openaiProvider = deps.providers.get(TTSProvider.OpenAI) as jest.Mocked<TTSProviderPort>;
      const groqProvider = deps.providers.get(TTSProvider.Groq) as jest.Mocked<TTSProviderPort>;

      // Even though Pro tier would normally route to Groq first,
      // BYOK uses the requested provider directly
      const request = makeByokRequest({
        provider: TTSProvider.OpenAI,
        tier: SubscriptionTier.Pro,
      });
      await synthesize(request, deps);

      expect(openaiProvider.synthesize).toHaveBeenCalled();
      expect(groqProvider.synthesize).not.toHaveBeenCalled();
    });

    it('uses ElevenLabs directly when specified regardless of tier', async () => {
      const elevenlabsProvider = deps.providers.get(TTSProvider.ElevenLabs) as jest.Mocked<TTSProviderPort>;

      const request = makeByokRequest({
        provider: TTSProvider.ElevenLabs,
        tier: SubscriptionTier.Free,
      });
      await synthesize(request, deps);

      expect(elevenlabsProvider.synthesize).toHaveBeenCalled();
    });

    it('uses Cartesia directly when specified with BYOK key', async () => {
      const cartesiaProvider = deps.providers.get(TTSProvider.Cartesia) as jest.Mocked<TTSProviderPort>;

      const request = makeByokRequest({
        provider: TTSProvider.Cartesia,
      });
      await synthesize(request, deps);

      expect(cartesiaProvider.synthesize).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. BYOK passes byokApiKey to the adapter
  // -----------------------------------------------------------------------
  describe('BYOK API key passthrough', () => {
    it('passes byokApiKey to the provider synthesize call', async () => {
      const openaiProvider = deps.providers.get(TTSProvider.OpenAI) as jest.Mocked<TTSProviderPort>;

      const request = makeByokRequest({
        byokApiKey: 'sk-my-secret-openai-key',
        provider: TTSProvider.OpenAI,
      });
      await synthesize(request, deps);

      expect(openaiProvider.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          byokApiKey: 'sk-my-secret-openai-key',
        }),
      );
    });

    it('passes text, voice, and language alongside the byokApiKey', async () => {
      const elevenlabsProvider = deps.providers.get(TTSProvider.ElevenLabs) as jest.Mocked<TTSProviderPort>;

      const request = makeByokRequest({
        provider: TTSProvider.ElevenLabs,
        byokApiKey: 'el-key-abc',
        voice: 'custom-voice',
        language: 'es',
        text: 'Hola, mundo!',
      });
      await synthesize(request, deps);

      expect(elevenlabsProvider.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hola, mundo!',
          voice: 'custom-voice',
          language: 'es',
          byokApiKey: 'el-key-abc',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 4. BYOK request without a provider specified returns error
  // -----------------------------------------------------------------------
  describe('BYOK without provider', () => {
    it('returns ProviderUnavailable error when no provider is specified', async () => {
      const request = makeByokRequest({
        provider: undefined,
      });
      const result = await synthesize(request, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('BYOK');
    });
  });

  // -----------------------------------------------------------------------
  // 5. BYOK request with Browser provider returns error
  // -----------------------------------------------------------------------
  describe('BYOK with Browser provider', () => {
    it('returns ProviderUnavailable error when Browser provider is specified', async () => {
      const request = makeByokRequest({
        provider: TTSProvider.Browser,
      });
      const result = await synthesize(request, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('BYOK');
      expect(result.error.message).toContain('non-browser');
    });
  });

  // -----------------------------------------------------------------------
  // 6. BYOK cache hit returns cached audio (INV-006)
  // -----------------------------------------------------------------------
  describe('BYOK cache hit (INV-006)', () => {
    it('returns cached audio with cacheHit=true and creditsUsed=0', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const cachedAudio = Buffer.from('byok-cached-audio');
      cacheStore.get.mockResolvedValue(cachedAudio);

      const request = makeByokRequest();
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.cacheHit).toBe(true);
      expect(result.value.creditsUsed).toBe(0);
      expect(result.value.audio).toBe(cachedAudio);
      expect(result.value.contentType).toBe('audio/mpeg');
    });

    it('does not call any provider when cache hits', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      cacheStore.get.mockResolvedValue(Buffer.from('cached'));

      const request = makeByokRequest({ provider: TTSProvider.OpenAI });
      await synthesize(request, deps);

      const openaiProvider = deps.providers.get(TTSProvider.OpenAI) as jest.Mocked<TTSProviderPort>;
      expect(openaiProvider.synthesize).not.toHaveBeenCalled();
    });

    it('does not call credit repository when cache hits', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      cacheStore.get.mockResolvedValue(Buffer.from('cached'));

      const request = makeByokRequest();
      await synthesize(request, deps);

      expect(repo.findCurrentAllocation).not.toHaveBeenCalled();
      expect(repo.deductCredits).not.toHaveBeenCalled();
    });

    it('returns the correct provider in cached response', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      cacheStore.get.mockResolvedValue(Buffer.from('cached'));

      const request = makeByokRequest({ provider: TTSProvider.ElevenLabs });
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.provider).toBe(TTSProvider.ElevenLabs);
    });
  });

  // -----------------------------------------------------------------------
  // 7. BYOK cache miss calls provider and stores result in cache
  // -----------------------------------------------------------------------
  describe('BYOK cache miss — synthesis and cache storage', () => {
    it('calls provider.synthesize on cache miss', async () => {
      const openaiProvider = deps.providers.get(TTSProvider.OpenAI) as jest.Mocked<TTSProviderPort>;

      const request = makeByokRequest({ provider: TTSProvider.OpenAI });
      await synthesize(request, deps);

      expect(openaiProvider.synthesize).toHaveBeenCalledTimes(1);
    });

    it('stores synthesized audio in cache after successful synthesis', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;

      const request = makeByokRequest({ provider: TTSProvider.OpenAI });
      await synthesize(request, deps);

      expect(cacheStore.set).toHaveBeenCalledTimes(1);
      const [, audioArg] = cacheStore.set.mock.calls[0];
      expect(audioArg).toEqual(Buffer.from('byok-audio-data'));
    });

    it('returns cacheHit=false on cache miss', async () => {
      const request = makeByokRequest({ provider: TTSProvider.OpenAI });
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.cacheHit).toBe(false);
    });

    it('returns the correct provider and audio in the result', async () => {
      const request = makeByokRequest({ provider: TTSProvider.OpenAI });
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.provider).toBe(TTSProvider.OpenAI);
      expect(result.value.audio).toEqual(Buffer.from('byok-audio-data'));
      expect(result.value.contentType).toBe('audio/mpeg');
    });
  });

  // -----------------------------------------------------------------------
  // 8. BYOK failure returns provider error (no fallback chain)
  // -----------------------------------------------------------------------
  describe('BYOK provider failure — no fallback', () => {
    it('returns the provider error directly without attempting fallback providers', async () => {
      // Make OpenAI fail
      const failingProvider = createMockTTSProvider(TTSProvider.OpenAI, {
        synthesize: jest.fn().mockResolvedValue(
          Err({
            code: ErrorCode.ProviderUnavailable,
            message: 'OpenAI BYOK key rejected',
          }),
        ),
      });
      deps.providers.set(TTSProvider.OpenAI, failingProvider);

      const request = makeByokRequest({ provider: TTSProvider.OpenAI });
      const result = await synthesize(request, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('OpenAI BYOK key rejected');
    });

    it('does not attempt other providers when BYOK provider fails', async () => {
      const failingProvider = createMockTTSProvider(TTSProvider.OpenAI, {
        synthesize: jest.fn().mockResolvedValue(
          Err({
            code: ErrorCode.ProviderUnavailable,
            message: 'OpenAI is down',
          }),
        ),
      });
      deps.providers.set(TTSProvider.OpenAI, failingProvider);

      const groqProvider = deps.providers.get(TTSProvider.Groq) as jest.Mocked<TTSProviderPort>;
      const elevenlabsProvider = deps.providers.get(TTSProvider.ElevenLabs) as jest.Mocked<TTSProviderPort>;

      const request = makeByokRequest({ provider: TTSProvider.OpenAI });
      await synthesize(request, deps);

      // Other providers should NOT have been called as fallback
      expect(groqProvider.synthesize).not.toHaveBeenCalled();
      expect(elevenlabsProvider.synthesize).not.toHaveBeenCalled();
    });

    it('does not store anything in cache when provider fails', async () => {
      const failingProvider = createMockTTSProvider(TTSProvider.OpenAI, {
        synthesize: jest.fn().mockResolvedValue(
          Err({
            code: ErrorCode.ProviderUnavailable,
            message: 'Provider error',
          }),
        ),
      });
      deps.providers.set(TTSProvider.OpenAI, failingProvider);

      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;

      const request = makeByokRequest({ provider: TTSProvider.OpenAI });
      await synthesize(request, deps);

      expect(cacheStore.set).not.toHaveBeenCalled();
    });

    it('returns ProviderUnavailable when the requested provider adapter is not registered', async () => {
      // Remove Cartesia from providers map
      deps.providers.delete(TTSProvider.Cartesia);

      const request = makeByokRequest({ provider: TTSProvider.Cartesia });
      const result = await synthesize(request, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('not registered');
    });
  });
});
