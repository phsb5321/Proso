/**
 * Audio URL Adapter
 *
 * Implements IAudioUrlProvider port by wrapping the audio-url utilities.
 * This adapter bridges the core layer with the infrastructure utilities.
 *
 * @module adapters/audio/audio-url.adapter
 */

import type { IAudioUrlProvider } from '../../ports/audio-url.port';
import { createAudioUrl, revokeAudioUrl } from '../../utils/audio/audio-url';

/**
 * Audio URL adapter using the utils/audio/audio-url module.
 *
 * Handles context detection automatically:
 * - In DOM contexts (Firefox event pages): Uses efficient blob URLs
 * - In service worker contexts (Chrome MV3): Uses data URLs
 */
export class AudioUrlAdapter implements IAudioUrlProvider {
  /**
   * Create a playable audio URL from audio data.
   *
   * @param data - Audio data as ArrayBuffer or Blob
   * @param mimeType - MIME type of the audio (default: 'audio/mpeg')
   * @returns Promise resolving to a URL usable with Audio element
   */
  async createUrl(data: ArrayBuffer | Blob, mimeType = 'audio/mpeg'): Promise<string> {
    return createAudioUrl(data, mimeType);
  }

  /**
   * Revoke an audio URL if applicable.
   *
   * @param url - The URL to revoke (null-safe)
   */
  revokeUrl(url: string | null): void {
    revokeAudioUrl(url);
  }
}
