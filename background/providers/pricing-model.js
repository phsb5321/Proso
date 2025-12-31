/**
 * PricingModel Utility
 * Handles cost calculation for TTS providers
 */

/**
 * Pricing type constants
 */
export const PricingType = Object.freeze({
  PER_CHARACTER: 'per_character',
  PER_MINUTE: 'per_minute',
  FREE: 'free'
});

/**
 * Create a pricing model configuration
 * @param {string} type - Pricing type
 * @param {number} rate - Cost per unit
 * @param {number} unit - Characters or seconds per rate
 * @param {string} [currency='USD'] - Currency code
 * @returns {Object}
 */
export function createPricingModel(type, rate, unit, currency = 'USD') {
  return Object.freeze({
    type,
    rate,
    unit,
    currency
  });
}

/**
 * Pre-defined pricing models for known providers
 */
export const ProviderPricing = Object.freeze({
  openai: createPricingModel(PricingType.PER_CHARACTER, 0.015, 1000),
  openaiHd: createPricingModel(PricingType.PER_CHARACTER, 0.030, 1000),
  elevenlabs: createPricingModel(PricingType.PER_CHARACTER, 0.30, 1000),
  cartesia: createPricingModel(PricingType.PER_CHARACTER, 0.05, 1000),
  browser: createPricingModel(PricingType.FREE, 0, 1)
});

/**
 * Calculate cost for text
 * @param {string} text - Text to estimate
 * @param {Object} pricingModel - Pricing model
 * @returns {number} - Cost in USD
 */
export function calculateCost(text, pricingModel) {
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
 * @param {number} cost - Cost in USD
 * @param {string} [currency='USD'] - Currency code
 * @returns {string}
 */
export function formatCost(cost, currency = 'USD') {
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
 * @param {Object} pricingModel - Pricing model
 * @returns {string}
 */
export function getPricingSummary(pricingModel) {
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
