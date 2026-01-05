/**
 * Browser TTS Provider
 * Implementation of ITTSProvider using the Web Speech API
 *
 * @module utils/providers/browser
 */

import { BaseTTSProvider, type TTSRequest, type TTSResponse, type VoiceOption } from './base';

/**
 * Browser TTS Provider Implementation
 * Uses the Web Speech API (free, built-in)
 */
export class BrowserProvider extends BaseTTSProvider {
  readonly id = 'browser';
  readonly name = 'Browser TTS';
  readonly supportsWordTiming = false;
  readonly supportedLanguages: string[] = []; // Dynamic based on system voices

  private voices: VoiceOption[] = [];
  private voicesLoaded = false;

  async generateAudio(request: TTSRequest): Promise<TTSResponse> {
    // Browser TTS doesn't return audio data - it plays directly via speechSynthesis
    // This method is here to satisfy the interface but should not be used
    throw new Error('Browser TTS uses direct playback via speechSynthesis.speak()');
  }

  async getVoices(language?: string): Promise<VoiceOption[]> {
    if (!this.voicesLoaded) {
      this.loadVoices();
    }

    if (!language) {
      return this.voices;
    }

    // Filter voices by language
    const langPrefix = language.split('-')[0].toLowerCase();
    return this.voices.filter(v => v.language?.toLowerCase().startsWith(langPrefix));
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    // Browser TTS doesn't need API key
    return typeof speechSynthesis !== 'undefined';
  }

  /**
   * Check if browser TTS is available
   */
  isAvailable(): boolean {
    return typeof speechSynthesis !== 'undefined';
  }

  /**
   * Load system voices from Web Speech API
   */
  private loadVoices(): void {
    if (typeof speechSynthesis === 'undefined') {
      console.warn('Web Speech API not available');
      this.voices = [];
      this.voicesLoaded = true;
      return;
    }

    const systemVoices = speechSynthesis.getVoices();
    this.voices = systemVoices.map(voice => ({
      id: voice.voiceURI,
      name: voice.name,
      language: voice.lang,
      gender: undefined, // Web Speech API doesn't provide gender
    }));
    this.voicesLoaded = true;
  }

  /**
   * Play text using Web Speech API (direct playback)
   * @param text - Text to synthesize
   * @param voiceId - Voice identifier (voiceURI)
   * @param speed - Playback speed
   * @param language - Language code
   */
  async playDirect(text: string, voiceId: string, speed: number = 1.0, language?: string): Promise<void> {
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
        utterance.lang = selectedVoice.lang;
      }

      // Override language if specified
      if (language) {
        utterance.lang = language;
      }

      // Set speed
      utterance.rate = this.clampSpeed(speed);

      // Handle completion
      utterance.onend = () => resolve();

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
   * Pause playback
   */
  pause(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.pause();
    }
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.resume();
    }
  }

  /**
   * Cancel playback
   */
  cancel(): void {
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
  }

  protected clampSpeed(speed: number): number {
    return Math.max(0.5, Math.min(2.0, speed));
  }
}
