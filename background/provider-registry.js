/**
 * Provider Registry
 * Manages TTS provider instances and provides lookup functionality
 */

import { OpenAIProvider } from './providers/openai-provider.js';
import { ElevenLabsProvider } from './providers/elevenlabs-provider.js';
import { CartesiaProvider } from './providers/cartesia-provider.js';
import { GroqProvider } from './providers/groq-provider.js';
import { BrowserProvider } from './providers/browser-provider.js';
import { ProviderId, StorageKey } from './constants.js';

/**
 * Registry of all available TTS providers
 */
class ProviderRegistry {
  constructor() {
    /** @type {Map<string, TTSProvider>} */
    this._providers = new Map();
    this._initialized = false;
  }

  /**
   * Initialize the registry with all available providers
   */
  async initialize() {
    if (this._initialized) return;

    // Load API keys from storage
    const storage = await browser.storage.local.get([
      StorageKey.API_KEY_OPENAI,
      StorageKey.API_KEY_ELEVENLABS,
      StorageKey.API_KEY_CARTESIA,
      StorageKey.API_KEY_GROQ
    ]);

    // Register OpenAI provider
    const openaiProvider = new OpenAIProvider(storage[StorageKey.API_KEY_OPENAI] || null);
    this._providers.set(OpenAIProvider.id, openaiProvider);

    // Register ElevenLabs provider
    const elevenlabsProvider = new ElevenLabsProvider(storage[StorageKey.API_KEY_ELEVENLABS] || null);
    this._providers.set(ElevenLabsProvider.id, elevenlabsProvider);

    // Register Cartesia provider
    const cartesiaProvider = new CartesiaProvider(storage[StorageKey.API_KEY_CARTESIA] || null);
    this._providers.set(CartesiaProvider.id, cartesiaProvider);

    // Register Groq provider
    const groqProvider = new GroqProvider(storage[StorageKey.API_KEY_GROQ] || null);
    this._providers.set(GroqProvider.id, groqProvider);

    // Register Browser TTS provider (no API key needed)
    const browserProvider = new BrowserProvider();
    this._providers.set(BrowserProvider.id, browserProvider);

    this._initialized = true;
    console.log('Provider registry initialized with providers:', Array.from(this._providers.keys()));
  }

  /**
   * Get a provider by ID
   * @param {string} providerId
   * @returns {TTSProvider|null}
   */
  getProvider(providerId) {
    return this._providers.get(providerId) || null;
  }

  /**
   * Get all registered providers
   * @returns {TTSProvider[]}
   */
  getAllProviders() {
    return Array.from(this._providers.values());
  }

  /**
   * Get all provider IDs
   * @returns {string[]}
   */
  getProviderIds() {
    return Array.from(this._providers.keys());
  }

  /**
   * Check if a provider exists
   * @param {string} providerId
   * @returns {boolean}
   */
  hasProvider(providerId) {
    return this._providers.has(providerId);
  }

  /**
   * Register a new provider
   * @param {TTSProvider} provider
   */
  registerProvider(provider) {
    const id = provider.constructor.id;
    this._providers.set(id, provider);
    console.log('Registered provider:', id);
  }

  /**
   * Update API key for a provider
   * @param {string} providerId
   * @param {string} apiKey
   */
  updateApiKey(providerId, apiKey) {
    const provider = this.getProvider(providerId);
    if (provider) {
      provider.setApiKey(apiKey);
    }
  }

  /**
   * Get provider info for UI display
   * @returns {Object[]}
   */
  getProviderInfo() {
    return this.getAllProviders().map(provider => ({
      id: provider.constructor.id,
      name: provider.constructor.name,
      requiresApiKey: provider.constructor.requiresApiKey,
      hasApiKey: provider.hasApiKey(),
      voices: provider.getVoices(),
      pricingModel: provider.pricingModel
    }));
  }

  /**
   * Find first available provider (has API key or doesn't require one)
   * @returns {TTSProvider|null}
   */
  getFirstAvailableProvider() {
    for (const provider of this._providers.values()) {
      if (!provider.constructor.requiresApiKey || provider.hasApiKey()) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Get the default provider (browser TTS when available, otherwise first available)
   * @returns {TTSProvider|null}
   */
  getDefaultProvider() {
    // Prefer browser provider as it doesn't require API key
    const browserProvider = this.getProvider(ProviderId.BROWSER);
    if (browserProvider) {
      return browserProvider;
    }

    return this.getFirstAvailableProvider();
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();

// Listen for storage changes to update API keys dynamically
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  // Map storage keys to provider IDs
  const keyToProvider = {
    [StorageKey.API_KEY_OPENAI]: ProviderId.OPENAI,
    [StorageKey.API_KEY_ELEVENLABS]: ProviderId.ELEVENLABS,
    [StorageKey.API_KEY_CARTESIA]: ProviderId.CARTESIA,
    [StorageKey.API_KEY_GROQ]: ProviderId.GROQ
  };

  for (const [storageKey, providerId] of Object.entries(keyToProvider)) {
    if (changes[storageKey]) {
      const newValue = changes[storageKey].newValue || null;
      providerRegistry.updateApiKey(providerId, newValue);
      console.log(`Updated API key for provider: ${providerId}`);
    }
  }
});
