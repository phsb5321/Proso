// TTS controller — HTTP boundary for text-to-speech synthesis
// Maps HTTP requests to core service calls and Result<T,E> to HTTP responses
//
// Routes:
//   POST /api/v1/tts/synthesize — generate audio from text
//   GET  /api/v1/tts/voices/:provider — list voices for a provider

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  TTSProvider,
  SubscriptionTier,
  ErrorCode,
} from '@proso/shared';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { CacheStorePort } from '../../ports/cache-store.port';
import { TTSProviderPort } from '../../ports/tts-provider.port';
import { synthesize } from '../../core/tts/tts.service';

/** Maximum text length accepted by the synthesize endpoint (characters). */
const MAX_TEXT_LENGTH = 5000;

/** Valid TTSProvider values for parameter validation. */
const VALID_PROVIDERS = new Set(Object.values(TTSProvider));

interface SynthesizeBody {
  text: string;
  provider?: string;
  voice?: string;
  language?: string;
}

@Controller('api/v1/tts')
export class TTSController {
  constructor(
    private readonly creditRepository: CreditRepositoryPort,
    private readonly cacheStore: CacheStorePort,
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
    @Inject('TTS_PROVIDERS')
    private readonly providers: Map<TTSProvider, TTSProviderPort>,
  ) {}

  @Post('synthesize')
  @HttpCode(HttpStatus.OK)
  async synthesizeAudio(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: SynthesizeBody,
  ): Promise<void> {
    // --- Authentication ---
    const userId = (req as Request & { userId?: string }).userId;
    if (!userId) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'Authentication required',
        code: ErrorCode.Unauthorized,
      });
      return;
    }

    // --- Input validation ---
    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      throw new BadRequestException('Text is required and must be non-empty');
    }

    if (body.text.length > MAX_TEXT_LENGTH) {
      res.status(HttpStatus.BAD_REQUEST).json({
        error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`,
        code: ErrorCode.TextTooLong,
      });
      return;
    }

    // Validate provider if specified
    let provider: TTSProvider | undefined;
    if (body.provider) {
      if (!VALID_PROVIDERS.has(body.provider as TTSProvider)) {
        throw new BadRequestException(
          `Invalid provider: ${body.provider}. Valid providers: ${Array.from(VALID_PROVIDERS).join(', ')}`,
        );
      }
      provider = body.provider as TTSProvider;
    }

    // --- Look up subscription tier ---
    const subscription =
      await this.subscriptionRepository.findActiveByUserId(userId);
    const tier = subscription
      ? (subscription.tier as SubscriptionTier)
      : SubscriptionTier.Free;

    // --- Call core synthesize service ---
    const result = await synthesize(
      {
        userId,
        text: body.text,
        provider,
        voice: body.voice,
        language: body.language,
        tier,
      },
      {
        cacheStore: this.cacheStore,
        creditRepository: this.creditRepository,
        providers: this.providers,
      },
    );

    // --- Map Result to HTTP response ---
    if (!result.ok) {
      const error = result.error;
      const statusCode = this.mapErrorToStatus(error.code);
      res.status(statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }

    const value = result.value;

    // Set metadata headers
    res.setHeader('X-Credits-Used', String(value.creditsUsed));
    res.setHeader('X-Credits-Remaining', String(value.creditsRemaining));
    res.setHeader('X-Cache-Hit', String(value.cacheHit));
    res.setHeader('X-Provider', value.provider);
    res.setHeader('Content-Type', value.contentType);

    res.send(value.audio);
  }

  @Get('voices/:provider')
  @HttpCode(HttpStatus.OK)
  async getVoices(
    @Param('provider') providerParam: string,
  ): Promise<{ voices: Array<{ id: string; name: string; language?: string; gender?: string }> }> {
    // Validate provider parameter
    if (!VALID_PROVIDERS.has(providerParam as TTSProvider)) {
      throw new BadRequestException(
        `Invalid provider: ${providerParam}. Valid providers: ${Array.from(VALID_PROVIDERS).join(', ')}`,
      );
    }

    const provider = providerParam as TTSProvider;
    const adapter = this.providers.get(provider);

    if (!adapter) {
      throw new BadRequestException(
        `Provider ${provider} is not configured on this server`,
      );
    }

    const result = await adapter.getVoices();

    if (!result.ok) {
      throw new BadRequestException(result.error.message);
    }

    return { voices: result.value };
  }

  /**
   * Map domain error codes to HTTP status codes.
   */
  private mapErrorToStatus(code: ErrorCode): number {
    switch (code) {
      case ErrorCode.InsufficientCredits:
      case ErrorCode.NoActiveAllocation:
        return HttpStatus.PAYMENT_REQUIRED; // 402

      case ErrorCode.ProviderUnavailable:
      case ErrorCode.AllProvidersUnavailable:
        return HttpStatus.SERVICE_UNAVAILABLE; // 503

      case ErrorCode.TextTooLong:
        return HttpStatus.BAD_REQUEST; // 400

      case ErrorCode.Unauthorized:
        return HttpStatus.UNAUTHORIZED; // 401

      default:
        return HttpStatus.INTERNAL_SERVER_ERROR; // 500
    }
  }
}
