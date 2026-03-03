/**
 * Unit tests for pricing model utility
 * @module tests/unit/providers/pricing
 */

import { describe, it, expect } from '@jest/globals';
import {
  PricingType,
  createPricingModel,
  ProviderPricing,
  calculateCost,
  formatCost,
  getPricingSummary,
  pricingModelSchema,
} from '../../../src/utils/providers/pricing';
import type { PricingModel } from '../../../src/utils/providers/pricing';

describe('Pricing Model Utility', () => {
  describe('PricingType', () => {
    it('has correct enum values', () => {
      expect(PricingType.PER_CHARACTER).toBe('per_character');
      expect(PricingType.PER_MINUTE).toBe('per_minute');
      expect(PricingType.FREE).toBe('free');
    });
  });

  describe('pricingModelSchema', () => {
    it('validates a valid per_character model', () => {
      const result = pricingModelSchema.safeParse({
        type: 'per_character',
        rate: 0.015,
        unit: 1000,
        currency: 'USD',
      });
      expect(result.success).toBe(true);
    });

    it('validates with default currency', () => {
      const result = pricingModelSchema.safeParse({
        type: 'free',
        rate: 0,
        unit: 1,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD');
      }
    });

    it('rejects negative rate', () => {
      const result = pricingModelSchema.safeParse({
        type: 'per_character',
        rate: -1,
        unit: 1000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero unit', () => {
      const result = pricingModelSchema.safeParse({
        type: 'per_character',
        rate: 0.01,
        unit: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid type', () => {
      const result = pricingModelSchema.safeParse({
        type: 'invalid',
        rate: 0,
        unit: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createPricingModel', () => {
    it('creates a frozen pricing model', () => {
      const model = createPricingModel(PricingType.PER_CHARACTER, 0.015, 1000);
      expect(model.type).toBe('per_character');
      expect(model.rate).toBe(0.015);
      expect(model.unit).toBe(1000);
      expect(model.currency).toBe('USD');
      expect(Object.isFrozen(model)).toBe(true);
    });

    it('creates a free pricing model', () => {
      const model = createPricingModel(PricingType.FREE, 0, 1);
      expect(model.type).toBe('free');
      expect(model.rate).toBe(0);
    });

    it('creates with custom currency', () => {
      const model = createPricingModel(PricingType.PER_MINUTE, 5.0, 1, 'EUR');
      expect(model.currency).toBe('EUR');
    });
  });

  describe('ProviderPricing', () => {
    it('has pricing for all providers', () => {
      expect(ProviderPricing.elevenlabs).toBeDefined();
      expect(ProviderPricing.openai).toBeDefined();
      expect(ProviderPricing.groq).toBeDefined();
      expect(ProviderPricing.cartesia).toBeDefined();
    });

    it('groq is free', () => {
      expect(ProviderPricing.groq.type).toBe('free');
    });

    it('elevenlabs is per_character', () => {
      expect(ProviderPricing.elevenlabs.type).toBe('per_character');
      expect(ProviderPricing.elevenlabs.rate).toBe(0.3);
      expect(ProviderPricing.elevenlabs.unit).toBe(1000);
    });

    it('openai is per_character', () => {
      expect(ProviderPricing.openai.type).toBe('per_character');
      expect(ProviderPricing.openai.rate).toBe(0.015);
    });

    it('cartesia is per_character', () => {
      expect(ProviderPricing.cartesia.type).toBe('per_character');
      expect(ProviderPricing.cartesia.rate).toBe(0.05);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(ProviderPricing)).toBe(true);
    });
  });

  describe('calculateCost', () => {
    it('returns 0 for free pricing', () => {
      expect(calculateCost('hello world', ProviderPricing.groq)).toBe(0);
    });

    it('calculates per-character cost correctly', () => {
      const text = 'a'.repeat(1000); // 1000 characters
      const cost = calculateCost(text, ProviderPricing.openai);
      expect(cost).toBeCloseTo(0.015); // $0.015 per 1000 chars
    });

    it('calculates elevenlabs cost correctly', () => {
      const text = 'a'.repeat(1000);
      const cost = calculateCost(text, ProviderPricing.elevenlabs);
      expect(cost).toBeCloseTo(0.3); // $0.30 per 1000 chars
    });

    it('calculates cartesia cost correctly', () => {
      const text = 'a'.repeat(2000);
      const cost = calculateCost(text, ProviderPricing.cartesia);
      expect(cost).toBeCloseTo(0.1); // $0.05 per 1000 chars * 2
    });

    it('scales linearly with text length', () => {
      const shortText = 'a'.repeat(500);
      const longText = 'a'.repeat(1000);
      const shortCost = calculateCost(shortText, ProviderPricing.openai);
      const longCost = calculateCost(longText, ProviderPricing.openai);
      expect(longCost).toBeCloseTo(shortCost * 2);
    });

    it('returns 0 for empty text with paid provider', () => {
      expect(calculateCost('', ProviderPricing.openai)).toBe(0);
    });

    it('calculates per-minute cost correctly', () => {
      const perMinute: PricingModel = {
        type: 'per_minute',
        rate: 0.06,
        unit: 1,
        currency: 'USD',
      };
      // 750 chars ≈ 150 words ≈ 1 minute
      const text = 'a'.repeat(750);
      const cost = calculateCost(text, perMinute);
      expect(cost).toBeCloseTo(0.06);
    });

    it('returns 0 for unknown pricing type', () => {
      const unknown = { type: 'unknown' as 'free', rate: 1, unit: 1, currency: 'USD' };
      expect(calculateCost('text', unknown)).toBe(0);
    });
  });

  describe('formatCost', () => {
    it('returns "Free" for zero cost', () => {
      expect(formatCost(0)).toBe('Free');
    });

    it('returns "<$0.01" for very small costs', () => {
      expect(formatCost(0.001)).toBe('<$0.01');
      expect(formatCost(0.009)).toBe('<$0.01');
    });

    it('formats USD correctly', () => {
      expect(formatCost(1.5)).toBe('$1.50');
      expect(formatCost(0.15)).toBe('$0.15');
      expect(formatCost(10)).toBe('$10.00');
    });

    it('formats EUR correctly', () => {
      expect(formatCost(1.5, 'EUR')).toBe('€1.50');
    });

    it('formats GBP correctly', () => {
      expect(formatCost(1.5, 'GBP')).toBe('£1.50');
    });

    it('formats unknown currency with code suffix', () => {
      expect(formatCost(1.5, 'JPY')).toBe('1.50 JPY');
    });

    it('defaults to USD', () => {
      expect(formatCost(5)).toBe('$5.00');
    });
  });

  describe('getPricingSummary', () => {
    it('returns "Free" for free providers', () => {
      expect(getPricingSummary(ProviderPricing.groq)).toBe('Free');
    });

    it('returns per-character summary', () => {
      expect(getPricingSummary(ProviderPricing.openai)).toBe('$0.01 per 1,000 characters');
    });

    it('returns per-minute summary', () => {
      const perMinute: PricingModel = {
        type: 'per_minute',
        rate: 0.06,
        unit: 1,
        currency: 'USD',
      };
      expect(getPricingSummary(perMinute)).toBe('$0.06 per minute');
    });

    it('returns "Unknown pricing" for unknown type', () => {
      const unknown = { type: 'unknown' as 'free', rate: 1, unit: 1, currency: 'USD' };
      expect(getPricingSummary(unknown)).toBe('Unknown pricing');
    });
  });
});
