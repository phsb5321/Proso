// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso AudioChunk Zod Schemas
 *
 * Schemas for cached TTS audio segments.
 *
 * @module utils/schemas/audio-chunk.schema
 */

import { z } from 'zod';
import { djb2Hash, sha256HexOrDjb2 } from '../hash';

/**
 * AudioChunk schema - Cached TTS audio segment
 *
 * Stored in IndexedDB for offline playback and reduced API costs.
 */
const AudioChunkSchema = z.object({
  // Identity (composite key)
  /** Composite key: `${urlHash}:${paragraphIndex}:${voiceId}` */
  id: z.string().min(1),

  // References
  /** Page URL */
  url: z.string().url(),

  /** Which paragraph (0-based) */
  paragraphIndex: z.number().int().nonnegative(),

  // Audio data (Blob cannot be validated by Zod, handled at runtime)
  /** MP3 audio data - validated at runtime */
  audioBlob: z.instanceof(Blob),

  /** Playback duration in milliseconds */
  durationMs: z.number().positive(),

  // Generation metadata
  /** ElevenLabs voice ID */
  voiceId: z.string().min(1),

  /** SHA-256 hash of paragraph text (for invalidation) */
  textHash: z.string().min(1),

  // Timestamps
  /** ISO 8601 creation timestamp */
  created: z.string().datetime(),

  /** ISO 8601 last accessed timestamp (for LRU eviction) */
  lastAccessed: z.string().datetime(),
});

export type AudioChunk = z.infer<typeof AudioChunkSchema>;

/**
 * Generate composite cache key
 *
 * @param url - Page URL
 * @param paragraphIndex - Paragraph index
 * @param voiceId - ElevenLabs voice ID
 * @returns Composite key string
 */
function generateAudioChunkId(url: string, paragraphIndex: number, voiceId: string): string {
  // Hash URL for consistent key length
  const urlHash = djb2Hash(url);
  return `${urlHash}:${paragraphIndex}:${voiceId}`;
}

/**
 * Generate text hash for invalidation
 * Uses SHA-256 via Web Crypto API
 *
 * @param text - Paragraph text
 * @returns Promise resolving to hex hash string
 */

/**
 * Create a new AudioChunk
 */
async function createAudioChunk(params: {
  url: string;
  paragraphIndex: number;
  audioBlob: Blob;
  durationMs: number;
  voiceId: string;
  text: string;
}): Promise<AudioChunk> {
  const id = generateAudioChunkId(params.url, params.paragraphIndex, params.voiceId);
  const textHash = await sha256HexOrDjb2(params.text);
  const now = new Date().toISOString();

  return {
    id,
    url: params.url,
    paragraphIndex: params.paragraphIndex,
    audioBlob: params.audioBlob,
    durationMs: params.durationMs,
    voiceId: params.voiceId,
    textHash,
    created: now,
    lastAccessed: now,
  };
}

/**
 * Calculate cache size from chunks
 *
 * @param chunks - Array of AudioChunks
 * @returns Total size in bytes
 */
function calculateCacheSize(chunks: AudioChunk[]): number {
  return chunks.reduce((total, chunk) => total + chunk.audioBlob.size, 0);
}
