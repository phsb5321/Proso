// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Browser TTS Provider
 * Text-to-speech using the native Web Speech API (SpeechSynthesis)
 * 048-multilingual-tts-pillar: Free offline TTS fallback
 *
 * @module utils/providers/browser
 */

import {
  BaseTTSProvider,
  type TTSRequest,
  type TTSResponse,
  type VoiceOption,
} from './base';

/**
 * Browser TTS provider using Web Speech API
 * Language support depends on user's OS/browser configuration
 */
export class BrowserTTSProvider extends BaseTTSProvider {
  readonly id = 'browser';
  readonly name = 'Browser TTS';
  readonly supportsWordTiming = false;
  readonly supportedLanguages: string[] = []; // Dynamic - depends on system

  private voicesLoaded = false;
  private voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

  /**
   * Load available voices (async - voices may not be immediately available)
   */
  async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    // Return cached promise if already loading
    if (this.voicesPromise) {
      return this.voicesPromise;
    }

    this.voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      // Try to get voices immediately
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        this.voicesLoaded = true;
        resolve(voices);
        return;
      }

      // Wait for voiceschanged event if not immediately available
      const timeoutId = setTimeout(() => {
        // Fallback: return empty array after timeout
        resolve([]);
      }, 3000);

      speechSynthesis.onvoiceschanged = () => {
        clearTimeout(timeoutId);
        this.voicesLoaded = true;
        resolve(speechSynthesis.getVoices());
      };
    });

    return this.voicesPromise;
  }

  async generateAudio(request: TTSRequest): Promise<TTSResponse> {
    const validated = this.validateRequest(request);

    return new Promise<TTSResponse>((resolve, reject) => {
      // Create utterance
      const utterance = new SpeechSynthesisUtterance(validated.text);

      // Set language if provided
      if (validated.language) {
        utterance.lang = validated.language;
      }

      // Set speed (rate in Web Speech API is 0.1 to 10, default 1)
      utterance.rate = validated.speed;

      // Find and set voice
      this.loadVoices().then((voices) => {
        const voice = this.findVoice(voices, validated.voice, validated.language);
        if (voice) {
          utterance.voice = voice;
        }

        // Track duration
        const startTime = Date.now();
        let audioBlob: Blob | null = null;

        // For Browser TTS, we cannot capture the audio as a blob
        // We'll create a "virtual" blob that signals Browser TTS was used
        // The actual playback is handled by the speechSynthesis API directly
        utterance.onend = () => {
          const duration = (Date.now() - startTime) / 1000;

          // Create a marker blob that indicates Browser TTS
          // This won't be played back - speech happens via SpeechSynthesis
          audioBlob = new Blob(['BROWSER_TTS_MARKER'], { type: 'text/plain' });

          resolve(this.createResponse(audioBlob, duration, null));
        };

        utterance.onerror = (event) => {
          reject(new Error(`Browser TTS error: ${event.error}`));
        };

        // Start speaking
        speechSynthesis.speak(utterance);
      });
    });
  }

  async getVoices(language?: string): Promise<VoiceOption[]> {
    const voices = await this.loadVoices();

    let filtered = voices;

    // Filter by language if specified
    if (language) {
      const langCode = language.toLowerCase().split('-')[0];
      filtered = voices.filter((v) => v.lang.toLowerCase().startsWith(langCode));

      // If no exact match, return all voices
      if (filtered.length === 0) {
        filtered = voices;
      }
    }

    return filtered.map((voice) => ({
      id: voice.voiceURI,
      name: voice.name,
      language: voice.lang,
      gender: this.inferGender(voice.name),
    }));
  }

  async validateApiKey(_apiKey: string): Promise<boolean> {
    // Browser TTS doesn't require an API key
    // Check if SpeechSynthesis is available
    return typeof speechSynthesis !== 'undefined' && 'speak' in speechSynthesis;
  }

  /**
   * Check if Browser TTS is available
   */
  isAvailable(): boolean {
    return typeof speechSynthesis !== 'undefined' && 'speak' in speechSynthesis;
  }

  /**
   * Stop any current speech
   */
  stop(): void {
    speechSynthesis.cancel();
  }

  /**
   * Pause speech
   */
  pause(): void {
    speechSynthesis.pause();
  }

  /**
   * Resume speech
   */
  resume(): void {
    speechSynthesis.resume();
  }

  /**
   * Find best matching voice
   */
  private findVoice(
    voices: SpeechSynthesisVoice[],
    voiceId: string | null | undefined,
    language: string | null | undefined,
  ): SpeechSynthesisVoice | null {
    if (voices.length === 0) return null;

    // If voice ID specified, try to find exact match
    if (voiceId) {
      const exact = voices.find((v) => v.voiceURI === voiceId || v.name === voiceId);
      if (exact) return exact;
    }

    // Filter by language
    if (language) {
      const langCode = language.toLowerCase().split('-')[0];
      const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(langCode));

      if (langVoices.length > 0) {
        // Prefer non-local (cloud) voices if available
        const cloudVoice = langVoices.find((v) => !v.localService);
        return cloudVoice || langVoices[0];
      }
    }

    // Return default voice or first available
    return voices.find((v) => v.default) || voices[0];
  }

  /**
   * Infer voice gender from name (heuristic)
   */
  private inferGender(name: string): 'male' | 'female' | 'neutral' | undefined {
    const lowerName = name.toLowerCase();

    const femaleIndicators = ['female', 'woman', 'samantha', 'victoria', 'karen', 'moira', 'fiona', 'sara', 'anna', 'maria'];
    const maleIndicators = ['male', 'man', 'daniel', 'thomas', 'james', 'alex', 'david', 'george'];

    if (femaleIndicators.some((i) => lowerName.includes(i))) {
      return 'female';
    }
    if (maleIndicators.some((i) => lowerName.includes(i))) {
      return 'male';
    }

    return 'neutral';
  }
}

/**
 * Speak text directly using Browser TTS
 * Utility function for simple speech without creating full provider
 */
export function speakText(text: string, language?: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  if (language) {
    utterance.lang = language;
  }
  speechSynthesis.speak(utterance);
}
