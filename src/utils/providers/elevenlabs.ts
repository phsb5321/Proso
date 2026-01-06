// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * ElevenLabs TTS Provider
 * Implementation of ITTSProvider for ElevenLabs text-to-speech API with word timing support
 *
 * @module utils/providers/elevenlabs
 */

import { BaseTTSProvider, type TTSRequest, type TTSResponse, type VoiceOption } from './base';
import { ProviderPricing } from './pricing';

/**
 * Word timing data structure
 */
export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

/**
 * Response from ElevenLabs with-timestamps endpoint
 */
interface ElevenLabsTimestampResponse {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  normalized_alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

/**
 * Audio with word timing response
 */
export interface AudioWithTimingResponse {
  audioBlob: Blob;
  wordTimings: WordTiming[];
  duration: number;
}

/**
 * ElevenLabs voice definitions
 * Note: multilingual_v2 model supports all 29+ languages with any voice
 */
const ELEVENLABS_VOICES: VoiceOption[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en-US', gender: 'female' },
  { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew', language: 'en-US', gender: 'male' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', language: 'en-US', gender: 'female' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', language: 'en-US', gender: 'male' },
  { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', language: 'en-US', gender: 'male' },
  { id: '5Q0t7uMcjvnagumLfvZi', name: 'Paul', language: 'en-US', gender: 'male' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', language: 'en-US', gender: 'female' },
  { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', language: 'en-GB', gender: 'male' },
  { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin', language: 'en-IE', gender: 'male' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', language: 'en-US', gender: 'female' },
];

/**
 * ElevenLabs TTS Provider Implementation
 * Supports 29+ languages and word-level timing
 */
export class ElevenLabsProvider extends BaseTTSProvider {
  readonly id = 'elevenlabs';
  readonly name = 'ElevenLabs';
  readonly supportsWordTiming = true; // ElevenLabs provides character-level alignment
  readonly supportedLanguages: string[] = [
    'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl',
    'cs', 'ar', 'zh', 'hu', 'ko', 'ja', 'hi', 'sv', 'id', 'fil',
    'uk', 'el', 'fi', 'ro', 'da', 'bg', 'ms', 'sk', 'hr', 'ta',
  ];

  private apiKey: string | null = null;

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  async generateAudio(request: TTSRequest): Promise<TTSResponse> {
    const validated = this.validateRequest(request);

    if (!this.hasApiKey()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voiceId = validated.voice || '21m00Tcm4TlvDq8ikWAM'; // Default to Rachel

    const requestBody: any = {
      text: validated.text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      },
    };

    // Add language code if specified
    if (validated.language) {
      // ElevenLabs uses ISO 639-1 codes (e.g., 'en', 'es', 'fr')
      const langCode = validated.language.split('-')[0].toLowerCase();
      if (this.supportsLanguage(langCode)) {
        requestBody.language_code = langCode;
      }
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey!,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });

    // Estimate duration
    const estimatedDuration = validated.text.length / (150 * 5) * 60;

    return this.createResponse(audioBlob, estimatedDuration, null);
  }

  /**
   * Generate audio with word-level timestamps using ElevenLabs with-timestamps endpoint
   * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
   */
  async generateAudioWithTimestamps(
    text: string,
    voiceId?: string,
    language?: string
  ): Promise<AudioWithTimingResponse> {
    if (!this.hasApiKey()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voice = voiceId || '21m00Tcm4TlvDq8ikWAM'; // Default to Rachel

    const requestBody: Record<string, unknown> = {
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      },
    };

    // Add language code if specified
    if (language) {
      const langCode = language.split('-')[0].toLowerCase();
      if (this.supportsLanguage(langCode)) {
        requestBody.language_code = langCode;
      }
    }

    console.log('[ElevenLabs] Generating audio with timestamps, text length:', text.length);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`ElevenLabs API error (${response.status}): ${errorText}`);
    }

    const data: ElevenLabsTimestampResponse = await response.json();

    // Convert base64 audio to Blob
    const binaryString = atob(data.audio_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });

    // Use normalized alignment if available (handles text normalization like numbers -> words)
    const alignment = data.normalized_alignment || data.alignment;

    // Parse character-level timestamps into word-level timestamps
    const wordTimings = this.parseWordTimings(
      alignment.characters,
      alignment.character_start_times_seconds,
      alignment.character_end_times_seconds
    );

    // Get duration from last character end time
    const duration = alignment.character_end_times_seconds.length > 0
      ? alignment.character_end_times_seconds[alignment.character_end_times_seconds.length - 1]
      : 0;

    console.log('[ElevenLabs] Generated audio with', wordTimings.length, 'word timings, duration:', duration);

    return {
      audioBlob,
      wordTimings,
      duration,
    };
  }

  /**
   * Parse character-level timestamps into word-level timestamps
   * Groups consecutive characters between spaces into words
   */
  private parseWordTimings(
    characters: string[],
    startTimes: number[],
    endTimes: number[]
  ): WordTiming[] {
    const wordTimings: WordTiming[] = [];
    let currentWord = '';
    let wordStartMs = 0;
    let wordEndMs = 0;

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const startMs = Math.round(startTimes[i] * 1000);
      const endMs = Math.round(endTimes[i] * 1000);

      if (char === ' ' || char === '\n' || char === '\t') {
        // End of word - save it if we have content
        if (currentWord.trim().length > 0) {
          wordTimings.push({
            word: currentWord.trim(),
            startMs: wordStartMs,
            endMs: wordEndMs,
          });
        }
        currentWord = '';
      } else {
        // Add character to current word
        if (currentWord === '') {
          wordStartMs = startMs;
        }
        currentWord += char;
        wordEndMs = endMs;
      }
    }

    // Don't forget the last word
    if (currentWord.trim().length > 0) {
      wordTimings.push({
        word: currentWord.trim(),
        startMs: wordStartMs,
        endMs: wordEndMs,
      });
    }

    return wordTimings;
  }

  async getVoices(language?: string): Promise<VoiceOption[]> {
    // All voices support all languages via multilingual_v2 model
    return ELEVENLABS_VOICES;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('ElevenLabs key validation error:', error);
      return false;
    }
  }

  protected clampSpeed(speed: number): number {
    // ElevenLabs doesn't support speed in API - handled by playbackRate
    return 1.0;
  }
}
