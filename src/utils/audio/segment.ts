/**
 * AudioSegment Class
 * Represents a cached audio segment for TTS playback
 *
 * @module utils/audio/segment
 */

import { z } from 'zod';

/**
 * Metadata schema for audio segment creation
 */
export const audioSegmentMetadataSchema = z.object({
  provider: z.string().optional().default(''),
  voice: z.string().optional().default(''),
  text: z.string().optional().default(''),
  duration: z.number().nonnegative().optional().default(0),
});

export type AudioSegmentMetadata = z.infer<typeof audioSegmentMetadataSchema>;

/**
 * Audio segment data interface
 */
export interface AudioSegmentData {
  cacheKey: string;
  audioData: ArrayBuffer;
  provider: string;
  voice: string;
  text: string;
  duration: number;
  createdAt: number;
  lastAccessedAt: number;
  size: number;
}

/**
 * AudioSegment class for cached TTS audio data
 */
export class AudioSegment implements AudioSegmentData {
  public readonly cacheKey: string;
  public readonly audioData: ArrayBuffer;
  public readonly provider: string;
  public readonly voice: string;
  public readonly text: string;
  public readonly duration: number;
  public readonly createdAt: number;
  public readonly size: number;
  public lastAccessedAt: number;

  /**
   * Create an AudioSegment
   * @param cacheKey - Unique cache key
   * @param audioData - Raw audio data
   * @param metadata - Segment metadata
   */
  constructor(
    cacheKey: string,
    audioData: ArrayBuffer,
    metadata: Partial<AudioSegmentMetadata> = {}
  ) {
    // Validate metadata using Zod schema
    const validated = audioSegmentMetadataSchema.parse(metadata);

    this.cacheKey = cacheKey;
    this.audioData = audioData;
    this.provider = validated.provider;
    this.voice = validated.voice;
    this.text = validated.text;
    this.duration = validated.duration;
    this.createdAt = Date.now();
    this.lastAccessedAt = this.createdAt;
    this.size = audioData.byteLength;
  }

  /**
   * Update last accessed timestamp
   */
  touch(): void {
    this.lastAccessedAt = Date.now();
  }

  /**
   * Get the age of this segment in milliseconds
   */
  getAge(): number {
    return Date.now() - this.createdAt;
  }

  /**
   * Check if segment is stale (older than maxAge)
   * @param maxAge - Maximum age in milliseconds
   */
  isStale(maxAge: number): boolean {
    return this.getAge() > maxAge;
  }

  /**
   * Create an Audio element from this segment
   */
  createAudioElement(): HTMLAudioElement {
    const blob = new Blob([this.audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    // Clean up blob URL when audio is no longer needed
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onerror = () => URL.revokeObjectURL(url);

    return audio;
  }

  /**
   * Generate a cache key from segment properties
   * @param provider - Provider ID
   * @param voice - Voice ID
   * @param text - Text content
   */
  static generateCacheKey(provider: string, voice: string, text: string): string {
    // Simple hash function for cache key generation
    const input = `${provider}:${voice}:${text}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `audio_${provider}_${Math.abs(hash).toString(16)}`;
  }
}
