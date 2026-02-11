import { TTSProvider, SubscriptionTier } from '@voxpage/shared';
import { selectProvider } from '../../../../src/core/routing/provider-router';
import {
  buildFallbackChain,
  TIER_PROVIDER_ORDER,
} from '../../../../src/core/routing/fallback-chain';

// ---------------------------------------------------------------------------
// Helper: all server-side providers (excludes Browser)
// ---------------------------------------------------------------------------
const ALL_SERVER_PROVIDERS = [
  TTSProvider.OpenAI,
  TTSProvider.ElevenLabs,
  TTSProvider.Groq,
];

const ALL_PROVIDERS = [...ALL_SERVER_PROVIDERS, TTSProvider.Browser];

// ===========================================================================
// selectProvider
// ===========================================================================

describe('selectProvider', () => {
  // ---- Free tier -----------------------------------------------------------

  describe('Free tier', () => {
    it('always returns Browser regardless of available providers', () => {
      const result = selectProvider(
        SubscriptionTier.Free,
        undefined,
        undefined,
        ALL_PROVIDERS,
      );

      expect(result.provider).toBe(TTSProvider.Browser);
      expect(result.fallbackChain).toEqual([]);
    });

    it('returns Browser even when no providers are listed as available', () => {
      const result = selectProvider(
        SubscriptionTier.Free,
        undefined,
        undefined,
        [],
      );

      expect(result.provider).toBe(TTSProvider.Browser);
      expect(result.fallbackChain).toEqual([]);
    });

    it('ignores preferred provider and still returns Browser', () => {
      const result = selectProvider(
        SubscriptionTier.Free,
        undefined,
        TTSProvider.OpenAI,
        ALL_PROVIDERS,
      );

      expect(result.provider).toBe(TTSProvider.Browser);
      expect(result.fallbackChain).toEqual([]);
    });

    it('includes INV-005 reference in reason string', () => {
      const result = selectProvider(
        SubscriptionTier.Free,
        undefined,
        undefined,
        ALL_PROVIDERS,
      );

      expect(result.reason).toContain('INV-005');
    });
  });

  // ---- Pro tier ------------------------------------------------------------

  describe('Pro tier', () => {
    it('defaults to Groq (cost-efficient) with OpenAI and ElevenLabs fallbacks', () => {
      const result = selectProvider(
        SubscriptionTier.Pro,
        undefined,
        undefined,
        ALL_SERVER_PROVIDERS,
      );

      expect(result.provider).toBe(TTSProvider.Groq);
      expect(result.fallbackChain).toEqual([
        TTSProvider.OpenAI,
        TTSProvider.ElevenLabs,
      ]);
    });

    it('honors user-preferred provider when available', () => {
      const result = selectProvider(
        SubscriptionTier.Pro,
        undefined,
        TTSProvider.OpenAI,
        ALL_SERVER_PROVIDERS,
      );

      expect(result.provider).toBe(TTSProvider.OpenAI);
      expect(result.reason).toContain('User-preferred');
      expect(result.reason).toContain(TTSProvider.OpenAI);
    });

    it('falls back to tier default when preferred provider is unavailable', () => {
      const result = selectProvider(
        SubscriptionTier.Pro,
        undefined,
        TTSProvider.ElevenLabs,
        [TTSProvider.Groq, TTSProvider.OpenAI], // ElevenLabs not available
      );

      expect(result.provider).toBe(TTSProvider.Groq);
      expect(result.fallbackChain).toEqual([TTSProvider.OpenAI]);
    });

    it('excludes preferred provider from fallback chain', () => {
      const result = selectProvider(
        SubscriptionTier.Pro,
        undefined,
        TTSProvider.ElevenLabs,
        ALL_SERVER_PROVIDERS,
      );

      expect(result.provider).toBe(TTSProvider.ElevenLabs);
      expect(result.fallbackChain).not.toContain(TTSProvider.ElevenLabs);
    });
  });

  // ---- Enterprise tier -----------------------------------------------------

  describe('Enterprise tier', () => {
    it('defaults to ElevenLabs (premium quality) with OpenAI and Groq fallbacks', () => {
      const result = selectProvider(
        SubscriptionTier.Enterprise,
        undefined,
        undefined,
        ALL_SERVER_PROVIDERS,
      );

      expect(result.provider).toBe(TTSProvider.ElevenLabs);
      expect(result.fallbackChain).toEqual([
        TTSProvider.OpenAI,
        TTSProvider.Groq,
      ]);
    });

    it('includes tier name in reason string', () => {
      const result = selectProvider(
        SubscriptionTier.Enterprise,
        undefined,
        undefined,
        ALL_SERVER_PROVIDERS,
      );

      expect(result.reason).toContain(SubscriptionTier.Enterprise);
    });
  });

  // ---- Edge cases ----------------------------------------------------------

  describe('edge cases', () => {
    it('falls back to Browser when no server providers are available', () => {
      const result = selectProvider(
        SubscriptionTier.Pro,
        undefined,
        undefined,
        [], // nothing available
      );

      expect(result.provider).toBe(TTSProvider.Browser);
      expect(result.fallbackChain).toEqual([]);
      expect(result.reason).toContain('falling back to browser');
    });

    it('returns single available provider with empty fallback chain', () => {
      const result = selectProvider(
        SubscriptionTier.Pro,
        undefined,
        undefined,
        [TTSProvider.OpenAI],
      );

      expect(result.provider).toBe(TTSProvider.OpenAI);
      expect(result.fallbackChain).toEqual([]);
    });

    it('passes language parameter through without error', () => {
      // Language is currently reserved (_language) but should not cause errors
      const result = selectProvider(
        SubscriptionTier.Pro,
        'pt-BR',
        undefined,
        ALL_SERVER_PROVIDERS,
      );

      expect(result.provider).toBe(TTSProvider.Groq);
    });

    it('handles preferred provider set to undefined gracefully', () => {
      const result = selectProvider(
        SubscriptionTier.Enterprise,
        undefined,
        undefined,
        ALL_SERVER_PROVIDERS,
      );

      expect(result.provider).toBe(TTSProvider.ElevenLabs);
    });

    it('reason string is non-empty for all tier-default decisions', () => {
      for (const tier of [SubscriptionTier.Pro, SubscriptionTier.Enterprise]) {
        const result = selectProvider(tier, undefined, undefined, ALL_SERVER_PROVIDERS);
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });
  });
});

// ===========================================================================
// buildFallbackChain
// ===========================================================================

describe('buildFallbackChain', () => {
  it('returns Pro tier order excluding the primary provider', () => {
    const chain = buildFallbackChain(
      SubscriptionTier.Pro,
      ALL_SERVER_PROVIDERS,
      TTSProvider.Groq,
    );

    expect(chain).toEqual([TTSProvider.OpenAI, TTSProvider.ElevenLabs]);
  });

  it('returns Enterprise tier order excluding specified provider', () => {
    const chain = buildFallbackChain(
      SubscriptionTier.Enterprise,
      ALL_SERVER_PROVIDERS,
      TTSProvider.ElevenLabs,
    );

    expect(chain).toEqual([TTSProvider.OpenAI, TTSProvider.Groq]);
  });

  it('returns empty list when no providers are available', () => {
    const chain = buildFallbackChain(SubscriptionTier.Pro, [], TTSProvider.Groq);

    expect(chain).toEqual([]);
  });

  it('filters out unavailable providers', () => {
    const chain = buildFallbackChain(
      SubscriptionTier.Pro,
      [TTSProvider.Groq, TTSProvider.OpenAI], // ElevenLabs not available
      TTSProvider.Groq,
    );

    expect(chain).toEqual([TTSProvider.OpenAI]);
    expect(chain).not.toContain(TTSProvider.ElevenLabs);
  });

  it('does not include Browser in Pro tier fallback chain', () => {
    const chain = buildFallbackChain(
      SubscriptionTier.Pro,
      ALL_PROVIDERS,
    );

    expect(chain).not.toContain(TTSProvider.Browser);
  });

  it('does not include Browser in Enterprise tier fallback chain', () => {
    const chain = buildFallbackChain(
      SubscriptionTier.Enterprise,
      ALL_PROVIDERS,
    );

    expect(chain).not.toContain(TTSProvider.Browser);
  });

  it('returns full tier order when no provider is excluded', () => {
    const chain = buildFallbackChain(
      SubscriptionTier.Enterprise,
      ALL_SERVER_PROVIDERS,
    );

    expect(chain).toEqual([
      TTSProvider.ElevenLabs,
      TTSProvider.OpenAI,
      TTSProvider.Groq,
    ]);
  });

  it('returns only Browser for Free tier', () => {
    const chain = buildFallbackChain(
      SubscriptionTier.Free,
      ALL_PROVIDERS,
    );

    expect(chain).toEqual([TTSProvider.Browser]);
  });

  it('returns empty for Free tier when Browser is excluded', () => {
    const chain = buildFallbackChain(
      SubscriptionTier.Free,
      ALL_PROVIDERS,
      TTSProvider.Browser,
    );

    expect(chain).toEqual([]);
  });
});

// ===========================================================================
// TIER_PROVIDER_ORDER constant
// ===========================================================================

describe('TIER_PROVIDER_ORDER', () => {
  it('Free tier contains only Browser', () => {
    expect(TIER_PROVIDER_ORDER[SubscriptionTier.Free]).toEqual([
      TTSProvider.Browser,
    ]);
  });

  it('Pro tier order is Groq > OpenAI > ElevenLabs (cost-efficient)', () => {
    expect(TIER_PROVIDER_ORDER[SubscriptionTier.Pro]).toEqual([
      TTSProvider.Groq,
      TTSProvider.OpenAI,
      TTSProvider.ElevenLabs,
    ]);
  });

  it('Enterprise tier order is ElevenLabs > OpenAI > Groq (premium quality)', () => {
    expect(TIER_PROVIDER_ORDER[SubscriptionTier.Enterprise]).toEqual([
      TTSProvider.ElevenLabs,
      TTSProvider.OpenAI,
      TTSProvider.Groq,
    ]);
  });

  it('has an entry for every SubscriptionTier value', () => {
    const allTiers = Object.values(SubscriptionTier);
    for (const tier of allTiers) {
      expect(TIER_PROVIDER_ORDER[tier]).toBeDefined();
      expect(Array.isArray(TIER_PROVIDER_ORDER[tier])).toBe(true);
      expect(TIER_PROVIDER_ORDER[tier].length).toBeGreaterThan(0);
    }
  });
});
