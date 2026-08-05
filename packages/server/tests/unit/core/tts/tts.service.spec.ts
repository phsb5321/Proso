import {
  Err,
  ErrorCode,
  Ok,
  SubscriptionTier,
  TTSProvider,
  calculateCreditCost,
  isErr,
  isOk,
} from '@proso/shared';
import {
  type TTSRequest,
  type TTSServiceDeps,
  synthesize,
} from '../../../../src/core/tts/tts.service';
import type { CacheStorePort } from '../../../../src/ports/cache-store.port';
import type {
  CreditAllocationRecord,
  CreditDeductionRecord,
  CreditRepositoryPort,
  CreditTransactionRecord,
} from '../../../../src/ports/credit-repository.port';
import type { LoggerPort } from '../../../../src/ports/logger.port';
import type { TTSProviderPort } from '../../../../src/ports/tts-provider.port';

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
  overrides: Partial<CreditDeductionRecord> = {},
): CreditDeductionRecord {
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
    remainingCredits: 349_000,
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

function makeMockLogger(): jest.Mocked<LoggerPort> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
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
          audio: Buffer.from('audio-data'),
          contentType: 'audio/mpeg',
          provider: providerId,
        }),
      ),
    getVoices: overrides.getVoices ?? jest.fn().mockResolvedValue(Ok([])),
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

  return {
    cacheStore,
    creditRepository,
    logger: makeMockLogger(),
    providers,
    ...overrides,
  };
}

function makeDefaultRequest(overrides: Partial<TTSRequest> = {}): TTSRequest {
  return {
    userId: 'user-1',
    text: 'Hello, this is a test sentence for TTS synthesis.',
    tier: SubscriptionTier.Pro,
    ...overrides,
  };
}

/**
 * Set up credit repository mocks for the standard success flow:
 * allocation exists, deduction succeeds, updated allocation returned.
 */
function setupSuccessFlow(
  deps: TTSServiceDeps,
  allocationOverrides: Partial<CreditAllocationRecord> = {},
): { allocation: CreditAllocationRecord; transaction: CreditDeductionRecord } {
  const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
  const allocation = makeMockAllocation(allocationOverrides);
  const transaction = makeMockTransaction();

  repo.findCurrentAllocation.mockResolvedValue(allocation);
  repo.deductCredits.mockResolvedValue(transaction);

  return { allocation, transaction };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TTSService.synthesize', () => {
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
  // 1. Cache hit (INV-006)
  // -----------------------------------------------------------------------
  describe('Cache hit (INV-006: cached content never re-charges)', () => {
    it('returns TTSResult with cacheHit=true and creditsUsed=0 when cache has the audio', async () => {
      const cachedAudio = Buffer.from('cached-audio-data');
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;

      cacheStore.get.mockResolvedValue(cachedAudio);
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());

      const request = makeDefaultRequest({ provider: TTSProvider.OpenAI });
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.cacheHit).toBe(true);
      expect(result.value.creditsUsed).toBe(0);
      expect(result.value.audio).toBe(cachedAudio);
      expect(result.value.contentType).toBe('audio/mpeg');
    });

    it('does not call any TTS provider when cache hits', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;

      cacheStore.get.mockResolvedValue(Buffer.from('cached'));
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());

      const request = makeDefaultRequest({ provider: TTSProvider.OpenAI });
      await synthesize(request, deps);

      const openaiProvider = deps.providers.get(TTSProvider.OpenAI) as jest.Mocked<TTSProviderPort>;
      expect(openaiProvider.synthesize).not.toHaveBeenCalled();
    });

    it('does not deduct credits when cache hits', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;

      cacheStore.get.mockResolvedValue(Buffer.from('cached'));
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());

      const request = makeDefaultRequest({ provider: TTSProvider.OpenAI });
      await synthesize(request, deps);

      expect(repo.deductCredits).not.toHaveBeenCalled();
    });

    it('returns creditsRemaining from the current allocation on cache hit', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;

      cacheStore.get.mockResolvedValue(Buffer.from('cached'));
      repo.findCurrentAllocation.mockResolvedValue(
        makeMockAllocation({ remainingCredits: 42_000 }),
      );

      const request = makeDefaultRequest({ provider: TTSProvider.OpenAI });
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.creditsRemaining).toBe(42_000);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Cache miss - full flow
  // -----------------------------------------------------------------------
  describe('Cache miss - full synthesis flow', () => {
    it('returns TTSResult with cacheHit=false and correct creditsUsed on cache miss', async () => {
      setupSuccessFlow(deps);
      const request = makeDefaultRequest({ provider: TTSProvider.OpenAI });
      const expectedCost = calculateCreditCost(request.text.length, TTSProvider.OpenAI);

      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;

      expect(result.value.cacheHit).toBe(false);
      expect(result.value.creditsUsed).toBe(expectedCost);
      expect(result.value.audio).toEqual(Buffer.from('audio-data'));
      expect(result.value.contentType).toBe('audio/mpeg');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Cache miss - stores result in cache
  // -----------------------------------------------------------------------
  describe('Cache miss - stores result in cache', () => {
    it('calls cacheStore.set with the synthesized audio after successful synthesis', async () => {
      setupSuccessFlow(deps);
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;

      const request = makeDefaultRequest({ provider: TTSProvider.OpenAI });
      await synthesize(request, deps);

      expect(cacheStore.set).toHaveBeenCalledTimes(1);
      // Verify the audio buffer was passed to cache
      const [, audioArg] = cacheStore.set.mock.calls[0];
      expect(audioArg).toEqual(Buffer.from('audio-data'));
    });

    it('returns paid audio and reports telemetry when the cache write rejects', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      const logger = deps.logger as jest.Mocked<LoggerPort>;
      const paidAudio = Buffer.from('paid-audio');
      cacheStore.set.mockRejectedValue(new Error('cache unavailable'));
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(makeMockTransaction({ remainingCredits: 349_975 }));
      const provider = createMockTTSProvider(TTSProvider.OpenAI, {
        synthesize: jest.fn().mockResolvedValue(
          Ok({
            audio: paidAudio,
            contentType: 'audio/mpeg',
            provider: TTSProvider.OpenAI,
          }),
        ),
      });
      deps.providers.set(TTSProvider.OpenAI, provider);

      const result = await synthesize(
        makeDefaultRequest({
          provider: TTSProvider.OpenAI,
          tier: SubscriptionTier.Pro,
        }),
        deps,
      );

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.audio).toEqual(paidAudio);
      expect(result.value.creditsRemaining).toBe(349_975);
      expect(provider.synthesize).toHaveBeenCalledTimes(1);
      expect(repo.deductCredits).toHaveBeenCalledTimes(1);
      expect(cacheStore.set).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'TTS audio cache write failed after successful synthesis',
        expect.objectContaining({ error: 'cache unavailable' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 4. Insufficient credits
  // -----------------------------------------------------------------------
  describe('Insufficient credits', () => {
    it('returns CreditError with InsufficientCredits when user lacks credits', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation({ remainingCredits: 1 }));

      const request = makeDefaultRequest({
        provider: TTSProvider.OpenAI,
        text: 'A'.repeat(5000), // large text to ensure cost exceeds 1 credit
      });
      const result = await synthesize(request, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.InsufficientCredits);
      for (const provider of deps.providers.values()) {
        expect(provider.synthesize).not.toHaveBeenCalled();
      }
    });
  });

  // -----------------------------------------------------------------------
  // 5. No allocation
  // -----------------------------------------------------------------------
  describe('No active allocation', () => {
    it('returns CreditError with NoActiveAllocation when no allocation exists', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(null);

      const request = makeDefaultRequest({ provider: TTSProvider.OpenAI });
      const result = await synthesize(request, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.NoActiveAllocation);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Provider synthesis failure with fallback
  // -----------------------------------------------------------------------
  describe('Provider failure with fallback', () => {
    it('falls back to next provider when primary provider fails', async () => {
      setupSuccessFlow(deps);

      // Make primary (Groq for Pro tier) fail
      const groqProvider = createMockTTSProvider(TTSProvider.Groq, {
        synthesize: jest.fn().mockResolvedValue(
          Err({
            code: ErrorCode.ProviderUnavailable,
            message: 'Groq is down',
          }),
        ),
      });
      deps.providers.set(TTSProvider.Groq, groqProvider);

      // OpenAI (fallback) should succeed
      const openaiProvider = createMockTTSProvider(TTSProvider.OpenAI);
      deps.providers.set(TTSProvider.OpenAI, openaiProvider);

      const request = makeDefaultRequest({ tier: SubscriptionTier.Pro });
      // Pro tier default order: Groq > OpenAI > ElevenLabs
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      // The audio should come from the fallback provider
      expect(result.value.audio).toEqual(Buffer.from('audio-data'));
    });

    it('does not call a fallback whose real price exceeds the available balance', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation({ remainingCredits: 500 }));
      deps.providers.delete(TTSProvider.OpenAI);
      const groqProvider = createMockTTSProvider(TTSProvider.Groq, {
        synthesize: jest.fn().mockResolvedValue(
          Err({
            code: ErrorCode.ProviderUnavailable,
            message: 'Groq is down',
          }),
        ),
      });
      const elevenLabsProvider = createMockTTSProvider(TTSProvider.ElevenLabs);
      deps.providers.set(TTSProvider.Groq, groqProvider);
      deps.providers.set(TTSProvider.ElevenLabs, elevenLabsProvider);

      const result = await synthesize(
        makeDefaultRequest({
          text: 'A'.repeat(1000),
          tier: SubscriptionTier.Pro,
        }),
        deps,
      );

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.InsufficientCredits);
      expect(groqProvider.synthesize).toHaveBeenCalledTimes(1);
      expect(elevenLabsProvider.synthesize).not.toHaveBeenCalled();
      expect(repo.deductCredits).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 7. All providers fail
  // -----------------------------------------------------------------------
  describe('All providers fail', () => {
    it('returns TTSError with AllProvidersUnavailable when every provider fails', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      let remainingCredits = 350_000;
      const ledger: CreditTransactionRecord[] = [];
      repo.findCurrentAllocation.mockImplementation(async () =>
        makeMockAllocation({ remainingCredits }),
      );
      repo.deductCredits.mockImplementation(async (_allocationId, amount) => {
        remainingCredits -= amount;
        const transaction = makeMockTransaction({ amount: -amount });
        ledger.push(transaction);
        return transaction;
      });

      const failingSynthesize = jest.fn().mockResolvedValue(
        Err({
          code: ErrorCode.ProviderUnavailable,
          message: 'Provider is down',
        }),
      );

      // Make all providers fail
      for (const providerId of [TTSProvider.Groq, TTSProvider.OpenAI, TTSProvider.ElevenLabs]) {
        deps.providers.set(
          providerId,
          createMockTTSProvider(providerId, { synthesize: failingSynthesize }),
        );
      }

      const request = makeDefaultRequest({ tier: SubscriptionTier.Pro });
      const result = await synthesize(request, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.AllProvidersUnavailable);
      expect(repo.deductCredits).not.toHaveBeenCalled();
      expect(remainingCredits).toBe(350_000);
      expect(ledger).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Managed TTS is tier-gated (FEATURE_MATRIX.managedTts)
  // -----------------------------------------------------------------------
  describe('Managed TTS is gated on FEATURE_MATRIX.managedTts', () => {
    // Regression lock. This path previously succeeded with creditsUsed=0:
    // the credit preflight and deduction were both wrapped in
    // `if (tier !== Free)`, which metered nobody on Free tier rather than
    // charging nobody — so anonymous callers spent the server's provider
    // keys, unbounded and unrecorded.
    it('rejects a Free tier managed request instead of spending server keys', async () => {
      setupSuccessFlow(deps);

      const request = makeDefaultRequest({ tier: SubscriptionTier.Free });
      const result = await synthesize(request, deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.InsufficientCredits);
      expect(result.error.message).toBe(
        'Managed TTS is not included in this tier. Add a provider API key in settings, or use a plan that includes managed TTS.',
      );
      expect(result.error.message).not.toMatch(/browser TTS|upgrade to Pro/i);
    });

    it('does not reach any provider adapter on a Free tier managed request', async () => {
      setupSuccessFlow(deps);

      await synthesize(makeDefaultRequest({ tier: SubscriptionTier.Free }), deps);

      for (const provider of deps.providers.values()) {
        expect((provider as jest.Mocked<TTSProviderPort>).synthesize).not.toHaveBeenCalled();
      }
    });

    it('still allows Free tier BYOK — the gate sits after the BYOK branch (INV-002)', async () => {
      const request = makeDefaultRequest({
        tier: SubscriptionTier.Free,
        provider: TTSProvider.OpenAI,
        byokApiKey: 'sk-user-supplied-key',
      });
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.creditsUsed).toBe(0);
    });

    it('meters a Pro tier managed request, which the gate lets through', async () => {
      setupSuccessFlow(deps);
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;

      const result = await synthesize(makeDefaultRequest({ tier: SubscriptionTier.Pro }), deps);

      expect(isOk(result)).toBe(true);
      expect(repo.deductCredits).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 9. Provider not registered
  // -----------------------------------------------------------------------
  describe('Provider not registered', () => {
    it('returns TTSError with ProviderUnavailable when the resolved provider is not in the map', async () => {
      setupSuccessFlow(deps);

      // Remove the provider that would be selected
      // For Pro tier with preferred=OpenAI, remove OpenAI from the map
      deps.providers.delete(TTSProvider.OpenAI);

      // Also remove fallback providers to ensure ProviderUnavailable is hit
      // Create a deps with only one provider that does not match the preferred
      const limitedProviders = new Map<TTSProvider, TTSProviderPort>();
      const limitedDeps: TTSServiceDeps = {
        ...deps,
        providers: limitedProviders,
      };

      const repo = limitedDeps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(makeMockTransaction());

      // Preferred provider is OpenAI but it is not registered
      // With empty providers map, selectProvider will fall back to Browser
      // which returns the Browser TTS error (INV-005).
      // To test ProviderUnavailable specifically, we need the provider in
      // availableProviders (map keys) but then it would be found.
      // Instead, set up a scenario where a provider is routed but not in the map.
      // This happens when preferred provider is given but selectProvider sees it
      // in the available list, then the adapter lookup fails.
      // We need the key in the map (for routing) but no actual adapter.

      // Better approach: use a provider that will be the primary, but manually
      // remove it from the map AFTER routing would see it.
      // Actually the implementation checks deps.providers.get(resolvedProvider)
      // after routing. If we put the key in the map for routing but then it
      // gets removed... That is racy. Let's test the real error path:
      // When no providers are available, Free tier is chosen (Browser), giving INV-005.
      // The ProviderUnavailable path is actually unreachable in normal flow because
      // availableProviders = Array.from(deps.providers.keys()), so the adapter
      // should always exist. Let's verify that the error branch works by
      // manipulating the map between the routing and adapter lookup via a Proxy.

      // Simplest approach: mock providers.keys() to include OpenAI, but
      // providers.get(OpenAI) returns undefined
      const trickProviders = new Map<TTSProvider, TTSProviderPort>();
      trickProviders.set(TTSProvider.Groq, createMockTTSProvider(TTSProvider.Groq));

      // Override the keys method to also include OpenAI
      // We need Array.from(providers.keys()) to include OpenAI, but providers.get(OpenAI) returns undefined
      const realKeys = [...trickProviders.keys()];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trickProviders as any).keys = () => [...realKeys, TTSProvider.OpenAI].values();

      const trickDeps: TTSServiceDeps = {
        cacheStore: deps.cacheStore,
        creditRepository: deps.creditRepository,
        providers: trickProviders,
      };

      const trickRepo = trickDeps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      trickRepo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      trickRepo.deductCredits.mockResolvedValue(makeMockTransaction());

      const request = makeDefaultRequest({
        provider: TTSProvider.OpenAI,
        tier: SubscriptionTier.Pro,
      });
      const result = await synthesize(request, trickDeps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.ProviderUnavailable);
      expect(result.error.message).toContain('not registered');
    });
  });

  // -----------------------------------------------------------------------
  // 10. Credit preflight and conditional commit
  // -----------------------------------------------------------------------
  describe('Credit preflight and conditional commit', () => {
    it('checks balance before synthesis and commits the debit only after success', async () => {
      const callOrder: string[] = [];

      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockImplementation(async () => {
        callOrder.push('checkCredits');
        return makeMockAllocation();
      });
      repo.deductCredits.mockImplementation(async () => {
        callOrder.push('deductCredits');
        return makeMockTransaction();
      });

      const groqProvider = createMockTTSProvider(TTSProvider.Groq, {
        synthesize: jest.fn().mockImplementation(async () => {
          callOrder.push('synthesize');
          return Ok({
            audio: Buffer.from('audio'),
            contentType: 'audio/mpeg',
            provider: TTSProvider.Groq,
          });
        }),
      });
      deps.providers.set(TTSProvider.Groq, groqProvider);

      const request = makeDefaultRequest({ tier: SubscriptionTier.Pro });
      await synthesize(request, deps);

      expect(callOrder.indexOf('checkCredits')).toBeLessThan(callOrder.indexOf('synthesize'));
      expect(callOrder.indexOf('synthesize')).toBeLessThan(callOrder.indexOf('deductCredits'));
    });

    it('returns a credit error without caching when the conditional commit loses a race', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(null);

      const result = await synthesize(makeDefaultRequest(), deps);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.InsufficientCredits);
      expect(cacheStore.set).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 11. Correct credit cost calculated
  // -----------------------------------------------------------------------
  describe('Correct credit cost calculation', () => {
    it('passes the correct amount from calculateCreditCost to deductCredits', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(makeMockTransaction());

      const text = 'Hello, world! This is a credit cost test.';
      const request = makeDefaultRequest({
        text,
        provider: TTSProvider.OpenAI,
        tier: SubscriptionTier.Pro,
      });

      await synthesize(request, deps);

      const expectedCost = calculateCreditCost(text.length, TTSProvider.OpenAI);
      expect(repo.deductCredits).toHaveBeenCalledWith(
        'alloc-1',
        expectedCost,
        expect.objectContaining({
          provider: TTSProvider.OpenAI,
          characterCount: text.length,
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // 12. creditsRemaining in response
  // -----------------------------------------------------------------------
  describe('creditsRemaining in response', () => {
    it('returns the atomic debit balance without a fallible post-debit allocation read', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;

      const originalAllocation = makeMockAllocation({ remainingCredits: 100_000 });
      repo.findCurrentAllocation
        .mockResolvedValueOnce(originalAllocation)
        .mockResolvedValueOnce(originalAllocation)
        .mockRejectedValue(new Error('post-debit metadata read must not run'));
      repo.deductCredits.mockResolvedValue(makeMockTransaction({ remainingCredits: 99_000 }));

      const request = makeDefaultRequest({
        provider: TTSProvider.OpenAI,
        tier: SubscriptionTier.Pro,
      });
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.creditsRemaining).toBe(99_000);
      expect(repo.findCurrentAllocation).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // 13. Preferred provider used
  // -----------------------------------------------------------------------
  describe('Preferred provider used', () => {
    it('uses the requested provider when request.provider is set', async () => {
      setupSuccessFlow(deps);

      const elevenlabsProvider = deps.providers.get(
        TTSProvider.ElevenLabs,
      ) as jest.Mocked<TTSProviderPort>;

      const request = makeDefaultRequest({
        provider: TTSProvider.ElevenLabs,
        tier: SubscriptionTier.Pro,
      });
      await synthesize(request, deps);

      expect(elevenlabsProvider.synthesize).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 14. Enterprise tier uses ElevenLabs first
  // -----------------------------------------------------------------------
  describe('Enterprise tier provider selection', () => {
    it('selects ElevenLabs as primary when Enterprise tier and no preferred provider', async () => {
      setupSuccessFlow(deps);

      const elevenlabsProvider = deps.providers.get(
        TTSProvider.ElevenLabs,
      ) as jest.Mocked<TTSProviderPort>;

      const request = makeDefaultRequest({
        tier: SubscriptionTier.Enterprise,
        // no provider preference
      });
      await synthesize(request, deps);

      // Enterprise order: ElevenLabs > OpenAI > Groq
      expect(elevenlabsProvider.synthesize).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 15. Pro tier uses Groq first
  // -----------------------------------------------------------------------
  describe('Pro tier provider selection', () => {
    it('selects Groq as primary when Pro tier and no preferred provider', async () => {
      setupSuccessFlow(deps);

      const groqProvider = deps.providers.get(TTSProvider.Groq) as jest.Mocked<TTSProviderPort>;

      const request = makeDefaultRequest({
        tier: SubscriptionTier.Pro,
        // no provider preference
      });
      await synthesize(request, deps);

      // Pro order: Groq > OpenAI > ElevenLabs
      expect(groqProvider.synthesize).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 16. Provider field in response matches the actual synthesizing provider
  // -----------------------------------------------------------------------
  describe('Provider field in response', () => {
    it('returns the correct provider in the TTSResult', async () => {
      setupSuccessFlow(deps);

      const request = makeDefaultRequest({
        provider: TTSProvider.ElevenLabs,
        tier: SubscriptionTier.Enterprise,
      });
      const result = await synthesize(request, deps);

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      expect(result.value.provider).toBe(TTSProvider.ElevenLabs);
    });

    it('stores and replays fallback audio under the actual provider key', async () => {
      const cacheEntries = new Map<string, Buffer>();
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      cacheStore.get.mockImplementation(async (key) => cacheEntries.get(key) ?? null);
      cacheStore.set.mockImplementation(async (key, audio) => {
        cacheEntries.set(key, audio);
      });
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(makeMockTransaction());
      deps.providers.delete(TTSProvider.ElevenLabs);
      const groqProvider = createMockTTSProvider(TTSProvider.Groq, {
        synthesize: jest.fn().mockResolvedValue(
          Err({
            code: ErrorCode.ProviderUnavailable,
            message: 'Groq is down',
          }),
        ),
      });
      const openAiProvider = createMockTTSProvider(TTSProvider.OpenAI);
      deps.providers.set(TTSProvider.Groq, groqProvider);
      deps.providers.set(TTSProvider.OpenAI, openAiProvider);
      const request = makeDefaultRequest({ tier: SubscriptionTier.Pro });

      const first = await synthesize(request, deps);

      expect(isOk(first)).toBe(true);
      if (!isOk(first)) return;
      expect(first.value.provider).toBe(TTSProvider.OpenAI);
      expect(first.value.cacheHit).toBe(false);
      const [storedKey] = cacheStore.set.mock.calls[0];
      expect(storedKey).toContain(`tts:${TTSProvider.OpenAI}:`);
      expect(storedKey).not.toContain(`tts:${TTSProvider.Groq}:`);
      expect(repo.deductCredits).toHaveBeenCalledWith(
        'alloc-1',
        calculateCreditCost(request.text.length, TTSProvider.OpenAI),
        expect.objectContaining({ provider: TTSProvider.OpenAI }),
      );

      const second = await synthesize(request, deps);

      expect(isOk(second)).toBe(true);
      if (!isOk(second)) return;
      expect(second.value).toMatchObject({
        provider: TTSProvider.OpenAI,
        cacheHit: true,
        creditsUsed: 0,
      });
      expect(groqProvider.synthesize).toHaveBeenCalledTimes(1);
      expect(openAiProvider.synthesize).toHaveBeenCalledTimes(1);
      expect(repo.deductCredits).toHaveBeenCalledTimes(1);
    });

    it('rejects mismatched adapter provider metadata before debit or cache', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      deps.providers.clear();
      deps.providers.set(
        TTSProvider.OpenAI,
        createMockTTSProvider(TTSProvider.OpenAI, {
          synthesize: jest.fn().mockResolvedValue(
            Ok({
              audio: Buffer.from('audio-data'),
              contentType: 'audio/mpeg',
              provider: TTSProvider.Browser,
            }),
          ),
        }),
      );

      const result = await synthesize(
        makeDefaultRequest({
          provider: TTSProvider.OpenAI,
          tier: SubscriptionTier.Pro,
        }),
        deps,
      );

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.code).toBe(ErrorCode.AllProvidersUnavailable);
      expect(result.error.details?.lastError).toContain('mismatched provider metadata');
      expect(repo.deductCredits).not.toHaveBeenCalled();
      expect(cacheStore.set).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 17. Cache key includes voice and language
  // -----------------------------------------------------------------------
  describe('Cache key determinism', () => {
    it('queries the cache store with a key derived from provider, voice, language, and text', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(makeMockTransaction());

      const request = makeDefaultRequest({
        provider: TTSProvider.OpenAI,
        voice: 'alloy',
        language: 'en',
        tier: SubscriptionTier.Pro,
      });
      await synthesize(request, deps);

      // Verify cache was checked with a key containing provider, voice, language
      expect(cacheStore.get).toHaveBeenCalledTimes(3);
      const cacheKey = cacheStore.get.mock.calls[0][0] as string;
      expect(cacheKey).toContain('openai');
      expect(cacheKey).toContain('alloy');
      expect(cacheKey).toContain('en');
    });

    it('generates different cache keys for different text inputs', async () => {
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(makeMockTransaction());

      const request1 = makeDefaultRequest({
        text: 'First text',
        provider: TTSProvider.OpenAI,
        tier: SubscriptionTier.Pro,
      });
      await synthesize(request1, deps);

      const request2 = makeDefaultRequest({
        text: 'Second text',
        provider: TTSProvider.OpenAI,
        tier: SubscriptionTier.Pro,
      });
      await synthesize(request2, deps);

      const key1 = cacheStore.get.mock.calls[0][0] as string;
      const key2 = cacheStore.get.mock.calls[1][0] as string;
      expect(key1).not.toBe(key2);
    });
  });

  // -----------------------------------------------------------------------
  // 18. Fallback skips Browser provider (INV-005)
  // -----------------------------------------------------------------------
  describe('Fallback chain skips Browser provider', () => {
    it('does not attempt Browser provider in fallback even if listed', async () => {
      setupSuccessFlow(deps);

      // Add Browser to the providers map (should be skipped during fallback)
      const browserProvider = createMockTTSProvider(TTSProvider.Browser);
      deps.providers.set(TTSProvider.Browser, browserProvider);

      // Make all server providers fail
      for (const pid of [TTSProvider.Groq, TTSProvider.OpenAI, TTSProvider.ElevenLabs]) {
        deps.providers.set(
          pid,
          createMockTTSProvider(pid, {
            synthesize: jest.fn().mockResolvedValue(
              Err({
                code: ErrorCode.ProviderUnavailable,
                message: `${pid} is down`,
              }),
            ),
          }),
        );
      }

      const request = makeDefaultRequest({ tier: SubscriptionTier.Pro });
      await synthesize(request, deps);

      expect(browserProvider.synthesize).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 19. Cache not written on synthesis failure
  // -----------------------------------------------------------------------
  describe('Cache not written on synthesis failure', () => {
    it('does not call cacheStore.set when all providers fail', async () => {
      setupSuccessFlow(deps);
      const cacheStore = deps.cacheStore as jest.Mocked<CacheStorePort>;

      // Make all providers fail
      for (const pid of [TTSProvider.Groq, TTSProvider.OpenAI, TTSProvider.ElevenLabs]) {
        deps.providers.set(
          pid,
          createMockTTSProvider(pid, {
            synthesize: jest.fn().mockResolvedValue(
              Err({
                code: ErrorCode.ProviderUnavailable,
                message: `${pid} is down`,
              }),
            ),
          }),
        );
      }

      const request = makeDefaultRequest({ tier: SubscriptionTier.Pro });
      await synthesize(request, deps);

      expect(cacheStore.set).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 20. Deduction metadata contains correct provider and character count
  // -----------------------------------------------------------------------
  describe('Deduction metadata', () => {
    it('passes correct provider name and character count in credit deduction metadata', async () => {
      const repo = deps.creditRepository as jest.Mocked<CreditRepositoryPort>;
      repo.findCurrentAllocation.mockResolvedValue(makeMockAllocation());
      repo.deductCredits.mockResolvedValue(makeMockTransaction());

      const text = 'Specific text for metadata test.';
      const request = makeDefaultRequest({
        text,
        provider: TTSProvider.ElevenLabs,
        tier: SubscriptionTier.Enterprise,
      });
      await synthesize(request, deps);

      expect(repo.deductCredits).toHaveBeenCalledWith(
        'alloc-1',
        expect.any(Number),
        expect.objectContaining({
          provider: TTSProvider.ElevenLabs,
          characterCount: text.length,
        }),
      );
    });
  });
});
