/**
 * ElevenLabs TTS Provider
 * Implementation of TTSProvider for ElevenLabs text-to-speech API
 */

import { TTSProvider } from './base-provider.js';
import { ProviderPricing } from './pricing-model.js';

/**
 * ElevenLabs voice definitions with their API IDs
 */
const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en-US', gender: 'female', description: 'Calm, soothing' },
  { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew', language: 'en-US', gender: 'male', description: 'Well-rounded, confident' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', language: 'en-US', gender: 'female', description: 'Soft news presenter' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', language: 'en-US', gender: 'male', description: 'Crisp, natural' },
  { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', language: 'en-US', gender: 'male', description: 'Deep, warm' },
  { id: '5Q0t7uMcjvnagumLfvZi', name: 'Paul', language: 'en-US', gender: 'male', description: 'News anchor style' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', language: 'en-US', gender: 'female', description: 'Assertive, strong' },
  { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', language: 'en-GB', gender: 'male', description: 'British, conversational' },
  { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin', language: 'en-IE', gender: 'male', description: 'Irish, friendly' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', language: 'en-US', gender: 'female', description: 'Youthful, engaging' }
];

export class ElevenLabsProvider extends TTSProvider {
  static get id() {
    return 'elevenlabs';
  }

  static get name() {
    return 'ElevenLabs';
  }

  static get requiresApiKey() {
    return true;
  }

  static get supportsStreaming() {
    return true;
  }

  /**
   * ElevenLabs supports word-level timing via alignment response (T039)
   */
  static get supportsWordTiming() {
    return true;
  }

  get pricingModel() {
    return ProviderPricing.elevenlabs;
  }

  getVoices() {
    return ELEVENLABS_VOICES;
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
      // Check user subscription to validate key
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        method: 'GET',
        headers: {
          'xi-api-key': this._apiKey
        }
      });

      return response.ok;
    } catch (error) {
      console.error('ElevenLabs key validation error:', error);
      return false;
    }
  }

  /**
   * Generate audio from text
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier (UUID)
   * @param {Object} [options] - Generation options
   * @param {boolean} [options.withTimestamps] - Request word timing data (T039)
   * @returns {Promise<ArrayBuffer|{audioData: ArrayBuffer, wordTiming: Array}>}
   */
  async generateAudio(text, voiceId, options = {}) {
    if (!this.hasApiKey()) {
      throw new Error('ElevenLabs API key not configured');
    }

    // If timestamps requested, use the with_timestamps endpoint (T039, T040)
    if (options.withTimestamps) {
      return await this.generateAudioWithTimestamps(text, voiceId, options);
    }

    const modelId = options.turbo ? 'eleven_turbo_v2_5' : 'eleven_multilingual_v2';

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this._apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: options.stability || 0.5,
          similarity_boost: options.similarityBoost || 0.75,
          style: options.style || 0.5,
          use_speaker_boost: true
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
      throw new Error(this.buildErrorMessage(response, errorBody?.detail));
    }

    return await response.arrayBuffer();
  }

  /**
   * Generate audio with word timing data (T039-T042)
   * Uses ElevenLabs with_timestamps parameter
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier
   * @param {Object} [options] - Generation options
   * @returns {Promise<{audioData: ArrayBuffer, wordTiming: Array}>}
   */
  async generateAudioWithTimestamps(text, voiceId, options = {}) {
    const modelId = options.turbo ? 'eleven_turbo_v2_5' : 'eleven_multilingual_v2';

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: {
        'xi-api-key': this._apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: options.stability || 0.5,
          similarity_boost: options.similarityBoost || 0.75,
          style: options.style || 0.5,
          use_speaker_boost: true
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
      throw new Error(this.buildErrorMessage(response, errorBody?.detail));
    }

    const result = await response.json();

    // Result contains base64 audio and alignment data
    // alignment: { characters: [...], character_start_times_seconds: [...], character_end_times_seconds: [...] }
    const audioBase64 = result.audio_base64;
    const alignment = result.alignment;

    // Decode base64 audio to ArrayBuffer
    const audioData = this._base64ToArrayBuffer(audioBase64);

    // Convert character-level timing to word-level (T041)
    const wordTiming = this._parseWordTiming(text, alignment);

    return { audioData, wordTiming };
  }

  /**
   * Convert base64 string to ArrayBuffer
   * @private
   * @param {string} base64 - Base64 encoded string
   * @returns {ArrayBuffer}
   */
  _base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Parse character-level timing into word boundaries (T041)
   * @private
   * @param {string} text - Original text
   * @param {Object} alignment - ElevenLabs alignment response
   * @returns {Array<{word: string, charOffset: number, charLength: number, startTimeMs: number, endTimeMs: number}>}
   */
  _parseWordTiming(text, alignment) {
    if (!alignment || !alignment.characters || !alignment.character_start_times_seconds) {
      return [];
    }

    const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
    const wordTimings = [];
    let currentWord = '';
    let wordStartIndex = null;
    let wordStartTime = null;
    let wordEndTime = null;
    let charOffset = 0;

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const startTime = character_start_times_seconds[i];
      const endTime = character_end_times_seconds[i];

      // Check if this is a word character
      const isWordChar = /[\p{L}\p{N}]/u.test(char);

      if (isWordChar) {
        if (wordStartIndex === null) {
          // Start of a new word
          wordStartIndex = charOffset;
          wordStartTime = startTime;
        }
        currentWord += char;
        wordEndTime = endTime;
      } else {
        // Non-word character - save current word if exists
        if (currentWord.length > 0) {
          wordTimings.push({
            word: currentWord,
            charOffset: wordStartIndex,
            charLength: currentWord.length,
            startTimeMs: Math.round(wordStartTime * 1000),
            endTimeMs: Math.round(wordEndTime * 1000)
          });
          currentWord = '';
          wordStartIndex = null;
          wordStartTime = null;
          wordEndTime = null;
        }
      }

      charOffset++;
    }

    // Don't forget the last word
    if (currentWord.length > 0) {
      wordTimings.push({
        word: currentWord,
        charOffset: wordStartIndex,
        charLength: currentWord.length,
        startTimeMs: Math.round(wordStartTime * 1000),
        endTimeMs: Math.round(wordEndTime * 1000)
      });
    }

    return wordTimings;
  }

  /**
   * ElevenLabs doesn't support speed parameter directly in API
   * Speed adjustment would need to be done client-side
   * @param {number} speed
   * @returns {number}
   */
  clampSpeed(speed) {
    // Return 1.0 as ElevenLabs doesn't support speed in API
    // Speed adjustment is handled by Audio.playbackRate
    return 1.0;
  }

  /**
   * Build error message for ElevenLabs specific errors
   * @param {Response} response
   * @param {Object} [errorBody]
   * @returns {string}
   */
  buildErrorMessage(response, errorBody = null) {
    const status = response.status;

    switch (status) {
      case 401:
        return 'Invalid ElevenLabs API key. Please check your settings.';
      case 422:
        return 'Invalid voice or settings. Please try a different voice.';
      case 429:
        return 'Rate limited. Please wait and try again.';
      default:
        return errorBody?.message || `ElevenLabs API error (${status}). Please try again later.`;
    }
  }
}
