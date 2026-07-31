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
import fc from 'fast-check';

import { synthesize } from '../../../../src/core/tts/tts.service';
import type { CacheStorePort } from '../../../../src/ports/cache-store.port';
import type { CreditRepositoryPort } from '../../../../src/ports/credit-repository.port';
import type { TTSProviderPort } from '../../../../src/ports/tts-provider.port';

const propertyOptions = {
  seed: Number(process.env.FC_SEED ?? 20260730),
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
  verbose: true as const,
};

const providers = [TTSProvider.Groq, TTSProvider.OpenAI, TTSProvider.ElevenLabs] as const;

describe('managed TTS credit properties', () => {
  it('charges exactly once for the first successful provider and never for total failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50_000 }),
        fc.constantFrom(...providers),
        fc.array(fc.boolean(), { minLength: providers.length, maxLength: providers.length }),
        async (textLength, preferredProvider, outcomes) => {
          const candidateOrder = [
            preferredProvider,
            ...providers.filter((provider) => provider !== preferredProvider),
          ];
          const outcomeByProvider = new Map(
            candidateOrder.map((provider, index) => [provider, outcomes[index]]),
          );
          const cacheStore = {
            get: jest.fn(async () => null),
            set: jest.fn(async () => undefined),
            has: jest.fn(async () => false),
            delete: jest.fn(async () => undefined),
          } as jest.Mocked<CacheStorePort>;
          const creditRepository = {
            findCurrentAllocation: jest.fn(async () => ({
              id: 'allocation-1',
              userId: 'user-1',
              subscriptionId: 'subscription-1',
              totalCredits: 1_000_000,
              remainingCredits: 1_000_000,
              periodStart: new Date('2026-07-01T00:00:00.000Z'),
              periodEnd: new Date('2026-08-01T00:00:00.000Z'),
              createdAt: new Date('2026-07-01T00:00:00.000Z'),
            })),
            deductCredits: jest.fn(async (allocationId: string, amount: number) => ({
              id: 'transaction-1',
              userId: 'user-1',
              allocationId,
              type: 'deduction',
              amount,
              createdAt: new Date('2026-07-30T18:00:00.000Z'),
              remainingCredits: 1_000_000 - amount,
            })),
          } as unknown as jest.Mocked<CreditRepositoryPort>;
          const adapters = new Map<TTSProvider, TTSProviderPort>(
            providers.map((provider) => [
              provider,
              {
                providerId: provider,
                supportedLanguages: ['en'],
                synthesize: jest.fn(async () =>
                  outcomeByProvider.get(provider)
                    ? Ok({
                        audio: Buffer.from(provider),
                        contentType: 'audio/mpeg',
                        provider,
                      })
                    : Err({
                        code: ErrorCode.ProviderUnavailable,
                        message: `${provider} unavailable`,
                      }),
                ),
                getVoices: jest.fn(async () => Ok([])),
              },
            ]),
          );

          const result = await synthesize(
            {
              userId: 'user-1',
              text: 'x'.repeat(textLength),
              provider: preferredProvider,
              tier: SubscriptionTier.Pro,
            },
            { cacheStore, creditRepository, providers: adapters },
          );
          const successfulProvider = candidateOrder.find((provider) =>
            outcomeByProvider.get(provider),
          );

          if (successfulProvider === undefined) {
            expect(isErr(result)).toBe(true);
            expect(creditRepository.deductCredits).not.toHaveBeenCalled();
            expect(cacheStore.set).not.toHaveBeenCalled();
            return;
          }

          expect(isOk(result)).toBe(true);
          if (!isOk(result)) return;

          const expectedCost = calculateCreditCost(textLength, successfulProvider);
          expect(result.value.provider).toBe(successfulProvider);
          expect(result.value.creditsUsed).toBe(expectedCost);
          expect(creditRepository.deductCredits).toHaveBeenCalledTimes(1);
          expect(creditRepository.deductCredits).toHaveBeenCalledWith(
            'allocation-1',
            expectedCost,
            expect.objectContaining({
              provider: successfulProvider,
              characterCount: textLength,
            }),
          );
          expect(cacheStore.set).toHaveBeenCalledTimes(1);
          expect(cacheStore.set.mock.calls[0]?.[0]).toContain(`tts:${successfulProvider}:`);
        },
      ),
      propertyOptions,
    );
  });
});
