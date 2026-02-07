/**
 * Browser TTS Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using the Web Speech API
 * (speechSynthesis). Firefox event pages have full DOM access, so
 * speechSynthesis is available in the background script.
 *
 * Key differences from ElevenLabs:
 * - No API key required (always valid credentials)
 * - No word-level timing support
 * - Speaks text directly via speechSynthesis (no audio blob generated)
 * - Returns a minimal/empty AudioResponse since audio plays through speechSynthesis
 *
 * @module adapters/audio/browser-tts-audio
 */

import type { AudioError } from '../../core/shared/errors';
import { audioError } from '../../core/shared/errors';
import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type {
  AudioRequest,
  AudioResponse,
  IAudioGenerator,
  Voice,
} from '../../ports/audio-generator.port';

/**
 * Browser TTS adapter implementing the IAudioGenerator port.
 *
 * Uses the Web Speech API (speechSynthesis) available in Firefox
 * background event pages. Speaks text directly — does not produce
 * downloadable audio blobs.
 *
 * Features:
 * - All languages supported (depends on OS voices)
 * - No API key required
 * - No word-level timing
 */
export class BrowserTtsAudioAdapter implements IAudioGenerator {
  readonly providerId = 'browser' as const;
  readonly supportsWordTiming = false;
  readonly supportedLanguages: readonly string[] = [];

  /**
   * Generate audio from text using speechSynthesis.
   *
   * Since speechSynthesis speaks directly (not to a blob), this method:
   * 1. Creates a SpeechSynthesisUtterance
   * 2. Speaks it via speechSynthesis
   * 3. Returns a minimal AudioResponse with an empty blob
   *
   * @param request - Audio generation request
   * @returns Result with minimal AudioResponse or error
   */
  async generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    try {
      const synth = speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(request.text);

      // Set speech rate
      utterance.rate = request.speed;

      // Set language if provided
      if (request.language) {
        utterance.lang = request.language;
      }

      // Set voice if provided (look up by voiceURI)
      if (request.voice) {
        const voices = synth.getVoices();
        const matchedVoice = voices.find(
          (v) => v.voiceURI === request.voice || v.name === request.voice,
        );
        if (matchedVoice) {
          utterance.voice = matchedVoice;
        }
      }

      // Speak and wait for completion
      await new Promise<void>((resolve, reject) => {
        utterance.onend = () => resolve();
        utterance.onerror = (event: SpeechSynthesisErrorEvent | Event) => {
          const errorMessage =
            'error' in event
              ? String((event as SpeechSynthesisErrorEvent).error)
              : 'Speech synthesis failed';
          reject(new Error(errorMessage));
        };
        synth.speak(utterance);
      });

      // Estimate duration based on text length and speed
      const wordCount = request.text.split(/\s+/).filter(Boolean).length;
      const estimatedDurationMs = Math.max(100, (wordCount * 300) / request.speed);

      // Return minimal AudioResponse — audio was played directly
      return Ok({
        audioBlob: new Blob([], { type: 'audio/wav' }),
        durationMs: estimatedDurationMs,
        wordTimings: null,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get available voices from speechSynthesis.
   *
   * @param language - Optional BCP-47 language code prefix to filter by
   * @returns Result with Voice array or error
   */
  async getVoices(language?: string): Promise<Result<Voice[], AudioError>> {
    try {
      const synth = speechSynthesis;
      let voices = synth.getVoices();

      // Filter by language prefix if provided
      if (language) {
        const langPrefix = language.toLowerCase();
        voices = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
      }

      // Map SpeechSynthesisVoice to Voice interface
      const mapped: Voice[] = voices.map((v) => ({
        id: v.voiceURI,
        name: v.name,
        language: v.lang || null,
        gender: null, // speechSynthesis doesn't expose gender
      }));

      return Ok(mapped);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Browser TTS requires no credentials — always valid.
   * @returns Always true
   */
  async validateCredentials(): Promise<boolean> {
    return true;
  }

  /**
   * Convert errors to AudioError.
   */
  private handleError(error: unknown): Result<never, AudioError> {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('network') || message.includes('fetch')) {
      return Err(audioError.network(message));
    }

    return Err(audioError.providerError(this.providerId, message));
  }
}
