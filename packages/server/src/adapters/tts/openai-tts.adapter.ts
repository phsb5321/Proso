// OpenAI TTS adapter — calls the OpenAI audio/speech API
// Returns Result<TTSSynthesizeResult, TTSError> for all fallible operations

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ok, Err, ErrorCode, TTSProvider } from '@voxpage/shared';
import {
  TTSProviderPort,
  type TTSSynthesizeParams,
  type TTSSynthesizeResult,
  type VoiceInfo,
} from '../../ports/tts-provider.port';
import { ttsError, type TTSError } from '../../core/shared/domain-errors';
import type { Result } from '@voxpage/shared';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

const STATIC_VOICES: VoiceInfo[] = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral' },
  { id: 'echo', name: 'Echo', gender: 'male' },
  { id: 'fable', name: 'Fable', gender: 'neutral' },
  { id: 'onyx', name: 'Onyx', gender: 'male' },
  { id: 'nova', name: 'Nova', gender: 'female' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female' },
];

@Injectable()
export class OpenAITTSAdapter extends TTSProviderPort {
  private readonly logger = new Logger(OpenAITTSAdapter.name);
  readonly providerId = TTSProvider.OpenAI;
  readonly supportedLanguages = ['*'];

  constructor(private readonly config: ConfigService) {
    super();
  }

  async synthesize(
    request: TTSSynthesizeParams,
  ): Promise<Result<TTSSynthesizeResult, TTSError>> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return Err(
        ttsError(
          ErrorCode.ProviderUnavailable,
          'OpenAI API key not configured',
          { provider: this.providerId },
        ),
      );
    }

    try {
      const response = await fetch(OPENAI_TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: request.text,
          voice: request.voice ?? 'alloy',
          response_format: 'mp3',
          speed: request.speed ?? 1.0,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        this.logger.warn(
          `OpenAI TTS API returned ${response.status}: ${errorBody}`,
        );
        return Err(
          ttsError(
            ErrorCode.ProviderUnavailable,
            `OpenAI TTS API error: ${response.status}`,
            { status: response.status, body: errorBody },
          ),
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Ok({
        audio: Buffer.from(arrayBuffer),
        contentType: 'audio/mpeg',
        provider: TTSProvider.OpenAI,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      this.logger.error(`OpenAI TTS network failure: ${message}`);
      return Err(
        ttsError(ErrorCode.ProviderUnavailable, `OpenAI TTS failed: ${message}`, {
          provider: this.providerId,
        }),
      );
    }
  }

  async getVoices(
    _language?: string,
  ): Promise<Result<VoiceInfo[], TTSError>> {
    // OpenAI voices are static and language-agnostic (auto-detect)
    return Ok(STATIC_VOICES);
  }
}
