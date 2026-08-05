// TTS controller — HTTP boundary for text-to-speech synthesis
// Maps HTTP requests to core service calls and Result<T,E> to HTTP responses
//
// Routes:
//   POST /api/v1/tts/synthesize — generate audio from text
//   POST /api/v1/tts/test-key   — validate a BYOK API key (rate-limited)
//   GET  /api/v1/tts/voices/:provider — list voices for a provider

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ErrorCode,
  SubscriptionTier,
  TTSProvider,
  TTSSynthesizeRequestSchema,
  TTSTestKeyRequestSchema,
} from '@proso/shared';
import type {
  TTSSynthesizeRequestParsed,
  TTSTestKeyRequestParsed,
  TTSTestKeyResponse,
} from '@proso/shared';
import type { Request, Response } from 'express';
import { synthesize } from '../../core/tts/tts.service';
import { CacheStorePort } from '../../ports/cache-store.port';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { LoggerPort } from '../../ports/logger.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import type { TTSProviderPort } from '../../ports/tts-provider.port';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

/** Maximum text length accepted by the synthesize endpoint (characters). */
const MAX_TEXT_LENGTH = 5000;

/** Valid TTSProvider values for parameter validation. */
const VALID_PROVIDERS = new Set(Object.values(TTSProvider));

@Controller('api/v1/tts')
export class TTSController {
  constructor(
    private readonly creditRepository: CreditRepositoryPort,
    private readonly cacheStore: CacheStorePort,
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
    @Inject('TTS_PROVIDERS')
    private readonly providers: Map<TTSProvider, TTSProviderPort>,
    @Optional()
    private readonly logger?: LoggerPort,
  ) {}

  @Post('synthesize')
  @HttpCode(HttpStatus.OK)
  async synthesizeAudio(
    @Req() req: Request,
    @Res() res: Response,
    @Body(new ZodValidationPipe(TTSSynthesizeRequestSchema)) body: TTSSynthesizeRequestParsed,
  ): Promise<void> {
    // --- Authentication ---
    // INV-001: Free tier never requires account creation, so unauthenticated
    // requests are accepted and treated as Free tier. They may use BYOK (the
    // user's own key); they may NOT spend the server's provider keys because
    // tts.service.ts rejects Free managed synthesis via FEATURE_MATRIX.managedTts.
    const userId = (req as Request & { userId?: string }).userId;
    const isByok = !!body.byokApiKey;

    // --- Input validation (defense-in-depth; Zod pipe handles HTTP layer) ---
    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      throw new BadRequestException('Text is required and must be non-empty');
    }

    if (body.text.length > MAX_TEXT_LENGTH) {
      const message = `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`;
      res.status(HttpStatus.BAD_REQUEST).json({
        error: message,
        message,
        code: ErrorCode.TextTooLong,
      });
      return;
    }

    // Validate provider if specified (defense-in-depth)
    let provider: TTSProvider | undefined;
    if (body.provider) {
      if (!VALID_PROVIDERS.has(body.provider as TTSProvider)) {
        throw new BadRequestException(
          `Invalid provider: ${body.provider}. Valid providers: ${Array.from(VALID_PROVIDERS).join(', ')}`,
        );
      }
      provider = body.provider as TTSProvider;
    }

    // BYOK must specify a provider
    if (isByok && !provider) {
      throw new BadRequestException('BYOK requests must specify a provider');
    }

    // --- Look up subscription tier ---
    // For BYOK without userId, default to Free tier (INV-002: BYOK available on all tiers)
    let tier = SubscriptionTier.Free;
    if (userId) {
      const subscription = await this.subscriptionRepository.findActiveByUserId(userId);
      tier = subscription ? (subscription.tier as SubscriptionTier) : SubscriptionTier.Free;
    }

    // --- Call core synthesize service ---
    const result = await synthesize(
      {
        userId: userId ?? 'byok-anonymous',
        text: body.text,
        provider,
        voice: body.voice,
        language: body.language,
        tier,
        byokApiKey: body.byokApiKey,
      },
      {
        cacheStore: this.cacheStore,
        creditRepository: this.creditRepository,
        providers: this.providers,
        ...(this.logger ? { logger: this.logger } : {}),
      },
    );

    // --- Map Result to HTTP response ---
    if (!result.ok) {
      const error = result.error;
      const statusCode = this.mapErrorToStatus(error.code);
      res.status(statusCode).json({
        error: error.message,
        message: error.message,
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

  @Post('test-key')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ long: { ttl: 60_000, limit: 5 } })
  async testKey(
    @Body(new ZodValidationPipe(TTSTestKeyRequestSchema)) body: TTSTestKeyRequestParsed,
  ): Promise<TTSTestKeyResponse> {
    // Defense-in-depth: Zod pipe validates at HTTP boundary; manual checks for direct calls
    if (!body.provider || !body.apiKey) {
      throw new BadRequestException('provider and apiKey are required');
    }

    if (!VALID_PROVIDERS.has(body.provider as TTSProvider)) {
      throw new BadRequestException(
        `Invalid provider: ${body.provider}. Valid providers: ${Array.from(VALID_PROVIDERS).join(', ')}`,
      );
    }

    const provider = body.provider as TTSProvider;
    const adapter = this.providers.get(provider);

    if (!adapter) {
      return {
        success: false,
        provider: body.provider,
        error: 'Provider not available on this server',
      };
    }

    // Validate the key via a minimal synthesis call (1 character)
    // BYOK key is passed through the adapter and NOT logged or persisted
    const start = Date.now();
    const result = await adapter.synthesize({
      text: 'a',
      byokApiKey: body.apiKey,
    });
    const latencyMs = Date.now() - start;

    if (result.ok) {
      return { success: true, provider: body.provider, latencyMs };
    }

    return {
      success: false,
      provider: body.provider,
      error: result.error.message,
      latencyMs,
    };
  }

  // Throttled like test-key, and for the same reason: this route is
  // unauthenticated and the ElevenLabs adapter answers it by calling the vendor
  // with the server's own key. Listing voices costs no TTS credits, but an
  // unbounded caller can still burn our rate-limit budget on that account. The
  // other three adapters return static lists and make no network call.
  @Get('voices/:provider')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ long: { ttl: 60_000, limit: 30 } })
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
      throw new BadRequestException(`Provider ${provider} is not configured on this server`);
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
