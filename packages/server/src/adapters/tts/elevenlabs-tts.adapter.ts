// ElevenLabs TTS adapter — calls the ElevenLabs text-to-speech API
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

const ELEVENLABS_TTS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';
const ELEVENLABS_VOICES_URL = 'https://api.elevenlabs.io/v1/voices';

/** Rachel — default ElevenLabs voice */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: {
    language?: string;
    gender?: string;
  };
}

interface ElevenLabsVoicesResponse {
  voices: ElevenLabsVoice[];
}

@Injectable()
export class ElevenLabsTTSAdapter extends TTSProviderPort {
  private readonly logger = new Logger(ElevenLabsTTSAdapter.name);
  readonly providerId = TTSProvider.ElevenLabs;
  readonly supportedLanguages = [
    'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru',
    'nl', 'cs', 'ar', 'zh', 'ja', 'hi', 'ko', 'hu', 'id',
    'fi', 'vi', 'he', 'el', 'ms', 'ro', 'da', 'ta', 'uk',
    'sk', 'no',
  ];

  constructor(private readonly config: ConfigService) {
    super();
  }

  async synthesize(
    request: TTSSynthesizeParams,
  ): Promise<Result<TTSSynthesizeResult, TTSError>> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return Err(
        ttsError(
          ErrorCode.ProviderUnavailable,
          'ElevenLabs API key not configured',
          { provider: this.providerId },
        ),
      );
    }

    const voiceId = request.voice ?? DEFAULT_VOICE_ID;
    const url = `${ELEVENLABS_TTS_BASE}/${voiceId}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: request.text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        this.logger.warn(
          `ElevenLabs TTS API returned ${response.status}: ${errorBody}`,
        );
        return Err(
          ttsError(
            ErrorCode.ProviderUnavailable,
            `ElevenLabs TTS API error: ${response.status}`,
            { status: response.status, body: errorBody },
          ),
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Ok({
        audio: Buffer.from(arrayBuffer),
        contentType: 'audio/mpeg',
        provider: TTSProvider.ElevenLabs,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      this.logger.error(`ElevenLabs TTS network failure: ${message}`);
      return Err(
        ttsError(
          ErrorCode.ProviderUnavailable,
          `ElevenLabs TTS failed: ${message}`,
          { provider: this.providerId },
        ),
      );
    }
  }

  async getVoices(
    language?: string,
  ): Promise<Result<VoiceInfo[], TTSError>> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return Err(
        ttsError(
          ErrorCode.ProviderUnavailable,
          'ElevenLabs API key not configured',
          { provider: this.providerId },
        ),
      );
    }

    try {
      const response = await fetch(ELEVENLABS_VOICES_URL, {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        this.logger.warn(
          `ElevenLabs voices API returned ${response.status}: ${errorBody}`,
        );
        return Err(
          ttsError(
            ErrorCode.ProviderUnavailable,
            `ElevenLabs voices API error: ${response.status}`,
            { status: response.status, body: errorBody },
          ),
        );
      }

      const data = (await response.json()) as ElevenLabsVoicesResponse;

      let voices: VoiceInfo[] = data.voices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        language: v.labels?.language,
        gender: v.labels?.gender,
      }));

      if (language) {
        voices = voices.filter(
          (v) => !v.language || v.language.startsWith(language),
        );
      }

      return Ok(voices);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      this.logger.error(`ElevenLabs voices fetch failure: ${message}`);
      return Err(
        ttsError(
          ErrorCode.ProviderUnavailable,
          `ElevenLabs voices fetch failed: ${message}`,
          { provider: this.providerId },
        ),
      );
    }
  }
}
