import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../guards/license-key.guard';
import type { LicenseValidateRequest, LicenseValidateResponse } from '@voxpage/shared';
import { isOk } from '@voxpage/shared';
import { UserRepositoryPort } from '../../ports/user-repository.port';
import { SubscriptionRepositoryPort } from '../../ports/subscription-repository.port';
import { CreditRepositoryPort } from '../../ports/credit-repository.port';
import { validateLicenseKey } from '../../core/subscription/license-validation.service';
import * as crypto from 'crypto';

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
  async validate(@Body() body: LicenseValidateRequest): Promise<LicenseValidateResponse> {
    const keyHash = crypto
      .createHash('sha256')
      .update(body.licenseKey)
      .digest('hex');

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
