/**
 * Cost Estimator Unit Tests
 * Tests for the cost estimation service (028-smart-audio-cache Phase 7 - US5)
 *
 * @module tests/unit/cache/cost-estimator.test
 */

import {
  PROVIDER_PRICING,
  getProviderPricing,
  calculateTextCost,
  formatCost,
  formatSavings,
  createCumulativeSavings,
  recordCacheHit,
  type CumulativeSavings,
} from '../../../src/utils/cache/cost-estimator';

describe('Cost Estimator', () => {
  // ============================================================================
  // Provider Pricing Tests
  // ============================================================================

  describe('PROVIDER_PRICING', () => {
    it('should have pricing for all major providers', () => {
      expect(PROVIDER_PRICING).toHaveProperty('openai');
      expect(PROVIDER_PRICING).toHaveProperty('elevenlabs');
      expect(PROVIDER_PRICING).toHaveProperty('groq');
      expect(PROVIDER_PRICING).toHaveProperty('cartesia');
      expect(PROVIDER_PRICING).toHaveProperty('browser');
    });

    it('should have required properties for each provider', () => {
      Object.values(PROVIDER_PRICING).forEach((pricing) => {
        expect(pricing).toHaveProperty('pricePerKiloChar');
        expect(pricing).toHaveProperty('name');
        expect(typeof pricing.pricePerKiloChar).toBe('number');
        expect(typeof pricing.name).toBe('string');
      });
    });

    it('should have non-negative pricing', () => {
      Object.values(PROVIDER_PRICING).forEach((pricing) => {
        expect(pricing.pricePerKiloChar).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have browser TTS as free', () => {
      expect(PROVIDER_PRICING.browser.pricePerKiloChar).toBe(0);
    });

    it('should have groq as free (free tier)', () => {
      expect(PROVIDER_PRICING.groq.pricePerKiloChar).toBe(0);
    });
  });

  describe('getProviderPricing', () => {
    it('should return pricing for known providers', () => {
      const openaiPricing = getProviderPricing('openai');
      expect(openaiPricing.pricePerKiloChar).toBe(0.015);
      expect(openaiPricing.name).toBe('OpenAI TTS');
    });

    it('should return browser pricing for unknown providers', () => {
      const unknownPricing = getProviderPricing('unknown-provider');
      expect(unknownPricing.pricePerKiloChar).toBe(0);
      expect(unknownPricing.name).toBe('Browser TTS');
    });

    it('should handle empty provider string', () => {
      const emptyPricing = getProviderPricing('');
      expect(emptyPricing.pricePerKiloChar).toBe(0);
    });
  });

  // ============================================================================
  // Cost Calculation Tests
  // ============================================================================

  describe('calculateTextCost', () => {
    it('should calculate cost for OpenAI correctly', () => {
      // 1000 characters at $0.015 per 1K chars = $0.015
      const cost = calculateTextCost('a'.repeat(1000), 'openai');
      expect(cost).toBeCloseTo(0.015, 5);
    });

    it('should calculate cost for ElevenLabs correctly', () => {
      // 1000 characters at $0.18 per 1K chars = $0.18
      const cost = calculateTextCost('a'.repeat(1000), 'elevenlabs');
      expect(cost).toBeCloseTo(0.18, 5);
    });

    it('should return 0 for free providers', () => {
      const browserCost = calculateTextCost('a'.repeat(1000), 'browser');
      expect(browserCost).toBe(0);

      const groqCost = calculateTextCost('a'.repeat(1000), 'groq');
      expect(groqCost).toBe(0);
    });

    it('should calculate proportionally for different text lengths', () => {
      const cost500 = calculateTextCost('a'.repeat(500), 'openai');
      const cost1000 = calculateTextCost('a'.repeat(1000), 'openai');
      const cost2000 = calculateTextCost('a'.repeat(2000), 'openai');

      expect(cost500).toBeCloseTo(cost1000 / 2, 5);
      expect(cost2000).toBeCloseTo(cost1000 * 2, 5);
    });

    it('should handle empty text', () => {
      const cost = calculateTextCost('', 'openai');
      expect(cost).toBe(0);
    });

    it('should handle very long text', () => {
      // 1 million characters
      const cost = calculateTextCost('a'.repeat(1000000), 'openai');
      expect(cost).toBeCloseTo(15, 2); // $15 for 1M chars at $0.015/1K
    });
  });

  // ============================================================================
  // Format Functions Tests
  // ============================================================================

  describe('formatCost', () => {
    it('should format zero as "Free"', () => {
      expect(formatCost(0)).toBe('Free');
    });

    it('should format very small amounts as "<$0.01"', () => {
      expect(formatCost(0.001)).toBe('<$0.01');
      expect(formatCost(0.009)).toBe('<$0.01');
    });

    it('should format normal amounts with 2 decimal places', () => {
      expect(formatCost(0.01)).toBe('$0.01');
      expect(formatCost(0.15)).toBe('$0.15');
      expect(formatCost(1.23)).toBe('$1.23');
      expect(formatCost(10.50)).toBe('$10.50');
    });

    it('should handle exact cent boundaries', () => {
      expect(formatCost(0.01)).toBe('$0.01');
      expect(formatCost(0.02)).toBe('$0.02');
    });
  });

  describe('formatSavings', () => {
    it('should format zero savings as "No cached audio"', () => {
      expect(formatSavings(0, 0)).toBe('No cached audio');
    });

    it('should format savings with percentage', () => {
      expect(formatSavings(0.50, 50)).toBe('$0.50 saved (50%)');
      expect(formatSavings(1.23, 75)).toBe('$1.23 saved (75%)');
    });

    it('should round percentage to nearest integer', () => {
      expect(formatSavings(0.50, 33.33)).toBe('$0.50 saved (33%)');
      expect(formatSavings(0.50, 66.67)).toBe('$0.50 saved (67%)');
    });

    it('should handle 100% savings', () => {
      expect(formatSavings(5.00, 100)).toBe('$5.00 saved (100%)');
    });

    it('should handle small savings amounts', () => {
      expect(formatSavings(0.001, 10)).toBe('<$0.01 saved (10%)');
    });
  });

  // ============================================================================
  // Cumulative Savings Tests
  // ============================================================================

  describe('createCumulativeSavings', () => {
    it('should create initial cumulative savings with zeros', () => {
      const savings = createCumulativeSavings();

      expect(savings.totalCacheHits).toBe(0);
      expect(savings.totalCharactersSaved).toBe(0);
      expect(savings.estimatedSavings).toBe(0);
      expect(savings.byProvider).toEqual({});
    });
  });

  describe('recordCacheHit', () => {
    it('should record a single cache hit', () => {
      const initial = createCumulativeSavings();
      const updated = recordCacheHit(initial, 'openai', 1000);

      expect(updated.totalCacheHits).toBe(1);
      expect(updated.totalCharactersSaved).toBe(1000);
      expect(updated.estimatedSavings).toBeCloseTo(0.015, 5);
      expect(updated.byProvider.openai.hits).toBe(1);
      expect(updated.byProvider.openai.savings).toBeCloseTo(0.015, 5);
    });

    it('should accumulate multiple cache hits', () => {
      let savings = createCumulativeSavings();
      savings = recordCacheHit(savings, 'openai', 1000);
      savings = recordCacheHit(savings, 'openai', 2000);
      savings = recordCacheHit(savings, 'openai', 500);

      expect(savings.totalCacheHits).toBe(3);
      expect(savings.totalCharactersSaved).toBe(3500);
      expect(savings.estimatedSavings).toBeCloseTo(0.0525, 5); // 3500 chars * $0.015/1K
      expect(savings.byProvider.openai.hits).toBe(3);
    });

    it('should track multiple providers separately', () => {
      let savings = createCumulativeSavings();
      savings = recordCacheHit(savings, 'openai', 1000);
      savings = recordCacheHit(savings, 'elevenlabs', 1000);
      savings = recordCacheHit(savings, 'openai', 500);

      expect(savings.totalCacheHits).toBe(3);
      expect(savings.byProvider.openai.hits).toBe(2);
      expect(savings.byProvider.elevenlabs.hits).toBe(1);
      expect(savings.byProvider.openai.savings).toBeCloseTo(0.0225, 5); // 1500 * $0.015/1K
      expect(savings.byProvider.elevenlabs.savings).toBeCloseTo(0.18, 5); // 1000 * $0.18/1K
    });

    it('should handle free providers (no savings)', () => {
      let savings = createCumulativeSavings();
      savings = recordCacheHit(savings, 'browser', 10000);

      expect(savings.totalCacheHits).toBe(1);
      expect(savings.totalCharactersSaved).toBe(10000);
      expect(savings.estimatedSavings).toBe(0);
      expect(savings.byProvider.browser.savings).toBe(0);
    });

    it('should not mutate original savings object', () => {
      const original = createCumulativeSavings();
      const updated = recordCacheHit(original, 'openai', 1000);

      expect(original.totalCacheHits).toBe(0);
      expect(original.totalCharactersSaved).toBe(0);
      expect(updated.totalCacheHits).toBe(1);
    });

    it('should handle unknown providers gracefully', () => {
      let savings = createCumulativeSavings();
      savings = recordCacheHit(savings, 'unknown-provider', 1000);

      expect(savings.totalCacheHits).toBe(1);
      expect(savings.byProvider['unknown-provider'].hits).toBe(1);
      expect(savings.byProvider['unknown-provider'].savings).toBe(0); // Falls back to browser (free)
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe('edge cases', () => {
    it('should handle negative character counts gracefully', () => {
      const savings = createCumulativeSavings();
      // This shouldn't happen in practice, but testing defensive behavior
      const updated = recordCacheHit(savings, 'openai', -100);

      expect(updated.totalCharactersSaved).toBe(-100);
    });

    it('should handle very large character counts', () => {
      const savings = createCumulativeSavings();
      const updated = recordCacheHit(savings, 'elevenlabs', 10000000); // 10M chars

      expect(updated.totalCharactersSaved).toBe(10000000);
      expect(updated.estimatedSavings).toBeCloseTo(1800, 1); // $1800 for 10M chars at $0.18/1K
    });

    it('should handle floating point precision in cost calculations', () => {
      // Test that we don't accumulate floating point errors
      let savings = createCumulativeSavings();

      for (let i = 0; i < 100; i++) {
        savings = recordCacheHit(savings, 'openai', 1000);
      }

      // 100 * 1000 chars * $0.015/1K = $1.50
      expect(savings.estimatedSavings).toBeCloseTo(1.50, 2);
    });
  });
});
