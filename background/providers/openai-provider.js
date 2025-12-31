/**
 * OpenAI TTS Provider
 * Implementation of TTSProvider for OpenAI's text-to-speech API
 */

import { TTSProvider } from './base-provider.js';
import { ProviderPricing } from './pricing-model.js';

/**
 * OpenAI voice definitions
 */
const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral', description: 'Neutral, balanced' },
  { id: 'echo', name: 'Echo', language: 'en-US', gender: 'male', description: 'Warm, conversational' },
  { id: 'fable', name: 'Fable', language: 'en-GB', gender: 'neutral', description: 'British, expressive' },
  { id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male', description: 'Deep, authoritative' },
  { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female', description: 'Friendly, upbeat' },
  { id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female', description: 'Soft, gentle' }
];

export class OpenAIProvider extends TTSProvider {
  static get id() {
    return 'openai';
  }

  static get name() {
    return 'OpenAI';
  }

  static get requiresApiKey() {
    return true;
  }

  static get supportsStreaming() {
    return true;
  }

  get pricingModel() {
    return ProviderPricing.openai;
  }

  getVoices() {
    return OPENAI_VOICES;
  }

  /**
   * Validate API key by making a minimal request
   * @returns {Promise<boolean>}
   */
  async validateKey() {
    if (!this.hasApiKey()) {
      return false;
    }

    try {
      // Make a minimal request to check the key
      // We'll use a very short text to minimize cost
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: 'test',
          voice: 'alloy'
        })
      });

      return response.ok;
    } catch (error) {
      console.error('OpenAI key validation error:', error);
      return false;
    }
  }

  /**
   * Generate audio from text
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier
   * @param {Object} [options] - Generation options
   * @returns {Promise<ArrayBuffer>}
   */
  async generateAudio(text, voiceId, options = {}) {
    if (!this.hasApiKey()) {
      throw new Error('OpenAI API key not configured');
    }

    const speed = this.clampSpeed(options.speed || 1.0);
    const model = options.hd ? 'tts-1-hd' : 'tts-1';

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        input: text,
        voice: voiceId,
        response_format: 'mp3',
        speed: speed
      })
    });

    if (!response.ok) {
      let errorBody = null;
      try {
        errorBody = await response.json();
      } catch {
        // Ignore parse error
      }
      throw new Error(this.buildErrorMessage(response, errorBody?.error));
    }

    return await response.arrayBuffer();
  }

  /**
   * OpenAI supports speed from 0.25 to 4.0
   * @param {number} speed
   * @returns {number}
   */
  clampSpeed(speed) {
    return Math.max(0.25, Math.min(4.0, speed));
  }

  /**
   * Estimate cost with HD option
   * @param {string} text
   * @param {boolean} [hd=false]
   * @returns {number}
   */
  estimateCost(text, hd = false) {
    const pricing = hd ? ProviderPricing.openaiHd : ProviderPricing.openai;
    return (text.length / pricing.unit) * pricing.rate;
  }
}
