/**
 * TTS Controller BYOK authentication bypass tests
 *
 * Verifies the controller's authentication logic for BYOK requests:
 * - BYOK requests (with byokApiKey) are allowed without userId (INV-002)
 * - Non-BYOK requests without userId are rejected with 401
 * - BYOK requests without a provider are rejected with 400
 *
 * @module tests/unit/infrastructure/tts-byok-auth
 */

import { HttpStatus } from '@nestjs/common';
import {
  TTSProvider,
  SubscriptionTier,
  ErrorCode,
  Ok,
} from '@proso/shared';
import { TTSController } from '../../../src/infrastructure/controllers/tts.controller';
import type {
  CreditRepositoryPort,
  CreditAllocationRecord,
  CreditTransactionRecord,
} from '../../../src/ports/credit-repository.port';
import type { CacheStorePort } from '../../../src/ports/cache-store.port';
import type { SubscriptionRepositoryPort } from '../../../src/ports/subscription-repository.port';
import type { TTSProviderPort, TTSSynthesizeParams } from '../../../src/ports/tts-provider.port';

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

function createMockProviders(): Map<TTSProvider, TTSProviderPort> {
  const providers = new Map<TTSProvider, TTSProviderPort>();
  providers.set(TTSProvider.OpenAI, createMockTTSProvider(TTSProvider.OpenAI));
  providers.set(TTSProvider.ElevenLabs, createMockTTSProvider(TTSProvider.ElevenLabs));
  providers.set(TTSProvider.Groq, createMockTTSProvider(TTSProvider.Groq));
  providers.set(TTSProvider.Cartesia, createMockTTSProvider(TTSProvider.Cartesia));
  return providers;
}

/**
 * Build a mock Express Request with optional userId.
 */
function createMockRequest(userId?: string): Record<string, unknown> {
  return {
    userId,
  };
}

/**
 * Build a mock Express Response that captures status, json, setHeader, and send calls.
 */
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

describe('TTSController — BYOK authentication', () => {
  let controller: TTSController;
  let creditRepo: jest.Mocked<CreditRepositoryPort>;
  let cacheStore: jest.Mocked<CacheStorePort>;
  let subscriptionRepo: jest.Mocked<SubscriptionRepositoryPort>;
  let providers: Map<TTSProvider, TTSProviderPort>;

  beforeEach(() => {
    creditRepo = createMockCreditRepo();
    cacheStore = createMockCacheStore();
    subscriptionRepo = createMockSubscriptionRepo();
    providers = createMockProviders();

    controller = new TTSController(
      creditRepo,
      cacheStore,
      subscriptionRepo,
      providers,
    );
  });

  // -----------------------------------------------------------------------
  // 1. BYOK request without userId should NOT return 401
  // -----------------------------------------------------------------------
  describe('BYOK without userId (INV-002: BYOK always available)', () => {
    it('does not return 401 when byokApiKey is provided but userId is absent', async () => {
      const req = createMockRequest(undefined); // no userId
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'BYOK synthesis test',
          provider: 'openai',
          byokApiKey: 'sk-user-key-123',
        },
      );

      // Should NOT have returned 401
      expect(res.status).not.toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('processes the synthesis request successfully with BYOK and no userId', async () => {
      const req = createMockRequest(undefined); // no userId
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'BYOK anonymous request',
          provider: 'openai',
          byokApiKey: 'sk-user-key-456',
        },
      );

      // Should have called send (successful audio response)
      expect(res.send).toHaveBeenCalled();
    });

    it('sets metadata headers on successful BYOK response', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'BYOK headers test',
          provider: 'openai',
          byokApiKey: 'sk-user-key-789',
        },
      );

      expect(res.setHeader).toHaveBeenCalledWith('X-Credits-Used', '0');
      expect(res.setHeader).toHaveBeenCalledWith('X-Credits-Remaining', '0');
      expect(res.setHeader).toHaveBeenCalledWith('X-Cache-Hit', 'false');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
    });

    it('works with authenticated BYOK request (has both userId and byokApiKey)', async () => {
      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'Authenticated BYOK request',
          provider: 'openai',
          byokApiKey: 'sk-user-key-authenticated',
        },
      );

      expect(res.status).not.toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(res.send).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Non-BYOK request without userId should return 401
  // -----------------------------------------------------------------------
  describe('Non-BYOK without userId', () => {
    it('returns 401 Unauthorized when no byokApiKey and no userId', async () => {
      const req = createMockRequest(undefined); // no userId
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'This should fail',
          provider: 'openai',
          // no byokApiKey
        },
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication required',
          code: ErrorCode.Unauthorized,
        }),
      );
    });

    it('does not call the synthesis service when 401 is returned', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'Unauthenticated non-BYOK',
        },
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      // The send method should NOT have been called (no audio response)
      expect(res.send).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. BYOK request without provider should return 400
  // -----------------------------------------------------------------------
  describe('BYOK without provider specified', () => {
    it('throws BadRequestException when byokApiKey is provided but provider is missing', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await expect(
        controller.synthesizeAudio(
          req as any,
          res as any,
          {
            text: 'BYOK without provider',
            byokApiKey: 'sk-key-no-provider',
            // no provider specified
          },
        ),
      ).rejects.toThrow('BYOK requests must specify a provider');
    });

    it('throws BadRequestException with BYOK provider message even when userId is present', async () => {
      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await expect(
        controller.synthesizeAudio(
          req as any,
          res as any,
          {
            text: 'Authenticated BYOK without provider',
            byokApiKey: 'sk-key-no-provider',
            // no provider specified
          },
        ),
      ).rejects.toThrow('BYOK requests must specify a provider');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Input validation still applies to BYOK requests
  // -----------------------------------------------------------------------
  describe('BYOK input validation', () => {
    it('throws BadRequestException when text is empty', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await expect(
        controller.synthesizeAudio(
          req as any,
          res as any,
          {
            text: '',
            provider: 'openai',
            byokApiKey: 'sk-key',
          },
        ),
      ).rejects.toThrow('Text is required');
    });

    it('returns 400 when text exceeds maximum length', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'A'.repeat(6000), // exceeds MAX_TEXT_LENGTH of 5000
          provider: 'openai',
          byokApiKey: 'sk-key',
        },
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });

    it('throws BadRequestException when provider is invalid', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await expect(
        controller.synthesizeAudio(
          req as any,
          res as any,
          {
            text: 'Valid text',
            provider: 'invalid-provider',
            byokApiKey: 'sk-key',
          },
        ),
      ).rejects.toThrow('Invalid provider');
    });
  });

  // -----------------------------------------------------------------------
  // 5. BYOK defaults to Free tier when no userId for subscription lookup
  // -----------------------------------------------------------------------
  describe('BYOK tier assignment', () => {
    it('does not query subscription repository when userId is absent', async () => {
      const req = createMockRequest(undefined);
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'BYOK no subscription lookup',
          provider: 'openai',
          byokApiKey: 'sk-key',
        },
      );

      expect(subscriptionRepo.findActiveByUserId).not.toHaveBeenCalled();
    });

    it('queries subscription repository when userId is present on BYOK request', async () => {
      const req = createMockRequest('user-1');
      const res = createMockResponse();

      await controller.synthesizeAudio(
        req as any,
        res as any,
        {
          text: 'BYOK with subscription lookup',
          provider: 'openai',
          byokApiKey: 'sk-key',
        },
      );

      expect(subscriptionRepo.findActiveByUserId).toHaveBeenCalledWith('user-1');
    });
  });
});
