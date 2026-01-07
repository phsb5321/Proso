// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Cache Key Generation - Smart Audio Cache
 *
 * Generates unique cache keys from URL, paragraph, provider, voice, and content hash.
 * Uses Web Crypto API for SHA-256 hashing.
 *
 * @module utils/cache/cache-key
 */

/**
 * Cache key format: normalizedUrl:paragraphIndex:provider:voice:contentHash
 * Example: "example.com/article:3:openai:alloy:a1b2c3d4e5f6g7h8"
 */

/**
 * Generate SHA-256 hash of text content
 * Uses Web Crypto API for consistent hashing
 *
 * @param text - Text to hash
 * @returns Promise resolving to hex hash string (truncated to 16 chars)
 */
export async function generateContentHash(text: string): Promise<string> {
  // Normalize text before hashing (trim whitespace, normalize unicode)
  const normalizedText = text.trim().normalize('NFC');

  // Encode text to bytes
  const encoder = new TextEncoder();
  const data = encoder.encode(normalizedText);

  // Generate SHA-256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Return truncated hash (first 16 characters = 64 bits, sufficient for collision avoidance)
  return hashHex.slice(0, 16);
}

/**
 * Synchronous content hash for non-crypto environments (fallback)
 * Uses simple string hashing - less secure but works everywhere
 *
 * @param text - Text to hash
 * @returns Hash string (16 chars)
 */
export function generateContentHashSync(text: string): string {
  const normalizedText = text.trim().normalize('NFC');

  // djb2 hash algorithm (fast, reasonable distribution)
  let hash = 5381;
  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText.charCodeAt(i);
    hash = (hash * 33) ^ char;
  }

  // Convert to positive hex string, pad to 16 chars
  const positiveHash = (hash >>> 0).toString(16);
  return positiveHash.padStart(16, '0').slice(0, 16);
}

/**
 * Normalize URL to hostname + pathname
 * Removes protocol, query params, and hash
 *
 * @param url - Full URL string
 * @returns Normalized URL (hostname + pathname)
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Combine hostname and pathname, removing trailing slash
    let normalized = urlObj.hostname + urlObj.pathname;
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    // If URL parsing fails, return as-is (shouldn't happen with valid URLs)
    return url;
  }
}

/**
 * Generate cache key from components
 *
 * @param url - Page URL
 * @param paragraphIndex - Paragraph index (0-based)
 * @param provider - TTS provider ID
 * @param voice - Voice ID
 * @param contentHash - Hash of paragraph text content
 * @returns Cache key string
 */
export function generateCacheKey(
  url: string,
  paragraphIndex: number,
  provider: string,
  voice: string,
  contentHash: string,
): string {
  const normalizedUrl = normalizeUrl(url);
  return `${normalizedUrl}:${paragraphIndex}:${provider}:${voice}:${contentHash}`;
}

/**
 * Generate cache key with async content hashing
 *
 * @param url - Page URL
 * @param paragraphIndex - Paragraph index (0-based)
 * @param provider - TTS provider ID
 * @param voice - Voice ID
 * @param text - Paragraph text content (will be hashed)
 * @returns Promise resolving to cache key string
 */
export async function generateCacheKeyFromText(
  url: string,
  paragraphIndex: number,
  provider: string,
  voice: string,
  text: string,
): Promise<string> {
  const contentHash = await generateContentHash(text);
  return generateCacheKey(url, paragraphIndex, provider, voice, contentHash);
}

/**
 * Parse cache key back into components
 *
 * @param key - Cache key string
 * @returns Parsed components or null if invalid
 */
export function parseCacheKey(key: string): {
  url: string;
  paragraphIndex: number;
  provider: string;
  voice: string;
  contentHash: string;
} | null {
  const parts = key.split(':');

  // Minimum 5 parts: url, index, provider, voice, hash
  // Hash may contain colons so we join remaining parts
  if (parts.length < 5) return null;

  const [url, indexStr, provider, voice, ...hashParts] = parts;
  const paragraphIndex = Number.parseInt(indexStr, 10);

  if (isNaN(paragraphIndex) || paragraphIndex < 0) return null;
  if (!url || !provider || !voice) return null;

  return {
    url,
    paragraphIndex,
    provider,
    voice,
    contentHash: hashParts.join(':'),
  };
}

/**
 * Validate cache key format
 *
 * @param key - Cache key to validate
 * @returns True if valid format
 */
export function isValidCacheKey(key: string): boolean {
  return parseCacheKey(key) !== null;
}

/**
 * Check if two cache keys refer to the same content
 * (same URL, paragraph, and content hash - ignoring provider/voice)
 *
 * @param key1 - First cache key
 * @param key2 - Second cache key
 * @returns True if same content
 */
export function isSameContent(key1: string, key2: string): boolean {
  const parsed1 = parseCacheKey(key1);
  const parsed2 = parseCacheKey(key2);

  if (!parsed1 || !parsed2) return false;

  return (
    parsed1.url === parsed2.url &&
    parsed1.paragraphIndex === parsed2.paragraphIndex &&
    parsed1.contentHash === parsed2.contentHash
  );
}

/**
 * Extract URL pattern for matching multiple cache keys
 * Useful for clearing cache for a specific page
 *
 * @param url - Page URL
 * @returns URL prefix pattern
 */
export function getUrlPattern(url: string): string {
  return `${normalizeUrl(url)}:`;
}
