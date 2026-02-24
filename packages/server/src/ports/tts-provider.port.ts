// TTS provider port — abstract contract for server-side TTS synthesis
// Implemented by OpenAI, ElevenLabs, Groq adapters
// ZERO NestJS imports — used as DI token via abstract class

import type { Result } from '@proso/shared';
import { TTSProvider } from '@proso/shared';
import type { TTSError } from '../core/shared/domain-errors.js';

export interface TTSSynthesizeParams {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
}

export interface TTSSynthesizeResult {
  audio: Buffer;
  contentType: string;
  provider: TTSProvider;
  durationMs?: number;
}

export interface VoiceInfo {
  id: string;
  name: string;
  language?: string;
  gender?: string;
}

export abstract class TTSProviderPort {
  abstract readonly providerId: TTSProvider;
  abstract readonly supportedLanguages: string[];

  abstract synthesize(
    request: TTSSynthesizeParams,
  ): Promise<Result<TTSSynthesizeResult, TTSError>>;

  abstract getVoices(
    language?: string,
  ): Promise<Result<VoiceInfo[], TTSError>>;
}
