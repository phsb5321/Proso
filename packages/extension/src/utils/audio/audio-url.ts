// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Audio URL Utilities
 *
 * Provides cross-context audio URL creation that works in both
 * DOM contexts (content scripts, popup) and service workers (background).
 *
 * Chrome MV3 service workers don't have access to URL.createObjectURL(),
 * so we need to use data URLs instead when in that context.
 *
 * @module utils/audio/audio-url
 */

/**
 * Check if we're in a context that supports URL.createObjectURL
 */
function supportsObjectUrl(): boolean {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
}

/**
 * Convert ArrayBuffer to base64 data URL.
 * Used in service worker context where URL.createObjectURL is not available.
 */
function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const uint8Array = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Create a playable audio URL from audio data.
 * Works in both service worker and DOM contexts.
 *
 * In DOM contexts (content scripts, popup, offscreen), uses blob URLs.
 * In service worker context (background), uses data URLs.
 *
 * @param data - Audio data as ArrayBuffer or Blob
 * @param mimeType - MIME type of the audio (default: 'audio/mpeg')
 * @returns A URL that can be used with an Audio element
 */
export async function createAudioUrl(
  data: ArrayBuffer | Blob,
  mimeType = 'audio/mpeg',
): Promise<string> {
  // In service worker context, use data URL
  if (!supportsObjectUrl()) {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    return arrayBufferToDataUrl(buffer, mimeType);
  }

  // In DOM context, use blob URL (more efficient)
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Synchronous version for when we already have an ArrayBuffer.
 * Useful when we know we're in a service worker context.
 *
 * @param buffer - Audio data as ArrayBuffer
 * @param mimeType - MIME type of the audio (default: 'audio/mpeg')
 * @returns A data URL string
 */
export function createAudioDataUrl(buffer: ArrayBuffer, mimeType = 'audio/mpeg'): string {
  return arrayBufferToDataUrl(buffer, mimeType);
}

/**
 * Synchronous version that uses blob URL.
 * Only works in DOM contexts - will throw in service workers.
 *
 * @param data - Audio data as ArrayBuffer or Blob
 * @param mimeType - MIME type of the audio (default: 'audio/mpeg')
 * @returns A blob URL string
 * @throws Error if called in a context without URL.createObjectURL
 */
export function createAudioBlobUrl(data: ArrayBuffer | Blob, mimeType = 'audio/mpeg'): string {
  if (!supportsObjectUrl()) {
    throw new Error(
      'URL.createObjectURL is not available in this context. Use createAudioUrl() instead.',
    );
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Safely revoke a blob URL if it's a blob URL.
 * No-op for data URLs (they don't need to be revoked).
 *
 * @param url - The URL to revoke
 */
export function revokeAudioUrl(url: string | null): void {
  if (url && url.startsWith('blob:') && supportsObjectUrl()) {
    URL.revokeObjectURL(url);
  }
  // Data URLs don't need to be revoked
}
