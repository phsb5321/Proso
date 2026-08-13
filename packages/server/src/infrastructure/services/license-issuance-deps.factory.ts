// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Builds the dependency bundle the license issuance domain needs from Nest's
 * configuration.
 *
 * One place reads `LICENSE_KEY_SECRET` and decides which environment prefix to
 * mint under. Every present and future caller must reuse it so key derivation
 * cannot drift across infrastructure boundaries.
 *
 * @module infrastructure/services/license-issuance-deps.factory
 */

import type { ConfigService } from '@nestjs/config';
import type { LicenseIssuanceDeps } from '../../core/subscription/license-issuance.service';
import { licenseKeyEnvironment } from '../../core/subscription/license-key';
import type { LicenseKeyRepositoryPort } from '../../ports/license-key-repository.port';

export function licenseIssuanceDeps(
  config: ConfigService,
  licenseKeyRepository: LicenseKeyRepositoryPort,
): LicenseIssuanceDeps {
  return {
    licenseKeyRepository,
    secret:
      config.get<string>('app.licenseKeySecret') ?? config.get<string>('LICENSE_KEY_SECRET') ?? '',
    environment: licenseKeyEnvironment(
      config.get<string>('app.nodeEnv') ?? config.get<string>('NODE_ENV'),
    ),
  };
}
