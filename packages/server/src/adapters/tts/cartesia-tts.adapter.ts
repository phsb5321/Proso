// Cartesia TTS adapter — calls the Cartesia text-to-speech API
// BYOK-only: no server-side API key required (byokApiKey must be provided per request)
// Returns Result<TTSSynthesizeResult, TTSError> for all fallible operations

import { Injectable, Logger } from '@nestjs/common';
import { Ok, Err, ErrorCode, TTSProvider } from '@proso/shared';
import {
  TTSProviderPort,
  type TTSSynthesizeParams,
  type TTSSynthesizeResult,
  type VoiceInfo,
} from '../../ports/tts-provider.port';
import { ttsError, type TTSError } from '../../core/shared/domain-errors';
import type { Result } from '@proso/shared';

const CARTESIA_TTS_URL = 'https://api.cartesia.ai/tts/bytes';

const STATIC_VOICES: VoiceInfo[] = [
  { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Barbershop Man', language: 'en', gender: 'male' },
  { id: '156fb8d2-335b-4950-9cb3-a2d33f8c717e', name: 'British Lady', language: 'en', gender: 'female' },
  { id: 'c45bc5ec-dc68-4feb-8829-6e6b2748095d', name: 'Confident British Man', language: 'en', gender: 'male' },
  { id: 'e00d0480-4cb5-4c47-99df-d85b3b0465c1', name: 'Female Narrator', language: 'en', gender: 'female' },
  { id: '41534e16-2966-4c6b-9670-111411def906', name: 'Newsman', language: 'en', gender: 'male' },
  { id: 'bf991597-6c13-47e4-8411-91ec2de5c466', name: 'Nonfiction Man', language: 'en', gender: 'male' },
  { id: 'b7d50908-b89b-4ec4-b157-2d0df75e1f33', name: 'Reflective Woman', language: 'en', gender: 'female' },
  { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'Reading Man', language: 'en', gender: 'male' },
];

@Injectable()
export class CartesiaTTSAdapter extends TTSProviderPort {
  private readonly logger = new Logger(CartesiaTTSAdapter.name);
  readonly providerId = TTSProvider.Cartesia;
  readonly supportedLanguages = ['en'];

  async synthesize(
    request: TTSSynthesizeParams,
  ): Promise<Result<TTSSynthesizeResult, TTSError>> {
    const apiKey = request.byokApiKey;
    if (!apiKey) {
      return Err(
        ttsError(
          ErrorCode.ProviderUnavailable,
          'Cartesia requires a BYOK API key (no server-side key configured)',
          { provider: this.providerId },
        ),
      );
    }

    try {
      const voice = request.voice ?? STATIC_VOICES[0].id;

      const response = await fetch(CARTESIA_TTS_URL, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Cartesia-Version': '2024-06-10',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'sonic-2',
          transcript: request.text,
          voice: {
            mode: 'id',
            id: voice,
          },
          output_format: {
            container: 'mp3',
            bit_rate: 128000,
            sample_rate: 44100,
          },
          language: request.language ?? 'en',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'unknown');
        this.logger.warn(
          `Cartesia TTS API returned ${response.status}: ${errorBody}`,
        );
        return Err(
          ttsError(
            ErrorCode.ProviderUnavailable,
            `Cartesia TTS API error: ${response.status}`,
            { status: response.status, body: errorBody },
          ),
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Ok({
        audio: Buffer.from(arrayBuffer),
        contentType: 'audio/mpeg',
        provider: TTSProvider.Cartesia,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error';
      this.logger.error(`Cartesia TTS network failure: ${message}`);
      return Err(
        ttsError(ErrorCode.ProviderUnavailable, `Cartesia TTS failed: ${message}`, {
          provider: this.providerId,
        }),
      );
    }
  }

  async getVoices(
    _language?: string,
  ): Promise<Result<VoiceInfo[], TTSError>> {
    return Ok(STATIC_VOICES);
  }
}
