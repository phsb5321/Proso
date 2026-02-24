// Fallback chain — default provider ordering by subscription tier
// ZERO NestJS imports — pure TypeScript business logic
//
// Pro tier: cost-efficient first (Groq > OpenAI > ElevenLabs)
// Enterprise tier: premium quality first (ElevenLabs > OpenAI > Groq)

import { TTSProvider, SubscriptionTier } from '@proso/shared';

/** Default provider ordering by tier */
export const TIER_PROVIDER_ORDER: Record<SubscriptionTier, TTSProvider[]> = {
  [SubscriptionTier.Free]: [TTSProvider.Browser],
  [SubscriptionTier.Pro]: [
    TTSProvider.Groq,
    TTSProvider.OpenAI,
    TTSProvider.ElevenLabs,
  ],
  [SubscriptionTier.Enterprise]: [
    TTSProvider.ElevenLabs,
    TTSProvider.OpenAI,
    TTSProvider.Groq,
  ],
};

/**
 * Build an ordered fallback chain of providers for a given tier,
 * filtered to only those currently available.
 *
 * @param tier - User's subscription tier
 * @param availableProviders - Providers that are currently operational
 * @param excludeProvider - Optional provider to exclude (e.g., one that just failed)
 * @returns Ordered list of providers to try
 */
export function buildFallbackChain(
  tier: SubscriptionTier,
  availableProviders: TTSProvider[],
  excludeProvider?: TTSProvider,
): TTSProvider[] {
  const tierOrder = TIER_PROVIDER_ORDER[tier] ?? TIER_PROVIDER_ORDER[SubscriptionTier.Free];

  return tierOrder.filter(
    (provider) =>
      availableProviders.includes(provider) &&
      provider !== excludeProvider,
  );
}
