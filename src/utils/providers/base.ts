/**
 * VoxPage TTS Provider Base Interface
 * Common interface for all text-to-speech providers
 *
 * @module utils/providers/base
 */

import { z } from 'zod';
import type { WordBoundary } from '../audio/playback-sync';

/**
 * TTS request schema
 */
export const ttsRequestSchema = z.object({
  text: z.string().min(1),
  voice: z.string().nullable().optional(),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  language: z.string().nullable().optional(), // BCP-47 code
});

/**
 * TTS response schema
 */
export const ttsResponseSchema = z.object({
  audioData: z.instanceof(Blob),
  wordTimings: z.array(z.any()).nullable().optional(), // WordBoundary[] but allowing flexible input
  duration: z.number().positive(),
  provider: z.string(),
});

/**
 * Voice option schema
 */
export const voiceOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string().optional(), // BCP-47 code
  gender: z.enum(['male', 'female', 'neutral']).optional(),
  previewUrl: z.string().url().optional(),
});

/**
 * Inferred TypeScript types
 */
export type TTSRequest = z.infer<typeof ttsRequestSchema>;
export type TTSResponse = z.infer<typeof ttsResponseSchema>;
export type VoiceOption = z.infer<typeof voiceOptionSchema>;

/**
 * Provider interface that all TTS providers must implement
 */
export interface ITTSProvider {
  /**
   * Unique provider identifier
   */
  readonly id: string;

  /**
   * Human-readable provider name
   */
  readonly name: string;

  /**
   * Whether this provider supports word-level timing
   */
  readonly supportsWordTiming: boolean;

  /**
   * Supported languages (BCP-47 codes)
   * Empty array means all languages supported
   */
  readonly supportedLanguages: string[];

  /**
   * Generate audio from text
   */
  generateAudio(request: TTSRequest): Promise<TTSResponse>;

  /**
   * Get available voices for a language
   * @param language - Optional BCP-47 language code
   */
  getVoices(language?: string): Promise<VoiceOption[]>;

  /**
   * Validate API key (if applicable)
   * @param apiKey - API key to validate
   * @returns True if valid, false otherwise
   */
  validateApiKey(apiKey: string): Promise<boolean>;
}

/**
 * Abstract base class for TTS providers
 * Provides common functionality and validation
 */
export abstract class BaseTTSProvider implements ITTSProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly supportsWordTiming: boolean;
  abstract readonly supportedLanguages: string[];

  abstract generateAudio(request: TTSRequest): Promise<TTSResponse>;
  abstract getVoices(language?: string): Promise<VoiceOption[]>;
  abstract validateApiKey(apiKey: string): Promise<boolean>;

  /**
   * Validate and parse TTS request
   * @protected
   */
  protected validateRequest(request: TTSRequest): TTSRequest {
    return ttsRequestSchema.parse(request);
  }

  /**
   * Create standardized TTS response
   * @protected
   */
  protected createResponse(
    audioData: Blob,
    duration: number,
    wordTimings: WordBoundary[] | null = null
  ): TTSResponse {
    return {
      audioData,
      wordTimings,
      duration,
      provider: this.id,
    };
  }

  /**
   * Check if provider supports a specific language
   * @protected
   */
  protected supportsLanguage(languageCode: string): boolean {
    if (this.supportedLanguages.length === 0) return true; // All languages supported
    return this.supportedLanguages.includes(languageCode);
  }
}
