// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Groq TTS Provider
 *
 * Implements Groq's OpenAI-compatible TTS API with support for:
 * - PlayAI Dialog model (10K char limit, multiple formats)
 * - Orpheus model (200 char limit, WAV only, requires chunking)
 *
 * @module utils/providers/groq
 * @see https://console.groq.com/docs/text-to-speech
 */

import type { GroqModel } from '../config/schema';

/**
 * Groq API endpoint (OpenAI-compatible)
 */
export const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/audio/speech';

/**
 * Model configuration data
 */
export interface GroqModelConfig {
  readonly id: GroqModel;
  readonly displayName: string;
  readonly maxCharacters: number;
  readonly pricePerMillionChars: number;
  readonly supportsSpeed: boolean;
  readonly supportedFormats: readonly string[];
  readonly defaultVoice: string;
}

/**
 * Voice configuration data
 */
export interface GroqVoiceConfig {
  readonly id: string;
  readonly name: string;
  readonly gender: 'male' | 'female' | 'neutral';
  readonly model: GroqModel;
}

/**
 * Groq TTS model configurations
 * Updated 2026-01-23: Only Orpheus models are available
 * @see https://console.groq.com/docs/text-to-speech/orpheus
 */
export const GROQ_MODELS: Record<GroqModel, GroqModelConfig> = {
  'canopylabs/orpheus-v1-english': {
    id: 'canopylabs/orpheus-v1-english',
    displayName: 'Orpheus English',
    maxCharacters: 200, // API limit for Orpheus
    pricePerMillionChars: 22,
    supportsSpeed: false,
    supportedFormats: ['wav'],
    defaultVoice: 'troy',
  },
};

/**
 * Available Groq voices for Orpheus English model
 * @see https://console.groq.com/docs/text-to-speech/orpheus
 */
export const GROQ_VOICES: Record<string, GroqVoiceConfig> = {
  // Orpheus English voices (6 total)
  autumn: {
    id: 'autumn',
    name: 'Autumn',
    gender: 'female',
    model: 'canopylabs/orpheus-v1-english',
  },
  diana: { id: 'diana', name: 'Diana', gender: 'female', model: 'canopylabs/orpheus-v1-english' },
  hannah: {
    id: 'hannah',
    name: 'Hannah',
    gender: 'female',
    model: 'canopylabs/orpheus-v1-english',
  },
  austin: { id: 'austin', name: 'Austin', gender: 'male', model: 'canopylabs/orpheus-v1-english' },
  daniel: { id: 'daniel', name: 'Daniel', gender: 'male', model: 'canopylabs/orpheus-v1-english' },
  troy: { id: 'troy', name: 'Troy', gender: 'male', model: 'canopylabs/orpheus-v1-english' },
};

/**
 * Text chunk for segmented audio generation
 */
export interface TextChunk {
  readonly text: string;
  readonly index: number;
  readonly isLast: boolean;
  readonly originalStart: number;
  readonly originalEnd: number;
}

/**
 * Groq TTS generation options
 */
export interface GroqTTSOptions {
  readonly model: GroqModel;
  readonly voice: string;
  readonly speed?: number;
  readonly responseFormat?: 'wav' | 'mp3' | 'flac' | 'ogg' | 'mulaw';
}

/**
 * Groq API error response structure
 */
interface GroqErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
    param?: string;
  };
}

/**
 * Find the best break point in text within maxChars limit.
 * Progressive fallback: sentence → clause → word → hard split
 *
 * @param text - Text to find break point in
 * @param maxChars - Maximum character limit
 * @returns Text slice up to best break point
 */
export function findBestBreakPoint(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  const searchText = text.slice(0, maxChars);

  // Try sentence boundaries first
  const sentenceEnd = Math.max(
    searchText.lastIndexOf('. '),
    searchText.lastIndexOf('! '),
    searchText.lastIndexOf('? '),
  );
  if (sentenceEnd > maxChars * 0.5) {
    return text.slice(0, sentenceEnd + 1);
  }

  // Try clause boundaries
  const clauseEnd = Math.max(
    searchText.lastIndexOf(', '),
    searchText.lastIndexOf('; '),
    searchText.lastIndexOf(': '),
  );
  if (clauseEnd > maxChars * 0.3) {
    return text.slice(0, clauseEnd + 1);
  }

  // Fall back to word boundary
  const wordEnd = searchText.lastIndexOf(' ');
  if (wordEnd > 0) {
    return text.slice(0, wordEnd);
  }

  // Hard split (last resort)
  return text.slice(0, maxChars);
}

/**
 * Split text into chunks respecting character limits.
 * Uses sentence boundaries when possible for natural-sounding concatenation.
 *
 * @param text - Text to chunk
 * @param maxChars - Maximum characters per chunk
 * @returns Array of text chunks with metadata
 */
export function chunkText(text: string, maxChars: number): TextChunk[] {
  if (text.length <= maxChars) {
    return [
      {
        text,
        index: 0,
        isLast: true,
        originalStart: 0,
        originalEnd: text.length,
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let remaining = text;
  let offset = 0;
  let index = 0;

  while (remaining.length > 0) {
    let chunk: string;

    if (remaining.length <= maxChars) {
      chunk = remaining;
    } else {
      chunk = findBestBreakPoint(remaining, maxChars);
    }

    const trimmedRemaining = remaining.slice(chunk.length).trimStart();

    chunks.push({
      text: chunk,
      index,
      isLast: trimmedRemaining.length === 0,
      originalStart: offset,
      originalEnd: offset + chunk.length,
    });

    remaining = trimmedRemaining;
    offset += chunk.length + (remaining.length > 0 ? 1 : 0); // Account for trimmed space
    index++;
  }

  return chunks;
}

/**
 * Concatenate multiple audio blobs into a single blob.
 * Handles WAV format by combining audio data.
 *
 * @param blobs - Array of audio blobs to concatenate
 * @returns Combined audio blob
 */
export async function concatenateAudioBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) {
    return new Blob([], { type: 'audio/wav' });
  }

  if (blobs.length === 1) {
    return blobs[0];
  }

  // For WAV files, we need to combine the audio data properly
  // Simple concatenation works for streaming but for proper WAV we need to handle headers
  const arrayBuffers = await Promise.all(blobs.map((b) => b.arrayBuffer()));

  // For simplicity, concatenate raw audio data (works for streaming playback)
  // A more robust solution would parse WAV headers and combine properly
  return new Blob(arrayBuffers, { type: blobs[0].type });
}

/**
 * Groq TTS Provider class
 *
 * Handles:
 * - API key management
 * - Audio generation with automatic chunking
 * - API key validation
 */
export class GroqProvider {
  private apiKey: string | null = null;

  /**
   * Set the Groq API key
   */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /**
   * Check if API key is set
   */
  hasApiKey(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  /**
   * Generate audio from text using Groq TTS API
   *
   * @param text - Text to convert to speech
   * @param options - TTS options (model, voice, speed, format)
   * @returns Audio blob
   * @throws Error on API failure
   */
  async generateAudio(text: string, options: GroqTTSOptions): Promise<Blob> {
    if (!this.apiKey) {
      throw new Error('Groq API key not set');
    }

    const modelConfig = GROQ_MODELS[options.model];
    if (!modelConfig) {
      throw new Error(`Unknown Groq model: ${options.model}`);
    }

    // Check if chunking is needed
    if (text.length > modelConfig.maxCharacters) {
      return this.generateChunkedAudio(text, options, modelConfig);
    }

    return this.generateSingleAudio(text, options);
  }

  /**
   * Generate audio for text that fits within model limits
   */
  private async generateSingleAudio(text: string, options: GroqTTSOptions): Promise<Blob> {
    const modelConfig = GROQ_MODELS[options.model];

    const body: Record<string, unknown> = {
      model: options.model,
      input: text,
      voice: options.voice || modelConfig.defaultVoice,
      response_format: options.responseFormat || 'mp3',
    };

    // Only add speed for models that support it
    if (modelConfig.supportsSpeed && options.speed !== undefined) {
      body.speed = options.speed;
    }

    const response = await fetch(GROQ_API_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return response.blob();
  }

  /**
   * Generate audio for text that exceeds model limits by chunking
   */
  private async generateChunkedAudio(
    text: string,
    options: GroqTTSOptions,
    modelConfig: GroqModelConfig,
  ): Promise<Blob> {
    const chunks = chunkText(text, modelConfig.maxCharacters);
    const audioBlobs: Blob[] = [];

    // Generate audio for each chunk sequentially to avoid rate limits
    for (const chunk of chunks) {
      const audioBlob = await this.generateSingleAudio(chunk.text, options);
      audioBlobs.push(audioBlob);
    }

    return concatenateAudioBlobs(audioBlobs);
  }

  /**
   * Handle API error responses
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `Groq API error: ${response.status}`;

    try {
      const errorBody = (await response.json()) as GroqErrorResponse;
      if (errorBody.error?.message) {
        errorMessage = errorBody.error.message;
      }
    } catch {
      // Use status text if JSON parsing fails
      errorMessage = `Groq API error: ${response.status} ${response.statusText}`;
    }

    throw new Error(errorMessage);
  }

  /**
   * Validate API key by making a minimal request
   *
   * @returns True if API key is valid
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      // Make a minimal request to validate the key
      // Using Orpheus model which is the only available TTS model
      const response = await fetch(GROQ_API_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'canopylabs/orpheus-v1-english',
          input: 'test',
          voice: 'troy',
          response_format: 'wav',
        }),
      });

      // 401 = invalid key, 400 = bad request (invalid model/params)
      // Successful validation means key is valid
      if (response.ok) {
        return true;
      }

      // Check for invalid API key specifically
      if (response.status === 401) {
        return false;
      }

      // For other errors (400, 429, etc.), try to parse the error
      // 400 with "invalid_api_key" code means invalid key
      try {
        const errorBody = (await response.json()) as { error?: { code?: string } };
        if (errorBody.error?.code === 'invalid_api_key') {
          return false;
        }
      } catch {
        // Ignore JSON parsing errors
      }

      // Rate limits or other errors - assume key is valid
      return response.status !== 401;
    } catch {
      // Network error - can't validate
      return false;
    }
  }

  /**
   * Get voices available for a specific model
   *
   * @param model - Groq model ID (optional, returns all if not specified)
   * @returns Array of voice configurations
   */
  getVoices(model?: GroqModel): GroqVoiceConfig[] {
    const voices = Object.values(GROQ_VOICES);

    if (model) {
      return voices.filter((v) => v.model === model);
    }

    return voices;
  }

  /**
   * Get model configuration
   *
   * @param model - Groq model ID
   * @returns Model configuration or undefined
   */
  getModelConfig(model: GroqModel): GroqModelConfig | undefined {
    return GROQ_MODELS[model];
  }
}

/**
 * Default Groq provider instance
 */
export const groqProvider = new GroqProvider();
