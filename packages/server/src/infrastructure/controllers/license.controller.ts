import * as crypto from 'node:crypto';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { LicenseValidateRequestParsed, LicenseValidateResponse } from '@proso/shared';
import { LicenseValidateRequestSchema, isOk } from '@proso/shared';
import { validateLicenseKey } from '../../core/subscription/license-validation.service';
import type { CreditRepositoryPort } from '../../ports/credit-repository.port';
import type { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import type { UserRepositoryPort } from '../../ports/user-repository.port';
import { Public } from '../guards/license-key.guard';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

@Controller('api/v1/license')
export class LicenseController {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly subscriptionRepository: SubscriptionRepositoryPort,
    private readonly creditRepository: CreditRepositoryPort,
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
}
