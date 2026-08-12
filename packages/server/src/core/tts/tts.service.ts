// TTS service — orchestrates cache, credits, routing, and synthesis
// ZERO NestJS imports — pure TypeScript business logic
//
// Enforces:
//   INV-005: Browser TTS always unlimited (routed client-side, never reaches here)
//   INV-006: Cached content never re-charges (cache check before credit deduction)
//   FEATURE_MATRIX.managedTts: only tiers that pay for managed TTS may spend
//     the server's own provider API keys

import {
  Err,
  ErrorCode,
  FEATURE_MATRIX,
  Ok,
  SubscriptionTier,
  TTSProvider,
  calculateCreditCost,
  isErr,
} from '@proso/shared';
import type { Result } from '@proso/shared';
import type { CacheStorePort } from '../../ports/cache-store.port.js';
import type { CreditRepositoryPort } from '../../ports/credit-repository.port.js';
import type { LoggerPort } from '../../ports/logger.port.js';
import type { TTSProviderPort, TTSSynthesizeResult } from '../../ports/tts-provider.port.js';
import { checkCredits, deductCredits } from '../credits/credit.service.js';
import { selectProvider } from '../routing/provider-router.js';
import { creditError, ttsError } from '../shared/domain-errors.js';
import type { CreditError, TTSError } from '../shared/domain-errors.js';

export interface TTSServiceDeps {
  cacheStore: CacheStorePort;
  creditRepository: CreditRepositoryPort;
  logger?: LoggerPort;
  providers: Map<TTSProvider, TTSProviderPort>;
}

export interface TTSRequest {
  userId: string;
  text: string;
  provider?: TTSProvider;
  voice?: string;
  language?: string;
  tier: SubscriptionTier;
  /** User-provided BYOK API key — skips credit deduction and provider routing when present. */
  byokApiKey?: string;
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
  byokApiKey?: string,
): Promise<Result<TTSSynthesizeResult, TTSError>> {
  return provider.synthesize({ text, voice, language, speed, byokApiKey });
}

async function cacheAudioBestEffort(
  cacheKey: string,
  audio: Buffer,
  deps: Pick<TTSServiceDeps, 'cacheStore' | 'logger'>,
): Promise<void> {
  try {
    await deps.cacheStore.set(cacheKey, audio);
  } catch (error: unknown) {
    try {
      deps.logger?.warn('TTS audio cache write failed after successful synthesis', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // A reporting failure must never turn already-paid audio into an HTTP failure.
    }
  }
}

/**
 * Orchestrate TTS synthesis with caching, credit checking, and fallback.
 *
 * Flow:
 * 1. Generate cache key from request parameters
 * 2. Check cache (INV-006: cached content never re-charges)
 * 3. Route to best provider via selectProvider()
 * 4. Preflight credits before paid provider work
 * 5. Call provider.synthesize()
 * 6. On provider failure, try fallback chain
 * 7. Conditionally commit credits for the provider that actually succeeded
 * 8. Store result in cache for future requests
 * 9. Return audio with metadata
 */
export async function synthesize(
  request: TTSRequest,
  deps: TTSServiceDeps,
): Promise<Result<TTSResult, CreditError | TTSError>> {
  // --- BYOK path: user-provided API key, skip credit deduction and routing ---
  if (request.byokApiKey) {
    return synthesizeByok({ ...request, byokApiKey: request.byokApiKey }, deps);
  }

  // --- Managed-credit path ---
  // Gate the server's own provider keys behind FEATURE_MATRIX.managedTts.
  // Without this, a tier whose credit allowance is 0 (Free) skipped both the
  // preflight and the deduction below — the `tier !== Free` guards read as
  // "free tier is not charged" but actually meant "free tier is not metered",
  // so unauthenticated callers synthesized on our keys for free, unbounded.
  //
  // No invariant is weakened: Free remains account-free and BYOK remains
  // available on every tier (INV-002, handled above this line). Whether a
  // no-key Free reading route should exist is a separate product decision.
  //
  // The gate sits ABOVE the cache probe on purpose, so an ungated tier gets a
  // deterministic 402 rather than "works whenever someone else already
  // synthesized this exact text". managedTts is an entitlement flag, not a cost
  // flag — a warm cache is not a licence to hand a paid feature to a tier that
  // does not have it, and the cache key is global (tts:{provider}:{voice}:
  // {language}:{textHash}, no userId), so reading it from an unauthenticated
  // request would expose one tenant's audio to another. INV-006 is untouched:
  // it forbids re-charging for cached content, and this path charges nothing.
  if (!FEATURE_MATRIX[request.tier].managedTts) {
    // A credit-class error, not a TTS-class one: the tier's managed allowance is
    // zero (TIER_CREDITS.Free), so every managed request is short by its full
    // price. That is already the 402 the extension branches on.
    // This message is shown to the reader verbatim by the extension, so it names
    // only remedies the extension actually offers — and says plainly that they
    // are free. The remedy set today (PROSO-15): BYOK (INV-002 — the BYOK
    // branch above this gate synthesizes with the reader's own key and deducts
    // zero credits on every tier) and the reader-operated local synthesis host
    // (constitution Principle I v2.1.0). Browser TTS is deliberately absent:
    // INV-005 guarantees it is unlimited, but the extension's playback path
    // has no Web Speech route, so suggesting it would send the reader looking
    // for a setting that does not exist.
    return Err(
      creditError(
        ErrorCode.InsufficientCredits,
        'Managed TTS is not included in this tier. Attach your own provider API key in settings (free on every tier), or use a local synthesis host you run yourself.',
        { tier: request.tier },
      ),
    );
  }

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

  const candidates = [resolvedProvider, ...routing.fallbackChain].filter(
    (provider): provider is Exclude<TTSProvider, TTSProvider.Browser> =>
      provider !== TTSProvider.Browser,
  );

  // Step 2: Probe cache keys in the same deterministic order as provider routing.
  for (const candidate of candidates) {
    const candidateCacheKey = buildCacheKey(
      request.text,
      candidate,
      request.voice,
      request.language,
    );
    const cached = await deps.cacheStore.get(candidateCacheKey);
    if (cached) {
      const allocation = await deps.creditRepository.findCurrentAllocation(request.userId);
      return Ok({
        audio: cached,
        contentType: 'audio/mpeg',
        provider: candidate,
        cacheHit: true,
        creditsUsed: 0,
        creditsRemaining: allocation?.remainingCredits ?? 0,
      });
    }
  }

  const primaryAdapter = deps.providers.get(resolvedProvider);
  if (!primaryAdapter) {
    return Err(
      ttsError(ErrorCode.ProviderUnavailable, `Provider ${resolvedProvider} is not registered`, {
        provider: resolvedProvider,
      }),
    );
  }

  // Steps 3-5: preflight each candidate's real price immediately before paid
  // provider work, then follow the deterministic fallback order.
  let synthesisResult: TTSSynthesizeResult | undefined;
  let successfulCandidate: Exclude<TTSProvider, TTSProvider.Browser> | undefined;
  let lastProviderError: TTSError | undefined;
  let lastCreditError: CreditError | undefined;

  for (const candidate of candidates) {
    const adapter = deps.providers.get(candidate);
    if (!adapter) continue;

    // Unconditional: every tier that reaches here has managedTts, so every
    // provider call below is metered. No tier gets a free pass.
    const candidateCost = calculateCreditCost(request.text.length, candidate);
    const preflight = await checkCredits(request.userId, candidateCost, {
      creditRepository: deps.creditRepository,
    });
    if (isErr(preflight)) {
      lastCreditError = preflight.error;
      continue;
    }

    const attempt = await tryProvider(adapter, request.text, request.voice, request.language);
    if (!attempt.ok) {
      lastProviderError = attempt.error;
      continue;
    }
    if (attempt.value.provider !== candidate) {
      lastProviderError = ttsError(
        ErrorCode.ProviderUnavailable,
        `Provider ${candidate} returned mismatched provider metadata`,
        {
          expectedProvider: candidate,
          returnedProvider: attempt.value.provider,
        },
      );
      continue;
    }

    synthesisResult = attempt.value;
    successfulCandidate = candidate;
    break;
  }

  if (!synthesisResult || !successfulCandidate) {
    if (lastCreditError) {
      return Err(lastCreditError);
    }
    return Err(
      ttsError(ErrorCode.AllProvidersUnavailable, 'All TTS providers failed to synthesize audio', {
        primary: resolvedProvider,
        fallbackChain: routing.fallbackChain,
        lastError: lastProviderError?.message,
      }),
    );
  }

  const result = synthesisResult;

  // Step 6: Charge only after successful synthesis, using the provider that produced the audio.
  // Unconditional for the same reason as the preflight above — reaching this
  // line means the tier includes managed TTS, so the work is always billed.
  const creditCost = calculateCreditCost(request.text.length, successfulCandidate);

  const deductionResult = await deductCredits(
    request.userId,
    creditCost,
    {
      provider: successfulCandidate,
      characterCount: request.text.length,
      description: `TTS synthesis via ${successfulCandidate}`,
    },
    { creditRepository: deps.creditRepository },
  );

  if (!deductionResult.ok) {
    return deductionResult;
  }
  const creditsRemaining = deductionResult.value.remainingCredits;

  // Step 7: Store under the actual provider so future cache metadata is truthful.
  const resultCacheKey = buildCacheKey(
    request.text,
    successfulCandidate,
    request.voice,
    request.language,
  );
  await cacheAudioBestEffort(resultCacheKey, result.audio, deps);

  return Ok({
    audio: result.audio,
    contentType: result.contentType,
    provider: successfulCandidate,
    cacheHit: false,
    creditsUsed: creditCost,
    creditsRemaining,
  });
}

/**
 * BYOK synthesis path — user provides their own API key.
 *
 * Differences from managed-credit path:
 * - Uses requested provider directly (no tier-based routing)
 * - Skips credit deduction (user pays provider directly)
 * - No fallback chain (BYOK key is provider-specific)
 * - Cache still applies (INV-006)
 */
async function synthesizeByok(
  request: TTSRequest & { byokApiKey: string },
  deps: TTSServiceDeps,
): Promise<Result<TTSResult, TTSError>> {
  const requestedProvider = request.provider;
  if (!requestedProvider || requestedProvider === TTSProvider.Browser) {
    return Err(
      ttsError(
        ErrorCode.ProviderUnavailable,
        'BYOK requests must specify a valid non-browser provider',
        {},
      ),
    );
  }

  // Check cache (INV-006: cached content never re-charges — and for BYOK, never re-calls provider)
  const cacheKey = buildCacheKey(request.text, requestedProvider, request.voice, request.language);

  const cached = await deps.cacheStore.get(cacheKey);
  if (cached) {
    return Ok({
      audio: cached,
      contentType: 'audio/mpeg',
      provider: requestedProvider,
      cacheHit: true,
      creditsUsed: 0,
      creditsRemaining: 0,
    });
  }

  // Look up adapter for the requested provider
  const adapter = deps.providers.get(requestedProvider);
  if (!adapter) {
    return Err(
      ttsError(ErrorCode.ProviderUnavailable, `Provider ${requestedProvider} is not registered`, {
        provider: requestedProvider,
      }),
    );
  }

  // Synthesize with user's BYOK key — no fallback chain
  const synthesisResult = await tryProvider(
    adapter,
    request.text,
    request.voice,
    request.language,
    undefined,
    request.byokApiKey,
  );

  if (!synthesisResult.ok) {
    return Err(synthesisResult.error);
  }

  const result = synthesisResult.value;

  // Cache failure must not discard audio that the user's provider already generated.
  await cacheAudioBestEffort(cacheKey, result.audio, deps);

  return Ok({
    audio: result.audio,
    contentType: result.contentType,
    provider: result.provider,
    cacheHit: false,
    creditsUsed: 0,
    creditsRemaining: 0,
  });
}
