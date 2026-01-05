/**
 * Pricing Model Utility
 * Handles cost calculation for TTS providers
 *
 * @module utils/providers/pricing
 */

import { z } from 'zod';

/**
 * Pricing type enum
 */
export const PricingType = {
  PER_CHARACTER: 'per_character',
  PER_MINUTE: 'per_minute',
  FREE: 'free',
} as const;

export type PricingTypeValue = typeof PricingType[keyof typeof PricingType];

/**
 * Pricing model schema
 */
export const pricingModelSchema = z.object({
  type: z.enum(['per_character', 'per_minute', 'free']),
  rate: z.number().nonnegative(),
  unit: z.number().positive(),
  currency: z.string().default('USD'),
});

export type PricingModel = z.infer<typeof pricingModelSchema>;

/**
 * Create a pricing model configuration
 * @param type - Pricing type
 * @param rate - Cost per unit
 * @param unit - Characters or seconds per rate
 * @param currency - Currency code
 */
export function createPricingModel(
  type: PricingTypeValue,
  rate: number,
  unit: number,
  currency: string = 'USD'
): Readonly<PricingModel> {
  return Object.freeze(
    pricingModelSchema.parse({
      type,
      rate,
      unit,
      currency,
    })
  );
}

/**
 * Pre-defined pricing models for known providers
 */
export const ProviderPricing = Object.freeze({
  openai: createPricingModel(PricingType.PER_CHARACTER, 0.015, 1000),
  openaiHd: createPricingModel(PricingType.PER_CHARACTER, 0.030, 1000),
  elevenlabs: createPricingModel(PricingType.PER_CHARACTER, 0.30, 1000),
  cartesia: createPricingModel(PricingType.PER_CHARACTER, 0.05, 1000),
  groq: createPricingModel(PricingType.FREE, 0, 1), // Groq is free tier
  browser: createPricingModel(PricingType.FREE, 0, 1),
});

/**
 * Calculate cost for text
 * @param text - Text to estimate
 * @param pricingModel - Pricing model
 * @returns Cost in USD
 */
export function calculateCost(text: string, pricingModel: PricingModel): number {
  const { type, rate, unit } = pricingModel;

  if (type === PricingType.FREE) {
    return 0;
  }

  if (type === PricingType.PER_CHARACTER) {
    return (text.length / unit) * rate;
  }

  if (type === PricingType.PER_MINUTE) {
    // Estimate ~150 words per minute, ~5 characters per word
    const wordsPerMinute = 150;
    const charsPerWord = 5;
    const estimatedMinutes = text.length / (wordsPerMinute * charsPerWord);
    return (estimatedMinutes / unit) * rate;
  }

  return 0;
}

/**
 * Format cost for display
 * @param cost - Cost in USD
 * @param currency - Currency code
 * @returns Formatted cost string
 */
export function formatCost(cost: number, currency: string = 'USD'): string {
  if (cost === 0) {
    return 'Free';
  }

  if (cost < 0.01) {
    return '<$0.01';
  }

  // Format with 2 decimal places
  const formatted = cost.toFixed(2);

  switch (currency) {
    case 'USD':
      return `$${formatted}`;
    case 'EUR':
      return `€${formatted}`;
    case 'GBP':
      return `£${formatted}`;
    default:
      return `${formatted} ${currency}`;
  }
}

/**
 * Get pricing summary for UI display
 * @param pricingModel - Pricing model
 * @returns Pricing summary string
 */
export function getPricingSummary(pricingModel: PricingModel): string {
  const { type, rate, unit, currency } = pricingModel;

  if (type === PricingType.FREE) {
    return 'Free';
  }

  const formattedRate = formatCost(rate, currency);

  if (type === PricingType.PER_CHARACTER) {
    return `${formattedRate} per ${unit.toLocaleString()} characters`;
  }

  if (type === PricingType.PER_MINUTE) {
    return `${formattedRate} per minute`;
  }

  return 'Unknown pricing';
}
