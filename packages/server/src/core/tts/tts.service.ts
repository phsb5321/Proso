// TTS service — orchestrates cache, credits, routing, and synthesis
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces:
//   INV-005: Browser TTS always unlimited (routed client-side, never reaches here)
//   INV-006: Cached content never re-charges (cache check before credit deduction)

import {
  TTSProvider,
  SubscriptionTier,
  ErrorCode,
  calculateCreditCost,
} from '@proso/shared';
import type { Result } from '@proso/shared';
import { Ok, Err, isErr } from '@proso/shared';
import { ttsError } from '../shared/domain-errors.js';
import type { CreditError, TTSError } from '../shared/domain-errors.js';
import { deductCredits } from '../credits/credit.service.js';
import { selectProvider } from '../routing/provider-router.js';
import type { CacheStorePort } from '../../ports/cache-store.port.js';
import type { CreditRepositoryPort } from '../../ports/credit-repository.port.js';
import type {
  TTSProviderPort,
  TTSSynthesizeResult,
} from '../../ports/tts-provider.port.js';

export interface TTSServiceDeps {
  cacheStore: CacheStorePort;
  creditRepository: CreditRepositoryPort;
  providers: Map<TTSProvider, TTSProviderPort>;
}

export interface TTSRequest {
  userId: string;
  text: string;
  provider?: TTSProvider;
  voice?: string;
  language?: string;
  tier: SubscriptionTier;
}

export interface TTSResult {
  audio: Buffer;
  contentType: string;
  provider: TTSProvider;
  cacheHit: boolean;
  creditsUsed: number;
  creditsRemaining: number;
}

/**
 * Generate a deterministic cache key from synthesis parameters.
 * Key format: tts:{provider}:{voice}:{language}:{textHash}
 */
function buildCacheKey(
  text: string,
  provider: TTSProvider,
  voice?: string,
  language?: string,
): string {
  // Simple hash — sufficient for cache deduplication
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const textHash = Math.abs(hash).toString(36);
  const v = voice ?? 'default';
  const l = language ?? 'en';
  return `tts:${provider}:${v}:${l}:${textHash}`;
}

/**
 * Attempt synthesis with a specific provider.
 * Returns the synthesis result or a TTSError.
 */
async function tryProvider(
  provider: TTSProviderPort,
  text: string,
  voice?: string,
  language?: string,
  speed?: number,
): Promise<Result<TTSSynthesizeResult, TTSError>> {
  return provider.synthesize({ text, voice, language, speed });
}

/**
 * Orchestrate TTS synthesis with caching, credit checking, and fallback.
 *
 * Flow:
 * 1. Generate cache key from request parameters
 * 2. Check cache (INV-006: cached content never re-charges)
 * 3. Route to best provider via selectProvider()
 * 4. Calculate credit cost via calculateCreditCost()
 * 5. Deduct credits BEFORE synthesis (fail fast on insufficient credits)
 * 6. Call provider.synthesize()
 * 7. On provider failure, try fallback chain
 * 8. Store result in cache for future requests
 * 9. Return audio with metadata
 */
export async function synthesize(
  request: TTSRequest,
  deps: TTSServiceDeps,
): Promise<Result<TTSResult, CreditError | TTSError>> {
  const availableProviders = Array.from(deps.providers.keys());

  // Step 1-2: Route to determine primary provider (needed for cache key)
  const routing = selectProvider(
    request.tier,
    request.language,
    request.provider,
    availableProviders,
  );

  const resolvedProvider = routing.provider;

  // Browser TTS is handled client-side — should not reach server (INV-005)
  if (resolvedProvider === TTSProvider.Browser) {
    return Err(
      ttsError(
        ErrorCode.AllProvidersUnavailable,
        'Browser TTS is handled client-side and cannot be synthesized on the server',
        { tier: request.tier },
      ),
    );
  }

  // Step 2: Check cache (INV-006: cached content never re-charges)
  const cacheKey = buildCacheKey(
    request.text,
    resolvedProvider,
    request.voice,
    request.language,
  );

  const cached = await deps.cacheStore.get(cacheKey);
  if (cached) {
    // INV-006: Cache hit — return without charging credits
    // We need to look up remaining credits for the response
    const allocation = await deps.creditRepository.findCurrentAllocation(
      request.userId,
    );
    return Ok({
      audio: cached,
      contentType: 'audio/mpeg',
      provider: resolvedProvider,
      cacheHit: true,
      creditsUsed: 0,
      creditsRemaining: allocation?.remainingCredits ?? 0,
    });
  }

  // Step 3-4: Calculate credit cost
  const creditCost = calculateCreditCost(
    request.text.length,
    resolvedProvider as Exclude<TTSProvider, TTSProvider.Browser>,
  );

  // Step 5: Deduct credits BEFORE synthesis (fail fast)
  const deductionResult = await deductCredits(
    request.userId,
    creditCost,
    {
      provider: resolvedProvider,
      characterCount: request.text.length,
      description: `TTS synthesis via ${resolvedProvider}`,
    },
    { creditRepository: deps.creditRepository },
  );

  if (isErr(deductionResult)) {
    return deductionResult;
  }

  // Step 6: Attempt synthesis with primary provider
  const primaryAdapter = deps.providers.get(resolvedProvider);
  if (!primaryAdapter) {
    return Err(
      ttsError(
        ErrorCode.ProviderUnavailable,
        `Provider ${resolvedProvider} is not registered`,
        { provider: resolvedProvider },
      ),
    );
  }

  let synthesisResult = await tryProvider(
    primaryAdapter,
    request.text,
    request.voice,
    request.language,
  );

  // Step 7: On failure, try fallback chain
  if (isErr(synthesisResult)) {
    for (const fallbackId of routing.fallbackChain) {
      // Skip Browser — cannot synthesize server-side (INV-005)
      if (fallbackId === TTSProvider.Browser) continue;

      const fallbackAdapter = deps.providers.get(fallbackId);
      if (!fallbackAdapter) continue;

      synthesisResult = await tryProvider(
        fallbackAdapter,
        request.text,
        request.voice,
        request.language,
      );

      if (!isErr(synthesisResult)) break;
    }
  }

  // All providers failed — check final result
  // Snapshot into const so TypeScript can narrow the discriminated union
  const finalResult = synthesisResult;
  if (!finalResult.ok) {
    return Err(
      ttsError(
        ErrorCode.AllProvidersUnavailable,
        'All TTS providers failed to synthesize audio',
        {
          primary: resolvedProvider,
          fallbackChain: routing.fallbackChain,
          lastError: finalResult.error.message,
        },
      ),
    );
  }

  const result = finalResult.value;

  // Step 8: Store in cache for future requests (fire-and-forget)
  await deps.cacheStore.set(cacheKey, result.audio);

  // Step 9: Get updated remaining credits after deduction
  const updatedAllocation =
    await deps.creditRepository.findCurrentAllocation(request.userId);

  return Ok({
    audio: result.audio,
    contentType: result.contentType,
    provider: result.provider,
    cacheHit: false,
    creditsUsed: creditCost,
    creditsRemaining: updatedAllocation?.remainingCredits ?? 0,
  });
}
