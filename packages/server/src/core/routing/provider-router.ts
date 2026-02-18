// Provider router — selects the best TTS provider based on tier and preferences
// ZERO NestJS imports — pure TypeScript business logic
//
// Routing strategy:
//   Free tier → Browser only (INV-005: Browser TTS always unlimited)
//   Pro tier → cost-efficient first (Groq > OpenAI > ElevenLabs)
//   Enterprise tier → premium quality first (ElevenLabs > OpenAI > Groq)

import { TTSProvider, SubscriptionTier } from '@voxpage/shared';
import { TIER_PROVIDER_ORDER, buildFallbackChain } from './fallback-chain.js';

export interface RoutingDecision {
  provider: TTSProvider;
  fallbackChain: TTSProvider[];
  reason: string;
}

/**
 * Select the best TTS provider and build a fallback chain.
 *
 * Decision order:
 * 1. Free tier always routes to Browser (no server-side TTS)
 * 2. If user has a preferred provider and it is available, use it
 * 3. Otherwise, use the tier's default ordering filtered by availability
 *
 * @param tier - User's subscription tier
 * @param _language - Language hint (reserved for future language-based routing)
 * @param preferredProvider - User's preferred provider, if any
 * @param availableProviders - Providers that are currently operational
 * @returns Routing decision with primary provider, fallback chain, and reason
 */
export function selectProvider(
  tier: SubscriptionTier,
  _language: string | undefined,
  preferredProvider: TTSProvider | undefined,
  availableProviders: TTSProvider[],
): RoutingDecision {
  // Free tier: Browser only (INV-005)
  if (tier === SubscriptionTier.Free) {
    return {
      provider: TTSProvider.Browser,
      fallbackChain: [],
      reason: 'Free tier routes to browser-only TTS (INV-005)',
    };
  }

  // If user has a preferred provider and it is available, use it
  if (preferredProvider && availableProviders.includes(preferredProvider)) {
    const fallbackChain = buildFallbackChain(
      tier,
      availableProviders,
      preferredProvider,
    );

    return {
      provider: preferredProvider,
      fallbackChain,
      reason: `User-preferred provider: ${preferredProvider}`,
    };
  }

  // Default: use tier-based ordering filtered by availability
  const tierOrder = TIER_PROVIDER_ORDER[tier] ?? TIER_PROVIDER_ORDER[SubscriptionTier.Free];
  const availableInOrder = tierOrder.filter((p) =>
    availableProviders.includes(p),
  );

  if (availableInOrder.length === 0) {
    // No server providers available — fall back to Browser
    return {
      provider: TTSProvider.Browser,
      fallbackChain: [],
      reason: 'No server-side providers available, falling back to browser TTS',
    };
  }

  const [primary, ...fallback] = availableInOrder;

  return {
    provider: primary,
    fallbackChain: fallback,
    reason: `Tier-default routing for ${tier}: ${primary}`,
  };
}
