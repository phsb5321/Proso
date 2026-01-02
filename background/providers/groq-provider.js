/**
 * Groq TTS Provider
 * Implementation of TTSProvider for Groq's text-to-speech API
 * Uses PlayAI Dialog and Orpheus models
 */

import { TTSProvider } from './base-provider.js';
import { createPricingModel, PricingType } from './pricing-model.js';

/**
 * Groq voice definitions
 * Orpheus TTS voices (expressive TTS with vocal direction controls)
 * Supports bracketed directions like [cheerful], [whisper], [sad]
 * Also supports emotive tags: <laugh>, <sigh>, <gasp>, etc.
 * Valid voices per API: autumn, diana, hannah, austin, daniel, troy
 */
const GROQ_VOICES = [
  { id: 'hannah', name: 'Hannah', language: 'en-US', gender: 'female', description: 'Warm and expressive' },
  { id: 'diana', name: 'Diana', language: 'en-US', gender: 'female', description: 'Professional narrator' },
  { id: 'autumn', name: 'Autumn', language: 'en-US', gender: 'female', description: 'Soft and soothing' },
  { id: 'troy', name: 'Troy', language: 'en-US', gender: 'male', description: 'Clear and articulate' },
  { id: 'austin', name: 'Austin', language: 'en-US', gender: 'male', description: 'Friendly and engaging' },
  { id: 'daniel', name: 'Daniel', language: 'en-US', gender: 'male', description: 'Calm and measured' }
];

/**
 * Model ID for Groq TTS
 * Orpheus: canopylabs/orpheus-v1-english (expressive TTS with vocal directions)
 * Note: playai-tts was deprecated Dec 2025, replaced by Orpheus
 */
const GROQ_MODEL = 'canopylabs/orpheus-v1-english';

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
   * Fetch available voices from Groq API
   * Groq doesn't have a dedicated voice listing API, so we verify the model
   * is available and return the known voices for that model
   * @returns {Promise<Voice[]>}
   */
  async fetchVoices() {
    if (!this.hasApiKey()) {
      return GROQ_VOICES;
    }

    try {
      // Check available models to verify TTS is accessible
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${this._apiKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const models = data.data || [];

        // Check if Orpheus model is available
        const hasOrpheus = models.some(m =>
          m.id === GROQ_MODEL || m.id?.includes('orpheus')
        );

        if (hasOrpheus) {
          console.log('Groq: Orpheus TTS model available');
          return GROQ_VOICES;
        }

        // Check for any TTS model
        const ttsModels = models.filter(m =>
          m.id?.includes('tts') || m.id?.includes('speech')
        );

        if (ttsModels.length > 0) {
          console.log('Groq: TTS models found:', ttsModels.map(m => m.id));
        }
      }
    } catch (error) {
      console.warn('Groq: Failed to fetch models, using default voices:', error.message);
    }

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
      // Check if we can access the models endpoint
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: {
          'Authorization': `Bearer ${this._apiKey}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Groq key validation error:', error);
      return false;
    }
  }

  /**
   * Get the default voice for this provider
   * @returns {Voice}
   */
  getDefaultVoice() {
    return GROQ_VOICES[0]; // hannah
  }

  /**
   * Validate and normalize voice ID
   * Falls back to default voice if the requested voice is invalid
   * @param {string} voiceId - Requested voice ID
   * @returns {string} - Valid voice ID
   */
  normalizeVoiceId(voiceId) {
    const validVoice = GROQ_VOICES.find(v => v.id === voiceId);
    if (validVoice) {
      return voiceId;
    }

    // Check if it's an old PlayAI voice format
    if (voiceId && voiceId.includes('-PlayAI')) {
      console.warn(`Groq: PlayAI voice "${voiceId}" is deprecated, using default voice`);
    } else if (voiceId) {
      console.warn(`Groq: Invalid voice "${voiceId}", using default voice`);
    }

    return this.getDefaultVoice().id;
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

    // Validate and normalize voice ID
    const normalizedVoiceId = this.normalizeVoiceId(voiceId);
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
        voice: normalizedVoiceId,
        response_format: 'wav',
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
    const message = errorBody?.message || '';

    // Check for terms acceptance requirement
    if (message.includes('terms acceptance') || message.includes('terms at')) {
      return 'Groq Orpheus model requires terms acceptance. Visit console.groq.com to accept terms.';
    }

    // Check for invalid voice
    if (message.includes('voice must be one of')) {
      return `Invalid voice. ${message}`;
    }

    switch (status) {
      case 401:
        return 'Invalid Groq API key. Please check your settings.';
      case 429:
        return 'Rate limited. Groq has generous limits - please wait a moment.';
      case 400:
        return message || 'Invalid request. Please try a different voice.';
      default:
        return message || `Groq API error (${status}). Please try again later.`;
    }
  }
}
