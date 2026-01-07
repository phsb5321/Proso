/**
 * Browser Audio Adapter
 *
 * Adapter implementing IAudioGenerator port using Web Speech API.
 * Wraps the existing BrowserProvider class.
 *
 * Note: Browser TTS works differently - it plays directly via speechSynthesis
 * rather than returning audio blobs. This adapter provides a compatibility layer.
 *
 * @module adapters/audio/browser-audio
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
import { BrowserProvider } from '../../utils/providers/browser';

/**
 * Browser TTS adapter implementing the IAudioGenerator port.
 *
 * Features:
 * - Free, no API key required
 * - Language support depends on system voices
 * - No word-level timing
 * - Speed range: 0.5 - 2.0
 *
 * Note: Unlike other adapters, browser TTS doesn't return audio blobs.
 * The generateAudio method returns a minimal response and playback
 * must be handled via the playDirect method.
 */
export class BrowserAudioAdapter implements IAudioGenerator {
  readonly providerId = 'browser' as const;
  readonly supportsWordTiming = false;
  readonly supportedLanguages: readonly string[] = []; // Dynamic based on system

  private readonly provider: BrowserProvider;

  constructor() {
    this.provider = new BrowserProvider();
  }

  /**
   * Generate audio from text.
   *
   * Note: Browser TTS cannot return audio blobs. This method returns
   * a minimal response. For actual playback, use playDirect().
   */
  async generateAudio(request: AudioRequest): Promise<Result<AudioResponse, AudioError>> {
    try {
      if (!this.provider.isAvailable()) {
        return Err(audioError.providerError(this.providerId, 'Web Speech API not available'));
      }

      // Browser TTS doesn't return audio data - it plays directly
      // Create a minimal response for compatibility
      // Estimate duration based on word count
      const wordCount = request.text.split(/\s+/).filter(Boolean).length;
      const wordsPerMinute = 150 / request.speed;
      const durationMs = (wordCount / wordsPerMinute) * 60 * 1000;

      // Create a minimal audio blob (empty wav header for type compatibility)
      const emptyBlob = new Blob(
        [
          new Uint8Array([
            0x52,
            0x49,
            0x46,
            0x46, // "RIFF"
            0x24,
            0x00,
            0x00,
            0x00, // File size (36 bytes)
            0x57,
            0x41,
            0x56,
            0x45, // "WAVE"
            0x66,
            0x6d,
            0x74,
            0x20, // "fmt "
            0x10,
            0x00,
            0x00,
            0x00, // Subchunk1Size (16)
            0x01,
            0x00, // AudioFormat (1 = PCM)
            0x01,
            0x00, // NumChannels (1)
            0x22,
            0x56,
            0x00,
            0x00, // SampleRate (22050)
            0x44,
            0xac,
            0x00,
            0x00, // ByteRate
            0x02,
            0x00, // BlockAlign
            0x10,
            0x00, // BitsPerSample (16)
            0x64,
            0x61,
            0x74,
            0x61, // "data"
            0x00,
            0x00,
            0x00,
            0x00, // Subchunk2Size (0)
          ]),
        ],
        { type: 'audio/wav' },
      );

      return Ok({
        audioBlob: emptyBlob,
        durationMs,
        wordTimings: null,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getVoices(language?: string): Promise<Result<Voice[], AudioError>> {
    try {
      if (!this.provider.isAvailable()) {
        return Ok([]);
      }

      const voices = await this.provider.getVoices(language);

      return Ok(
        voices.map((v) => ({
          id: v.id,
          name: v.name,
          language: v.language ?? null,
          gender: v.gender ?? null,
        })),
      );
    } catch (error) {
      return this.handleError(error);
    }
  }

  async validateCredentials(): Promise<boolean> {
    return this.provider.isAvailable();
  }

  /**
   * Check if browser TTS is available.
   */
  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  /**
   * Play text directly using Web Speech API.
   * This bypasses the audio blob mechanism.
   */
  async playDirect(text: string, voiceId: string, speed = 1.0, language?: string): Promise<void> {
    if (!this.provider.isAvailable()) {
      throw new Error('Web Speech API not available');
    }

    return this.provider.playDirect(text, voiceId, speed, language);
  }

  /**
   * Pause current playback.
   */
  pause(): void {
    this.provider.pause();
  }

  /**
   * Resume paused playback.
   */
  resume(): void {
    this.provider.resume();
  }

  /**
   * Cancel current playback.
   */
  cancel(): void {
    this.provider.cancel();
  }

  /**
   * Convert provider errors to AudioError.
   */
  private handleError(error: unknown): Result<never, AudioError> {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('not available')) {
      return Err(audioError.providerError(this.providerId, 'Web Speech API not available'));
    }

    if (message.includes('Speech synthesis error')) {
      return Err(audioError.providerError(this.providerId, message));
    }

    return Err(audioError.providerError(this.providerId, message));
  }
}
