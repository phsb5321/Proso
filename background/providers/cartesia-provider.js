/**
 * Cartesia TTS Provider
 * Implementation of TTSProvider for Cartesia's text-to-speech API
 */

import { TTSProvider } from './base-provider.js';
import { ProviderPricing } from './pricing-model.js';
import { LanguageNotSupportedError } from '../../shared/errors/language-errors.js';

/**
 * Cartesia voice definitions with their API UUIDs
 */
const CARTESIA_VOICES = [
  { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Barbershop Man', language: 'en', gender: 'male', description: 'American, conversational' },
  { id: '156fb8d2-335b-4950-9cb3-a2d33befec77', name: 'Friendly Sidekick', language: 'en', gender: 'neutral', description: 'Animated, enthusiastic' },
  { id: '5619d38c-cf51-4d8e-9575-48f61a280413', name: 'Sweet Lady', language: 'en', gender: 'female', description: 'Warm, nurturing' },
  { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'Sportsman', language: 'en', gender: 'male', description: 'Energetic, confident' },
  { id: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', name: 'Storyteller', language: 'en', gender: 'neutral', description: 'Engaging narrator' }
];

/**
 * Cartesia API version header value
 */
const CARTESIA_API_VERSION = '2025-04-16';

export class CartesiaProvider extends TTSProvider {
  static get id() {
    return 'cartesia';
  }

  static get name() {
    return 'Cartesia';
  }

  static get requiresApiKey() {
    return true;
  }

  static get supportsStreaming() {
    return true;
  }

  /**
   * Cartesia TTS supports English only (019-multilingual-tts)
   * @returns {string[]}
   */
  static get supportedLanguages() {
    return ['en'];
  }

  get pricingModel() {
    return ProviderPricing.cartesia;
  }

  getVoices() {
    return CARTESIA_VOICES;
  }

  /**
   * Validate API key
   * @returns {Promise<boolean>}
   */
  async validateKey() {
    if (!this.hasApiKey()) {
      return false;
    }

    try {
      // Check voices endpoint to validate key
      const response = await fetch('https://api.cartesia.ai/voices', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          'Cartesia-Version': CARTESIA_API_VERSION
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Cartesia key validation error:', error);
      return false;
    }
  }

  /**
   * Generate audio from text
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier (UUID)
   * @param {Object} [options] - Generation options
   * @returns {Promise<ArrayBuffer>}
   */
  async generateAudio(text, voiceId, options = {}) {
    if (!this.hasApiKey()) {
      throw new Error('Cartesia API key not configured');
    }

    // Check language support (019-multilingual-tts)
    if (options.languageCode && !this.supportsLanguage(options.languageCode)) {
      throw new LanguageNotSupportedError(
        options.languageCode,
        'cartesia',
        ['elevenlabs', 'openai', 'browser']
      );
    }

    const speed = this.clampSpeed(options.speed || 1.0);

    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Cartesia-Version': CARTESIA_API_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_id: 'sonic-2024-12-12',
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceId
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 24000
        },
        generation_config: {
          speed: speed
        }
      })
    });

    if (!response.ok) {
      let errorBody = null;
      try {
        errorBody = await response.json();
      } catch {
        // Ignore parse error
      }
      throw new Error(this.buildErrorMessage(response, errorBody));
    }

    return await response.arrayBuffer();
  }

  /**
   * Cartesia supports speed from 0.6 to 1.5 (narrower range than others)
   * @param {number} speed
   * @returns {number}
   */
  clampSpeed(speed) {
    return Math.max(0.6, Math.min(1.5, speed));
  }

  /**
   * Build error message for Cartesia specific errors
   * @param {Response} response
   * @param {Object} [errorBody]
   * @returns {string}
   */
  buildErrorMessage(response, errorBody = null) {
    const status = response.status;

    switch (status) {
      case 401:
        return 'Invalid Cartesia API key. Please check your settings.';
      case 400:
        return errorBody?.message || 'Invalid request. Please check voice ID and parameters.';
      case 429:
        return 'Rate limited. Please wait and try again.';
      default:
        return errorBody?.message || `Cartesia API error (${status}). Please try again later.`;
    }
  }
}
