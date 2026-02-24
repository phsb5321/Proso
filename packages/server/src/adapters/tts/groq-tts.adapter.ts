// Groq TTS adapter — calls the Groq audio/speech API (OpenAI-compatible)
// Returns Result<TTSSynthesizeResult, TTSError> for all fallible operations

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ok, Err, ErrorCode, TTSProvider } from '@proso/shared';
import {
  TTSProviderPort,
  type TTSSynthesizeParams,
  type TTSSynthesizeResult,
  type VoiceInfo,
} from '../../ports/tts-provider.port';
import { ttsError, type TTSError } from '../../core/shared/domain-errors';
import type { Result } from '@proso/shared';

const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech';

const STATIC_VOICES: VoiceInfo[] = [
  { id: 'Fritz-PlayAI', name: 'Fritz', gender: 'male' },
  { id: 'Arista-PlayAI', name: 'Arista', gender: 'female' },
  { id: 'Atlas-PlayAI', name: 'Atlas', gender: 'male' },
  { id: 'Deedee-PlayAI', name: 'Deedee', gender: 'female' },
];

@Injectable()
export class GroqTTSAdapter extends TTSProviderPort {
  private readonly logger = new Logger(GroqTTSAdapter.name);
  readonly providerId = TTSProvider.Groq;
  readonly supportedLanguages = ['en'];

  constructor(private readonly config: ConfigService) {
    super();
  }

  async synthesize(
    request: TTSSynthesizeParams,
  ): Promise<Result<TTSSynthesizeResult, TTSError>> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      return Err(
        ttsError(
          ErrorCode.ProviderUnavailable,
          'Groq API key not configured',
          { provider: this.providerId },
        ),
      );
    }

    try {
      const response = await fetch(GROQ_TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'playai-tts',
          input: request.text,
          voice: request.voice ?? 'Fritz-PlayAI',
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        this.logger.warn(
          `Groq TTS API returned ${response.status}: ${errorBody}`,
        );
        return Err(
          ttsError(
            ErrorCode.ProviderUnavailable,
            `Groq TTS API error: ${response.status}`,
            { status: response.status, body: errorBody },
          ),
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Ok({
        audio: Buffer.from(arrayBuffer),
        contentType: 'audio/mpeg',
        provider: TTSProvider.Groq,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      this.logger.error(`Groq TTS network failure: ${message}`);
      return Err(
        ttsError(ErrorCode.ProviderUnavailable, `Groq TTS failed: ${message}`, {
          provider: this.providerId,
        }),
      );
    }
  }

  async getVoices(
    _language?: string,
  ): Promise<Result<VoiceInfo[], TTSError>> {
    // Groq voices are static and English-only
    return Ok(STATIC_VOICES);
  }
}
