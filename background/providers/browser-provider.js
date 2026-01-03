/**
 * Browser TTS Provider
 * Implementation of TTSProvider using the Web Speech API
 */

import { TTSProvider } from './base-provider.js';
import { ProviderPricing } from './pricing-model.js';

export class BrowserProvider extends TTSProvider {
  constructor() {
    // Browser TTS doesn't need an API key
    super(null);
    this._voices = [];
    this._voicesLoaded = false;
  }

  static get id() {
    return 'browser';
  }

  static get name() {
    return 'Browser TTS';
  }

  static get requiresApiKey() {
    return false;
  }

  static get supportsStreaming() {
    return false;
  }

  /**
   * Browser TTS supported languages (dynamic based on system voices)
   * (019-multilingual-tts)
   * @returns {string[]}
   */
  static get supportedLanguages() {
    // Dynamic - check getVoicesForLanguage() for actual support
    // Return common languages that most systems support
    return [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
      'ar', 'hi', 'nl', 'pl', 'sv', 'da', 'fi', 'no', 'cs', 'el'
    ];
  }

  get pricingModel() {
    return ProviderPricing.browser;
  }

  /**
   * Load and return available system voices
   * @returns {Voice[]}
   */
  getVoices() {
    if (!this._voicesLoaded) {
      this._loadVoices();
    }
    return this._voices;
  }

  /**
   * Load system voices from Web Speech API
   */
  _loadVoices() {
    if (typeof speechSynthesis === 'undefined') {
      console.warn('Web Speech API not available');
      this._voices = [];
      this._voicesLoaded = true;
      return;
    }

    const systemVoices = speechSynthesis.getVoices();
    this._voices = systemVoices.map(voice => ({
      id: voice.voiceURI,
      name: voice.name,
      language: voice.lang,
      gender: null, // Not provided by Web Speech API
      description: voice.localService ? 'Local voice' : 'Network voice'
    }));
    this._voicesLoaded = true;
  }

  /**
   * Browser TTS is always available (no API key needed)
   * @returns {Promise<boolean>}
   */
  async validateKey() {
    return typeof speechSynthesis !== 'undefined';
  }

  /**
   * Check if API key is configured (always true for browser TTS)
   * @returns {boolean}
   */
  hasApiKey() {
    return true;
  }

  /**
   * Generate audio from text using Web Speech API
   * Note: This returns a sentinel value since browser TTS doesn't return audio data
   * The actual playback is handled differently via speechSynthesis
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier (voiceURI)
   * @param {Object} [options] - Generation options
   * @returns {Promise<ArrayBuffer>}
   */
  async generateAudio(text, voiceId, options = {}) {
    // Browser TTS doesn't return audio data - it plays directly
    // Return a sentinel that indicates browser TTS should be used
    throw new Error('Browser TTS uses direct playback via speechSynthesis.speak()');
  }

  /**
   * Play text using Web Speech API (direct playback)
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier (voiceURI)
   * @param {Object} [options] - Generation options
   * @returns {Promise<void>}
   */
  async playDirect(text, voiceId, options = {}) {
    return new Promise((resolve, reject) => {
      if (typeof speechSynthesis === 'undefined') {
        reject(new Error('Web Speech API not available'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);

      // Find and set the voice
      const voices = speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.voiceURI === voiceId);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // Set language if specified (019-multilingual-tts)
      if (options.languageCode) {
        utterance.lang = options.languageCode;
      } else if (selectedVoice) {
        utterance.lang = selectedVoice.lang;
      }

      // Set speed
      utterance.rate = this.clampSpeed(options.speed || 1.0);

      // Handle completion
      utterance.onend = () => {
        resolve();
      };

      // Handle errors
      utterance.onerror = (event) => {
        // 'canceled' is not an error - it's normal stop
        if (event.error !== 'canceled') {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        } else {
          resolve();
        }
      };

      // Start speaking
      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Pause browser TTS playback
   */
  pause() {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.pause();
    }
  }

  /**
   * Resume browser TTS playback
   */
  resume() {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.resume();
    }
  }

  /**
   * Cancel browser TTS playback
   */
  cancel() {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
  }

  /**
   * Browser TTS supports speed from 0.1 to 10, but we clamp to usable range
   * @param {number} speed
   * @returns {number}
   */
  clampSpeed(speed) {
    return Math.max(0.5, Math.min(2.0, speed));
  }

  /**
   * Estimate cost (always free for browser TTS)
   * @param {string} text
   * @returns {number}
   */
  estimateCost(text) {
    return 0;
  }
}
