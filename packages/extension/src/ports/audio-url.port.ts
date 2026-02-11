/**
 * Audio URL Provider Port
 *
 * Abstracts audio URL creation/revocation to maintain hexagonal architecture.
 * This port allows the core layer to work with audio URLs without depending
 * on specific implementations (blob URLs, data URLs, etc.).
 *
 * Firefox-First: Firefox event pages have DOM access, so blob URLs work.
 * The adapter handles context detection for cross-browser compatibility.
 *
 * @module ports/audio-url.port
 */

/**
 * Audio URL provider interface.
 *
 * Implementations handle the differences between contexts:
 * - DOM contexts: Use efficient blob URLs
 * - Service worker contexts: Use data URLs (no blob URL support)
 */
export interface IAudioUrlProvider {
  /**
   * Create a playable audio URL from audio data.
   *
   * @param data - Audio data as ArrayBuffer or Blob
   * @param mimeType - MIME type of the audio (default: 'audio/mpeg')
   * @returns Promise resolving to a URL usable with Audio element
   */
  createUrl(data: ArrayBuffer | Blob, mimeType?: string): Promise<string>;

  /**
   * Revoke an audio URL if applicable.
   *
   * Blob URLs should be revoked to free memory.
   * Data URLs don't need revocation (no-op).
   *
   * @param url - The URL to revoke (null-safe)
   */
  revokeUrl(url: string | null): void;
}
