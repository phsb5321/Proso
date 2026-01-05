/**
 * Groq Timestamp Provider
 * Uses Groq Whisper API to generate word-level timestamps for any TTS provider
 *
 * @module utils/providers/groq-timestamp
 */

import { BaseTTSProvider, type TTSRequest, type TTSResponse, type VoiceOption } from './base';
import type { WordBoundary } from '../audio/playback-sync';

/**
 * Groq Timestamp Provider
 * Generates word-level timing using Groq's Whisper API
 * This is a utility provider that enhances other providers with word timing
 */
export class GroqTimestampProvider extends BaseTTSProvider {
  readonly id = 'groq-timestamp';
  readonly name = 'Groq Timestamp';
  readonly supportsWordTiming = true;
  readonly supportedLanguages: string[] = ['en']; // Whisper supports many languages

  private apiKey: string | null = null;

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  /**
   * This provider doesn't generate audio - it only provides timestamps
   */
  async generateAudio(request: TTSRequest): Promise<TTSResponse> {
    throw new Error('GroqTimestampProvider is for timestamp generation only');
  }

  /**
   * Generate word-level timestamps from audio using Groq Whisper
   * @param audioBlob - Audio blob to analyze
   * @param text - Original text (for validation)
   * @returns Array of word boundaries with timing
   */
  async generateTimestamps(audioBlob: Blob, text: string): Promise<WordBoundary[]> {
    if (!this.hasApiKey()) {
      throw new Error('Groq API key not configured');
    }

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Groq Whisper API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    // Parse word-level timestamps from Whisper response
    if (!result.words || !Array.isArray(result.words)) {
      return [];
    }

    return result.words.map((w: any) => ({
      word: w.word || '',
      startTimeMs: Math.round((w.start || 0) * 1000),
      endTimeMs: Math.round((w.end || 0) * 1000),
    }));
  }

  async getVoices(language?: string): Promise<VoiceOption[]> {
    // This provider doesn't have voices
    return [];
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Groq key validation error:', error);
      return false;
    }
  }
}
