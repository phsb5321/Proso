// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * License controller — HTTP boundary for key validation and account-free
 * retrieval.
 *
 * Routes:
 *   POST /api/v1/license/validate        — entitlements for a presented key
 *   POST /api/v1/license/by-transaction  — the key itself, for a buyer who
 *                                          proves their post-checkout claim
 *
 * @module infrastructure/controllers/license.controller
 */

import * as crypto from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type {
  LicenseClaimRequestParsed,
  LicenseClaimResponseParsed,
  LicenseValidateRequestParsed,
  LicenseValidateResponse,
} from '@proso/shared';
import {
  LicenseClaimRequestSchema,
  LicenseValidateRequestSchema,
  isOk,
  unwrapErr,
} from '@proso/shared';
import type { Response } from 'express';
import { claimLicenseByTransaction } from '../../core/subscription/license-retrieval.service';
import { validateLicenseKey } from '../../core/subscription/license-validation.service';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { LicenseKeyRepositoryPort } from '../../ports/license-key-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { UserRepositoryPort } from '../../ports/user-repository.port';
import { Public } from '../guards/license-key.guard';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { licenseIssuanceDeps } from '../services/license-issuance-deps.factory';

@Controller('api/v1/license')
export class LicenseController {
  private readonly logger = new Logger(LicenseController.name);

  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
    private readonly creditRepository: CreditRepositoryPort,
    private readonly licenseKeyRepository: LicenseKeyRepositoryPort,
    private readonly config: ConfigService,
  ) {}

  @Post('validate')
  @Public()
  @HttpCode(HttpStatus.OK)
  async validate(
    @Body(new ZodValidationPipe(LicenseValidateRequestSchema)) body: LicenseValidateRequestParsed,
  ): Promise<LicenseValidateResponse> {
    const keyHash = crypto.createHash('sha256').update(body.licenseKey).digest('hex');

    const result = await validateLicenseKey(keyHash, {
      userRepository: this.userRepository,
      subscriptionRepository: this.subscriptionRepository,
      creditRepository: this.creditRepository,
    });

    if (isOk(result)) {
      return result.value;
    }

    // Should never happen as validateLicenseKey always returns Ok for INV-001
    throw new Error('Unexpected license validation error');
  }

  /**
   * Hand a buyer the key their purchase minted, against the claim secret their
   * own browser generated at the Buy click.
   *
   * Public and password-free by design: Proso has no signup surface (INV-001
   * keeps the free tier account-free). The transaction id only routes the
   * lookup — Paddle publishes it on the success URL as `_ptxn`, so it reaches
   * browser history and proxy logs — and the claim secret is what authorises.
   *
   * Unknown transactions, purchases not recorded yet, and unproven claims all
   * answer `202 pending`, so the endpoint cannot be used to discover which
   * transactions exist. The throttle — 5 per minute — bounds guessing on top
   * of the 256-bit claim secret.
   */
  @Post('by-transaction')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ long: { ttl: 60_000, limit: 5 } })
  async claimByTransaction(
    @Body(new ZodValidationPipe(LicenseClaimRequestSchema))
    body: LicenseClaimRequestParsed,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LicenseClaimResponseParsed> {
    const result = await claimLicenseByTransaction(body.transactionId, body.claimSecret, {
      subscriptionRepository: this.subscriptionRepository,
      ...licenseIssuanceDeps(this.config, this.licenseKeyRepository),
    });

    if (!isOk(result)) {
      const error = unwrapErr(result);

      // Only a server-side key-derivation/integrity fault reaches this branch.
      // Unproven claims are canonical `pending` values and never take a
      // distinguishable logging or response path.
      this.logger.error(`License claim failed: ${error.code}: ${error.message}`);
      throw new ServiceUnavailableException('License key is temporarily unavailable');
    }

    // 202 for `pending`: the purchase may still be in flight, and the caller is
    // expected to poll rather than treat this as a final answer.
    res.status(result.value.status === 'issued' ? HttpStatus.OK : HttpStatus.ACCEPTED);
    return result.value;
  }
}
