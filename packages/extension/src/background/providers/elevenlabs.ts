// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * ElevenLabs TTS Provider
 * TypeScript port of the working JavaScript implementation
 */

import { browser } from 'wxt/browser';
import { createLogger } from '../../utils/logging/logger';

const log = createLogger('adapter');

// ============================================
// Types
// ============================================

export interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: string;
  description?: string;
}

export interface WordTiming {
  word: string;
  charOffset: number;
  charLength: number;
  startTimeMs: number;
  endTimeMs: number;
}

export interface GenerateOptions {
  turbo?: boolean;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  languageCode?: string;
  withTimestamps?: boolean;
}

export interface AudioWithTiming {
  audioData: ArrayBuffer;
  wordTiming: WordTiming[];
}

// ============================================
// Constants
// ============================================

/**
 * ElevenLabs voice definitions
 * All voices work with all 29+ supported languages via the multilingual model
 */
export const ELEVENLABS_VOICES: Voice[] = [
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel',
    language: 'en-US',
    gender: 'female',
    description: 'Calm, soothing',
  },
  {
    id: '29vD33N1CtxCmqQRPOHJ',
    name: 'Drew',
    language: 'en-US',
    gender: 'male',
    description: 'Well-rounded, confident',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    language: 'en-US',
    gender: 'female',
    description: 'Soft news presenter',
  },
  {
    id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni',
    language: 'en-US',
    gender: 'male',
    description: 'Crisp, natural',
  },
  {
    id: '2EiwWnXFnvU5JabPnv8n',
    name: 'Clyde',
    language: 'en-US',
    gender: 'male',
    description: 'Deep, warm',
  },
  {
    id: '5Q0t7uMcjvnagumLfvZi',
    name: 'Paul',
    language: 'en-US',
    gender: 'male',
    description: 'News anchor style',
  },
  {
    id: 'AZnzlk1XvdvUeBnXmlld',
    name: 'Domi',
    language: 'en-US',
    gender: 'female',
    description: 'Assertive, strong',
  },
  {
    id: 'CYw3kZ02Hs0563khs1Fj',
    name: 'Dave',
    language: 'en-GB',
    gender: 'male',
    description: 'British, conversational',
  },
  {
    id: 'D38z5RcWu1voky8WS1ja',
    name: 'Fin',
    language: 'en-IE',
    gender: 'male',
    description: 'Irish, friendly',
  },
  {
    id: 'MF3mGyEYCl7XYWbV9V6O',
    name: 'Elli',
    language: 'en-US',
    gender: 'female',
    description: 'Youthful, engaging',
  },
];

export const SUPPORTED_LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'pl',
  'tr',
  'ru',
  'nl',
  'cs',
  'ar',
  'zh',
  'hu',
  'ko',
  'ja',
  'hi',
  'sv',
  'id',
  'fil',
  'uk',
  'el',
  'fi',
  'ro',
  'da',
  'bg',
  'ms',
  'sk',
  'hr',
  'ta',
];

// ============================================
// Provider Class
// ============================================

export class ElevenLabsProvider {
  private apiKey: string | null = null;

  constructor(apiKey: string | null = null) {
    this.apiKey = apiKey;
  }

  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
  }

  hasApiKey(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  getVoices(): Voice[] {
    return ELEVENLABS_VOICES;
  }

  getDefaultVoice(): Voice {
    return ELEVENLABS_VOICES[0];
  }

  supportsLanguage(languageCode: string): boolean {
    const primary = languageCode.split('-')[0].toLowerCase();
    return SUPPORTED_LANGUAGES.includes(primary);
  }

  /**
   * Validate API key by checking user subscription
   */
  async validateKey(): Promise<boolean> {
    if (!this.hasApiKey()) {
      return false;
    }

    try {
      const response = await fetch('https://api.elevenlabs.io/v1/user', {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey!,
        },
      });

      return response.ok;
    } catch (error) {
      log.error('ElevenLabs key validation error', { error });
      return false;
    }
  }

  /**
   * Generate audio from text
   */
  async generateAudio(
    text: string,
    voiceId = '21m00Tcm4TlvDq8ikWAM',
    options: GenerateOptions = {},
  ): Promise<ArrayBuffer | AudioWithTiming> {
    if (!this.hasApiKey()) {
      throw new Error('ElevenLabs API key not configured');
    }

    // If timestamps requested, use the with_timestamps endpoint
    if (options.withTimestamps) {
      return this.generateAudioWithTimestamps(text, voiceId, options);
    }

    const modelId = options.turbo ? 'eleven_turbo_v2_5' : 'eleven_multilingual_v2';

    const requestBody: Record<string, unknown> = {
      text: text,
      model_id: modelId,
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
        style: options.style ?? 0.5,
        use_speaker_boost: true,
      },
    };

    // Add language_code if specified
    if (options.languageCode) {
      const primary = options.languageCode.split('-')[0].toLowerCase();
      if (this.supportsLanguage(primary)) {
        requestBody.language_code = primary;
      }
    }

    log.info('[ElevenLabs] Generating audio', { textLength: text.length });

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey!,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorBody: { detail?: { message?: string } } | null = null;
      try {
        errorBody = await response.json();
      } catch {
        // Ignore parse error
      }
      throw new Error(this.buildErrorMessage(response.status, errorBody?.detail?.message));
    }

    return response.arrayBuffer();
  }

  /**
   * Generate audio with word timing data
   */
  async generateAudioWithTimestamps(
    text: string,
    voiceId: string,
    options: GenerateOptions = {},
  ): Promise<AudioWithTiming> {
    const modelId = options.turbo ? 'eleven_turbo_v2_5' : 'eleven_multilingual_v2';

    const requestBody: Record<string, unknown> = {
      text: text,
      model_id: modelId,
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
        style: options.style ?? 0.5,
        use_speaker_boost: true,
      },
    };

    if (options.languageCode) {
      const primary = options.languageCode.split('-')[0].toLowerCase();
      if (this.supportsLanguage(primary)) {
        requestBody.language_code = primary;
      }
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      let errorBody: { detail?: { message?: string } } | null = null;
      try {
        errorBody = await response.json();
      } catch {
        // Ignore parse error
      }
      throw new Error(this.buildErrorMessage(response.status, errorBody?.detail?.message));
    }

    const result = await response.json();

    // Decode base64 audio to ArrayBuffer
    const audioData = this.base64ToArrayBuffer(result.audio_base64);

    // Convert character-level timing to word-level
    const wordTiming = this.parseWordTiming(text, result.alignment);

    return { audioData, wordTiming };
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Parse character-level timing into word boundaries
   */
  private parseWordTiming(
    _text: string,
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    },
  ): WordTiming[] {
    if (!alignment || !alignment.characters || !alignment.character_start_times_seconds) {
      return [];
    }

    const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
    const wordTimings: WordTiming[] = [];
    let currentWord = '';
    let wordStartIndex: number | null = null;
    let wordStartTime: number | null = null;
    let wordEndTime: number | null = null;
    let charOffset = 0;

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const startTime = character_start_times_seconds[i];
      const endTime = character_end_times_seconds[i];

      // Check if this is a word character (Unicode letter or number)
      const isWordChar = /[\p{L}\p{N}]/u.test(char);

      if (isWordChar) {
        if (wordStartIndex === null) {
          wordStartIndex = charOffset;
          wordStartTime = startTime;
        }
        currentWord += char;
        wordEndTime = endTime;
      } else {
        // Non-word character - save current word if exists
        if (
          currentWord.length > 0 &&
          wordStartIndex !== null &&
          wordStartTime !== null &&
          wordEndTime !== null
        ) {
          wordTimings.push({
            word: currentWord,
            charOffset: wordStartIndex,
            charLength: currentWord.length,
            startTimeMs: Math.round(wordStartTime * 1000),
            endTimeMs: Math.round(wordEndTime * 1000),
          });
          currentWord = '';
          wordStartIndex = null;
          wordStartTime = null;
          wordEndTime = null;
        }
      }

      charOffset++;
    }

    // Don't forget the last word
    if (
      currentWord.length > 0 &&
      wordStartIndex !== null &&
      wordStartTime !== null &&
      wordEndTime !== null
    ) {
      wordTimings.push({
        word: currentWord,
        charOffset: wordStartIndex,
        charLength: currentWord.length,
        startTimeMs: Math.round(wordStartTime * 1000),
        endTimeMs: Math.round(wordEndTime * 1000),
      });
    }

    return wordTimings;
  }

  /**
   * Build error message for specific status codes
   */
  private buildErrorMessage(status: number, message?: string): string {
    switch (status) {
      case 401:
        return 'Invalid ElevenLabs API key. Please check your settings.';
      case 422:
        return 'Invalid voice or settings. Please try a different voice.';
      case 429:
        return 'Rate limited. Please wait and try again.';
      default:
        return message || `ElevenLabs API error (${status}). Please try again later.`;
    }
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Load ElevenLabs API key from storage
 */
export async function loadElevenLabsApiKey(): Promise<string | null> {
  const result = await browser.storage.local.get(['elevenlabsApiKey']);
  const key = result.elevenlabsApiKey as string | undefined;
  return key && key.trim().length > 0 ? key.trim() : null;
}

/**
 * Create ElevenLabs provider with API key from storage
 */
export async function createElevenLabsProvider(): Promise<ElevenLabsProvider> {
  const apiKey = await loadElevenLabsApiKey();
  return new ElevenLabsProvider(apiKey);
}
