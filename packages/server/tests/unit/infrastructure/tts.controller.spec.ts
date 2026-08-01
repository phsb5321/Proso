/**
 * TTS Controller error-response shape tests
 *
 * T001 (spec 089): the controller's JSON error body must carry both `error`
 * (legacy key, kept for backward compat) and `message` (new key, matches
 * `ErrorResponse` in packages/shared/src/types/api.ts) with identical
 * values, plus `code` so the extension can branch on it instead of
 * string-matching English text.
 *
 * @module tests/unit/infrastructure/tts.controller
 */

import { HttpStatus } from '@nestjs/common';
import { TTSProvider, SubscriptionTier, ErrorCode, Ok, Err } from '@proso/shared';
import { TTSController } from '../../../src/infrastructure/controllers/tts.controller';
import type {
  CreditAllocationRecord,
  CreditRepositoryPort,
} from '../../../src/ports/credit-repository.port';
import type { CacheStorePort } from '../../../src/ports/cache-store.port';
import type {
  SubscriptionRecord,
  SubscriptionRepositoryPort,
} from '../../../src/ports/subscription-repository.port';
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

function createMockRequest(userId?: string): Record<string, unknown> {
  return { userId };
}

/**
 * An active Pro subscription. The period window is relative because the record
 * claims `status: 'active'`: an absolute one turns this into an active
 * subscription whose period has closed, a state the product does not have and a
 * trap for the first check that reads these dates.
 */
function makeProSubscription(): SubscriptionRecord {
  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    id: 'sub-1',
    userId: 'user-1',
    tier: SubscriptionTier.Pro,
    status: 'active',
    currentPeriodStart: periodStart,
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: periodStart,
    updatedAt: periodStart,
  };
}

/** A funded, unexpired credit allocation — enough to pass the preflight. */
function makeAllocation(): CreditAllocationRecord {
  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return {
    id: 'alloc-1',
    userId: 'user-1',
    subscriptionId: 'sub-1',
    totalCredits: 500_000,
    remainingCredits: 350_000,
    periodStart,
    periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: periodStart,
  };
}

function createMockResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status: jest.fn().mockImplementation((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((body: unknown) => {
      res.body = body;
      return res;
    }),
    setHeader: jest.fn().mockImplementation((key: string, value: string) => {
      res.headers[key] = value;
      return res;
    }),
    send: jest.fn().mockImplementation((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TTSController — error response shape (T001)', () => {
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

  describe('text-too-long validation branch', () => {
    it('emits both error and message (equal) plus code on the 400 body', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await controller.synthesizeAudio(req as any, res as any, {
        text: 'A'.repeat(6000), // exceeds MAX_TEXT_LENGTH of 5000
      });

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const body = res.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
      expect(body.message).toBeDefined();
      expect(body.message).toBe(body.error);
      expect(body.code).toBe(ErrorCode.TextTooLong);
    });
  });

  describe('general Result-to-HTTP error mapping branch', () => {
    it('emits both error and message (equal) plus code and details when every provider fails', async () => {
      const providerError: TTSError = {
        code: ErrorCode.ProviderUnavailable,
        message: 'Provider synthesis failed in test double',
      };
      for (const adapter of providers.values()) {
        adapter.synthesize.mockResolvedValue(Err(providerError));
      }

      // Paid tier with credits — the only way to reach the provider loop, since
      // managed synthesis is gated on FEATURE_MATRIX.managedTts and a Free tier
      // request is rejected before any provider is tried.
      subscriptionRepo.findActiveByUserId.mockResolvedValue(makeProSubscription());
      creditRepo.findCurrentAllocation.mockResolvedValue(makeAllocation());

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.synthesizeAudio(req as any, res as any, {
        text: 'Every provider fails for this request',
      });

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      const body = res.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
      expect(body.message).toBeDefined();
      expect(body.message).toBe(body.error);
      expect(body.code).toBe(ErrorCode.AllProvidersUnavailable);
      expect(body.details).toEqual(
        expect.objectContaining({
          primary: expect.any(String),
          fallbackChain: expect.any(Array),
        }),
      );
    });

    it('maps InsufficientCredits/NoActiveAllocation-class errors to 402 with the same shape', async () => {
      // Paid tier so the credit preflight runs and produces a CreditError before any
      // provider call — deterministic without needing to mock deductCredits.
      subscriptionRepo.findActiveByUserId.mockResolvedValue(makeProSubscription());
      creditRepo.findCurrentAllocation.mockResolvedValue(null);

      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.synthesizeAudio(req as any, res as any, {
        text: 'Paid tier request with no active allocation',
      });

      expect(res.status).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
      const body = res.body as Record<string, unknown>;
      expect(body.error).toBeDefined();
      expect(body.message).toBeDefined();
      expect(body.message).toBe(body.error);
      expect(body.code).toBe(ErrorCode.NoActiveAllocation);
    });
  });

  describe('managed TTS is gated at the HTTP boundary', () => {
    // Regression lock for the production leak: this exact request — anonymous,
    // no BYOK key — returned 200 with `audio/mpeg`, `X-Provider: openai` and
    // `X-Credits-Used: 0`, i.e. freshly synthesized on the server's own OpenAI
    // key at our cost, for any caller on the internet.
    it('answers an anonymous managed request with 402, not audio', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await controller.synthesizeAudio(req as any, res as any, {
        text: 'Anonymous request with no BYOK key',
      });

      expect(res.status).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
      expect(res.send).not.toHaveBeenCalled();
      expect((res.body as Record<string, unknown>).code).toBe(ErrorCode.InsufficientCredits);

      for (const adapter of providers.values()) {
        expect(adapter.synthesize).not.toHaveBeenCalled();
      }
    });
  });
});
