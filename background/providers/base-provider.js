/**
 * TTSProvider Base Class
 * Abstract base class defining the interface for all TTS providers
 */

/**
 * @typedef {Object} Voice
 * @property {string} id - Provider-specific voice identifier
 * @property {string} name - Display name
 * @property {string} language - BCP-47 language code
 * @property {string} [gender] - Voice gender hint
 * @property {string} [description] - Voice characteristics
 */

/**
 * @typedef {Object} PricingModel
 * @property {string} type - 'per_character' | 'per_minute' | 'free'
 * @property {number} rate - Cost per unit
 * @property {number} unit - Characters or seconds per rate
 * @property {string} currency - Currency code
 */

/**
 * @typedef {Object} GenerateOptions
 * @property {number} [speed] - Playback speed (0.5-2.0)
 * @property {boolean} [hd] - Use high-definition model
 * @property {string} [languageCode] - ISO 639-1 or BCP 47 language code (019-multilingual-tts)
 */

export class TTSProvider {
  /**
   * @param {string} apiKey - API key for authentication
   */
  constructor(apiKey = null) {
    if (new.target === TTSProvider) {
      throw new Error('TTSProvider is abstract and cannot be instantiated directly');
    }
    this._apiKey = apiKey;
  }

  /**
   * Provider identifier (e.g., 'openai', 'elevenlabs')
   * @returns {string}
   */
  static get id() {
    throw new Error('Subclass must implement static id getter');
  }

  /**
   * Display name for UI
   * @returns {string}
   */
  static get name() {
    throw new Error('Subclass must implement static name getter');
  }

  /**
   * Whether this provider requires an API key
   * @returns {boolean}
   */
  static get requiresApiKey() {
    return true;
  }

  /**
   * Whether this provider supports streaming
   * @returns {boolean}
   */
  static get supportsStreaming() {
    return true;
  }

  /**
   * Returns array of supported ISO 639-1 language codes (019-multilingual-tts)
   * Return ['*'] to indicate all languages supported (auto-detect).
   * Return ['en'] for English-only providers.
   * @returns {string[]}
   */
  static get supportedLanguages() {
    return ['en']; // Default to English only
  }

  /**
   * Get the provider's pricing model
   * @returns {PricingModel}
   */
  get pricingModel() {
    throw new Error('Subclass must implement pricingModel getter');
  }

  /**
   * Get available voices for this provider
   * @returns {Voice[]}
   */
  getVoices() {
    throw new Error('Subclass must implement getVoices()');
  }

  /**
   * Get the default voice for this provider
   * @returns {Voice}
   */
  getDefaultVoice() {
    const voices = this.getVoices();
    return voices[0] || null;
  }

  /**
   * Set the API key
   * @param {string} apiKey
   */
  setApiKey(apiKey) {
    this._apiKey = apiKey;
  }

  /**
   * Check if API key is configured
   * @returns {boolean}
   */
  hasApiKey() {
    return !!this._apiKey && this._apiKey.trim().length > 0;
  }

  /**
   * Check if provider supports a specific language (019-multilingual-tts)
   * @param {string} languageCode - ISO 639-1 or BCP 47 code
   * @returns {boolean}
   */
  supportsLanguage(languageCode) {
    const supported = this.constructor.supportedLanguages;

    // '*' means all languages supported (auto-detect)
    if (supported.includes('*')) return true;

    // Normalize to primary language code
    const primary = languageCode.split('-')[0].toLowerCase();
    return supported.includes(primary);
  }

  /**
   * Validate the API key by making a test request
   * @returns {Promise<boolean>}
   */
  async validateKey() {
    throw new Error('Subclass must implement validateKey()');
  }

  /**
   * Generate audio from text
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier
   * @param {GenerateOptions} [options] - Generation options
   * @returns {Promise<ArrayBuffer>} - Audio data
   */
  async generateAudio(text, voiceId, options = {}) {
    throw new Error('Subclass must implement generateAudio()');
  }

  /**
   * Estimate cost for generating audio
   * @param {string} text - Text to estimate
   * @returns {number} - Estimated cost in USD
   */
  estimateCost(text) {
    const { type, rate, unit } = this.pricingModel;
    if (type === 'free') return 0;
    if (type === 'per_character') {
      return (text.length / unit) * rate;
    }
    // For per_minute, estimate ~150 words per minute, ~5 chars per word
    const estimatedMinutes = text.length / (150 * 5);
    return (estimatedMinutes / unit) * rate;
  }

  /**
   * Format cost for display
   * @param {number} cost - Cost in USD
   * @returns {string}
   */
  formatCost(cost) {
    if (cost === 0) return 'Free';
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(2)}`;
  }

  /**
   * Clamp speed to provider's supported range
   * @param {number} speed - Requested speed
   * @returns {number} - Clamped speed
   */
  clampSpeed(speed) {
    // Default range, subclasses can override
    return Math.max(0.5, Math.min(2.0, speed));
  }

  /**
   * Build error message for API errors
   * @param {Response} response - Fetch response
   * @param {Object} [errorBody] - Parsed error body
   * @returns {string}
   */
  buildErrorMessage(response, errorBody = null) {
    const status = response.status;

    switch (status) {
      case 401:
        return 'Invalid API key. Please check your settings.';
      case 429:
        return 'Rate limited. Please wait and try again.';
      case 400:
        return errorBody?.message || 'Invalid request. Please try again.';
      default:
        return errorBody?.message || `API error (${status}). Please try again later.`;
    }
  }
}
