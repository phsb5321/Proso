/**
 * Cost Estimator Module
 * Provides cost estimation for TTS providers
 */

import { providerRegistry } from './provider-registry.js';
import { calculateCost, formatCost } from './providers/pricing-model.js';

/**
 * Estimate the cost for generating audio from text
 * @param {string} text - Text to estimate
 * @param {string} providerId - Provider identifier
 * @returns {Object} - Cost estimate with raw and formatted values
 */
export function estimateCost(text, providerId) {
  const provider = providerRegistry.getProvider(providerId);

  if (!provider) {
    return {
      raw: 0,
      formatted: 'Unknown provider',
      characters: text.length
    };
  }

  const pricingModel = provider.pricingModel;
  const cost = calculateCost(text, pricingModel);

  return {
    raw: cost,
    formatted: formatCost(cost, pricingModel.currency),
    characters: text.length,
    provider: providerId,
    pricingType: pricingModel.type
  };
}

/**
 * Compare costs across multiple providers
 * @param {string} text - Text to estimate
 * @param {string[]} [providerIds] - Provider IDs to compare (defaults to all)
 * @returns {Object[]} - Array of cost estimates sorted by cost
 */
export function compareCosts(text, providerIds = null) {
  const ids = providerIds || providerRegistry.getProviderIds();
  const estimates = ids.map(id => estimateCost(text, id));

  // Sort by raw cost (ascending)
  return estimates.sort((a, b) => a.raw - b.raw);
}

/**
 * Get the cheapest provider for given text
 * @param {string} text - Text to estimate
 * @param {boolean} [requireApiKey=false] - Only consider providers with API key configured
 * @returns {Object|null} - Cheapest provider estimate or null
 */
export function getCheapestProvider(text, requireApiKey = false) {
  const providers = providerRegistry.getAllProviders();

  let cheapest = null;
  let lowestCost = Infinity;

  for (const provider of providers) {
    // Skip if API key required but not configured
    if (requireApiKey && provider.constructor.requiresApiKey && !provider.hasApiKey()) {
      continue;
    }

    const estimate = estimateCost(text, provider.constructor.id);

    if (estimate.raw < lowestCost) {
      lowestCost = estimate.raw;
      cheapest = estimate;
    }
  }

  return cheapest;
}

/**
 * Get a human-readable cost summary
 * @param {string} text - Text to estimate
 * @param {string} providerId - Provider identifier
 * @returns {string} - Human-readable cost summary
 */
export function getCostSummary(text, providerId) {
  const estimate = estimateCost(text, providerId);

  if (estimate.pricingType === 'free') {
    return 'Free (no cost)';
  }

  const charCount = estimate.characters.toLocaleString();
  return `${estimate.formatted} for ${charCount} characters`;
}
