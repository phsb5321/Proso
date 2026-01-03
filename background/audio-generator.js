/**
 * Audio Generator
 * Handles TTS audio generation and playback using provider registry.
 * Manages audio caching, pre-generation, and browser TTS fallback.
 *
 * @module background/audio-generator
 */

import { ProviderId } from './constants.js';
import { audioCache } from './audio-cache.js';
import {
  initializeVisualizer,
  connectAudioElement,
  isVisualizerReady
} from './audio-visualizer.js';

/**
 * AudioGenerator class - manages TTS generation and audio playback
 */
export class AudioGenerator {
  /**
   * @param {Object} deps - Dependencies
   * @param {Object} deps.providerRegistry - Provider registry instance
   * @param {Object} deps.groqTimestampProvider - Groq timestamp provider for word timing
   */
  constructor(deps = {}) {
    this.providerRegistry = deps.providerRegistry;
    this.groqTimestampProvider = deps.groqTimestampProvider;
  }

  /**
   * Generate audio using provider registry
   * @param {string} text - Text to synthesize
   * @param {string} providerId - Provider ID
   * @param {string} voice - Voice ID
   * @param {Object} options - Generation options
   * @param {number} [options.speed=1.0] - Playback speed
   * @param {boolean} [options.requestWordTiming=true] - Request word timing if provider supports it
   * @param {string} [options.languageCode] - ISO 639-1 language code (019-multilingual-tts)
   * @returns {Promise<ArrayBuffer|{audioData: ArrayBuffer, wordTiming: Array}>}
   */
  async generateAudio(text, providerId, voice, options = {}) {
    const { speed = 1.0, requestWordTiming = true, languageCode } = options;
    const provider = this.providerRegistry.getProvider(providerId);

    if (!provider) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    if (provider.constructor.requiresApiKey && !provider.hasApiKey()) {
      throw new Error(`${provider.constructor.name} API key not configured`);
    }

    const genOptions = { speed };

    // Request word timing if provider supports it
    if (requestWordTiming && provider.constructor.supportsWordTiming) {
      genOptions.withTimestamps = true;
    }

    // Pass language code to provider (019-multilingual-tts)
    if (languageCode) {
      genOptions.languageCode = languageCode;
    }

    return await provider.generateAudio(text, voice, genOptions);
  }

  /**
   * Generate audio with Groq Whisper word timing extraction
   * @param {string} text - Text to synthesize
   * @param {string} providerId - Provider ID
   * @param {string} voice - Voice ID
   * @param {Object} options - Generation options
   * @returns {Promise<{audioData: ArrayBuffer, wordTiming: Array|null}>}
   */
  async generateAudioWithTiming(text, providerId, voice, options = {}) {
    const result = await this.generateAudio(text, providerId, voice, options);

    // Handle result that may include word timing
    let audioData;
    let wordTiming = null;

    if (result && result.audioData) {
      audioData = result.audioData;
      wordTiming = result.wordTiming || null;
    } else {
      audioData = result;
    }

    // Extract word timings using Groq Whisper if no native timing
    if (!wordTiming && this.groqTimestampProvider?.hasApiKey()) {
      try {
        const wordTimeline = await this.groqTimestampProvider.extractWordTimings(audioData, text);
        if (wordTimeline && wordTimeline.words && wordTimeline.words.length > 0) {
          wordTiming = wordTimeline.words;
          console.log('VoxPage: Extracted word timings via Groq Whisper:', wordTiming.length, 'words');
        }
      } catch (groqError) {
        console.warn('VoxPage: Failed to extract word timings via Groq:', groqError);
        // Continue without word timing - will use paragraph-level sync
      }
    }

    return { audioData, wordTiming };
  }

  /**
   * Play audio buffer with visualizer connection
   * @param {ArrayBuffer} audioData - Audio data to play
   * @param {Object} options - Playback options
   * @param {number} options.speed - Playback speed
   * @param {function} options.onEnded - Callback when audio ends
   * @param {function} options.onError - Callback on error
   * @param {function} options.onTimeUpdate - Callback for time updates
   * @param {function} options.onLoadedMetadata - Callback when metadata loads
   * @returns {HTMLAudioElement} The audio element
   */
  playAudio(audioData, options = {}) {
    const {
      speed = 1.0,
      onEnded,
      onError,
      onTimeUpdate,
      onLoadedMetadata
    } = options;

    const blob = new Blob([audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.playbackRate = speed;

    // Connect to visualizer for audio analysis
    if (!isVisualizerReady()) {
      initializeVisualizer();
    }
    connectAudioElement(audio);

    // Add timeupdate event listener for more reliable sync
    if (onTimeUpdate) {
      audio.addEventListener('timeupdate', () => onTimeUpdate(audio));
    }

    // Handle metadata load for duration info
    if (onLoadedMetadata) {
      audio.addEventListener('loadedmetadata', () => onLoadedMetadata(audio));
    }

    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (onEnded) onEnded();
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (onError) onError(new Error('Audio playback failed'));
    };

    audio.play();
    return audio;
  }

  /**
   * Play using browser's built-in TTS
   * @param {string} text - Text to speak
   * @param {string} voiceURI - Voice URI
   * @param {number} speed - Playback speed
   * @param {string} [languageCode] - Language code for pronunciation (019-multilingual-tts)
   * @returns {Promise<void>}
   */
  playWithBrowserTTS(text, voiceURI, speed = 1.0, languageCode = null) {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // Find the selected voice
      const voices = speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.voiceURI === voiceURI);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // Set language for pronunciation (019-multilingual-tts)
      if (languageCode) {
        utterance.lang = languageCode;
      } else if (selectedVoice) {
        utterance.lang = selectedVoice.lang;
      }

      utterance.rate = speed;

      utterance.onend = () => resolve();

      utterance.onerror = (event) => {
        if (event.error !== 'canceled') {
          reject(new Error(`Speech synthesis error: ${event.error}`));
        } else {
          resolve();
        }
      };

      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Pre-generate the next paragraphs while current is playing
   * @param {string[]} paragraphs - All paragraphs
   * @param {number} currentIndex - Current paragraph index
   * @param {string} providerId - Provider ID
   * @param {string} voice - Voice ID
   * @param {Set<number>} preGenerating - Set of indices being pre-generated
   * @param {function} onPreGenerating - Callback when pre-generation starts
   * @param {number} [count=2] - Number of paragraphs to pre-generate
   */
  async preGenerateNextParagraphs(paragraphs, currentIndex, providerId, voice, preGenerating, onPreGenerating, count = 2) {
    const startIndex = currentIndex + 1;
    const endIndex = Math.min(startIndex + count, paragraphs.length);

    for (let i = startIndex; i < endIndex; i++) {
      // Skip if already pre-generating or cached
      if (preGenerating.has(i)) continue;

      const text = paragraphs[i];
      const cacheKey = audioCache.generateKey(providerId, voice, text);

      // Skip if already cached
      if (audioCache.has(cacheKey)) continue;

      // Mark as pre-generating
      preGenerating.add(i);
      if (onPreGenerating) onPreGenerating(i);

      try {
        const audioData = await this.generateAudio(text, providerId, voice, { requestWordTiming: false });
        audioCache.set(cacheKey, audioData, {
          provider: providerId,
          voice: voice,
          text: text
        });
      } catch (error) {
        console.warn(`Failed to pre-generate paragraph ${i}:`, error);
      } finally {
        preGenerating.delete(i);
      }
    }
  }

  /**
   * Check if provider is browser TTS
   * @param {string} providerId - Provider ID
   * @returns {boolean}
   */
  isBrowserTTS(providerId) {
    return providerId === ProviderId.BROWSER;
  }

  /**
   * Stop browser TTS playback
   */
  stopBrowserTTS() {
    speechSynthesis.cancel();
  }

  /**
   * Pause browser TTS playback
   */
  pauseBrowserTTS() {
    speechSynthesis.pause();
  }

  /**
   * Resume browser TTS playback
   */
  resumeBrowserTTS() {
    speechSynthesis.resume();
  }
}

/**
 * Create an audio generator instance
 * @param {Object} deps - Dependencies
 * @returns {AudioGenerator}
 */
export function createAudioGenerator(deps = {}) {
  return new AudioGenerator(deps);
}

export default AudioGenerator;
