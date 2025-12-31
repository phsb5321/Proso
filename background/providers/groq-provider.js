/**
 * Groq TTS Provider
 * Implementation of TTSProvider for Groq's text-to-speech API
 * Uses PlayAI Dialog and Orpheus models
 */

import { TTSProvider } from './base-provider.js';
import { createPricingModel, PricingType } from './pricing-model.js';

/**
 * Groq voice definitions
 * PlayAI Dialog voices (ultra-fast TTS)
 */
const GROQ_VOICES = [
  { id: 'Fritz-PlayAI', name: 'Fritz', language: 'en-US', gender: 'male', description: 'Clear and articulate' },
  { id: 'Atlas-PlayAI', name: 'Atlas', language: 'en-US', gender: 'male', description: 'Deep and authoritative' },
  { id: 'Aaliyah-PlayAI', name: 'Aaliyah', language: 'en-US', gender: 'female', description: 'Warm and expressive' },
  { id: 'Adelaide-PlayAI', name: 'Adelaide', language: 'en-US', gender: 'female', description: 'Professional narrator' },
  { id: 'Angelo-PlayAI', name: 'Angelo', language: 'en-US', gender: 'male', description: 'Friendly conversational' },
  { id: 'Arista-PlayAI', name: 'Arista', language: 'en-US', gender: 'female', description: 'Elegant and refined' },
  { id: 'Basil-PlayAI', name: 'Basil', language: 'en-US', gender: 'male', description: 'Calm and measured' },
  { id: 'Briggs-PlayAI', name: 'Briggs', language: 'en-US', gender: 'male', description: 'Strong and confident' },
  { id: 'Calum-PlayAI', name: 'Calum', language: 'en-US', gender: 'male', description: 'Warm storyteller' },
  { id: 'Celeste-PlayAI', name: 'Celeste', language: 'en-US', gender: 'female', description: 'Soft and soothing' },
  { id: 'Cheyenne-PlayAI', name: 'Cheyenne', language: 'en-US', gender: 'female', description: 'Energetic and upbeat' },
  { id: 'Chip-PlayAI', name: 'Chip', language: 'en-US', gender: 'male', description: 'Casual and friendly' },
  { id: 'Cillian-PlayAI', name: 'Cillian', language: 'en-US', gender: 'male', description: 'Thoughtful narrator' },
  { id: 'Deedee-PlayAI', name: 'Deedee', language: 'en-US', gender: 'female', description: 'Bright and cheerful' },
  { id: 'Eleanor-PlayAI', name: 'Eleanor', language: 'en-US', gender: 'female', description: 'Classic storyteller' },
  { id: 'Gail-PlayAI', name: 'Gail', language: 'en-US', gender: 'female', description: 'Mature and wise' },
  { id: 'Indigo-PlayAI', name: 'Indigo', language: 'en-US', gender: 'neutral', description: 'Unique and expressive' },
  { id: 'Jennifer-PlayAI', name: 'Jennifer', language: 'en-US', gender: 'female', description: 'Natural and clear' },
  { id: 'Judy-PlayAI', name: 'Judy', language: 'en-US', gender: 'female', description: 'Friendly and warm' },
  { id: 'Mamaw-PlayAI', name: 'Mamaw', language: 'en-US', gender: 'female', description: 'Comforting and gentle' },
  { id: 'Mason-PlayAI', name: 'Mason', language: 'en-US', gender: 'male', description: 'Professional and clear' },
  { id: 'Mikail-PlayAI', name: 'Mikail', language: 'en-US', gender: 'male', description: 'Dynamic presenter' },
  { id: 'Mitch-PlayAI', name: 'Mitch', language: 'en-US', gender: 'male', description: 'Relaxed and easygoing' },
  { id: 'Nia-PlayAI', name: 'Nia', language: 'en-US', gender: 'female', description: 'Bright and engaging' },
  { id: 'Quinn-PlayAI', name: 'Quinn', language: 'en-US', gender: 'neutral', description: 'Versatile and adaptive' },
  { id: 'Ruby-PlayAI', name: 'Ruby', language: 'en-US', gender: 'female', description: 'Dynamic and vivid' },
  { id: 'Thunder-PlayAI', name: 'Thunder', language: 'en-US', gender: 'male', description: 'Bold and powerful' }
];

/**
 * Model ID for Groq TTS
 * PlayAI Dialog: playai-tts (ultra-fast, 140 chars/sec)
 */
const GROQ_MODEL = 'playai-tts';

export class GroqProvider extends TTSProvider {
  static get id() {
    return 'groq';
  }

  static get name() {
    return 'Groq';
  }

  static get requiresApiKey() {
    return true;
  }

  static get supportsStreaming() {
    return true;
  }

  get pricingModel() {
    // Groq TTS is very affordable - approximately $0.05 per 1000 characters
    return createPricingModel(PricingType.PER_CHARACTER, 0.05, 1000);
  }

  getVoices() {
    return GROQ_VOICES;
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
      // Make a minimal request to check the key
      const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          input: 'test',
          voice: 'Fritz-PlayAI',
          response_format: 'mp3'
        })
      });

      return response.ok;
    } catch (error) {
      console.error('Groq key validation error:', error);
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
      throw new Error('Groq API key not configured');
    }

    // Validate voice ID
    const voiceConfig = GROQ_VOICES.find(v => v.id === voiceId);
    if (!voiceConfig) {
      // Default to Fritz if invalid voice provided
      console.warn(`Invalid Groq voice "${voiceId}", falling back to Fritz-PlayAI`);
      voiceId = 'Fritz-PlayAI';
    }

    const speed = this.clampSpeed(options.speed || 1.0);

    const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
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
   * Groq supports speed similar to OpenAI (0.25 to 4.0)
   * @param {number} speed
   * @returns {number}
   */
  clampSpeed(speed) {
    return Math.max(0.25, Math.min(4.0, speed));
  }

  /**
   * Build error message for Groq specific errors
   * @param {Response} response
   * @param {Object} [errorBody]
   * @returns {string}
   */
  buildErrorMessage(response, errorBody = null) {
    const status = response.status;

    switch (status) {
      case 401:
        return 'Invalid Groq API key. Please check your settings.';
      case 429:
        return 'Rate limited. Groq has generous limits - please wait a moment.';
      case 400:
        return errorBody?.message || 'Invalid request. Please try a different voice.';
      default:
        return errorBody?.message || `Groq API error (${status}). Please try again later.`;
    }
  }
}
