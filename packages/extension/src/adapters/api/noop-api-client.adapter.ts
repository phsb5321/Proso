/**
 * No-Op API Client Adapter
 *
 * Returns free-tier defaults for all calls.
 * Used when server URL is not configured (BYOK-only mode).
 *
 * INV-001: Free tier never requires account creation.
 *
 * @module adapters/api/noop-api-client
 */

import type { Result } from '../../core/shared/result';
import { Err } from '../../core/shared/result';
import type { IApiClient, ApiClientError, SynthesizeResponse } from '../../ports/api-client.port';
import { apiClientError } from '../../ports/api-client.port';
import type {
  LicenseValidateResponse,
  SubscriptionDetailsResponse,
  CheckoutResponse,
  CreditBalanceResponse,
  CreditHistoryResponse,
  TTSSynthesizeRequest,
  TTSTestKeyResponse,
} from '@proso/shared';

const NOT_CONFIGURED = apiClientError.notConfigured(
  'Server URL not configured. Extension operates in BYOK-only mode.',
);

/**
 * No-op API client — all methods return not_configured errors.
 * This is the default adapter when no server URL is set.
 */
export class NoOpApiClientAdapter implements IApiClient {
  get isConfigured(): boolean {
    return false;
  }

  async validateLicense(
    _licenseKey: string,
  ): Promise<Result<LicenseValidateResponse, ApiClientError>> {
    return Err(NOT_CONFIGURED);
  }

  async getSubscription(): Promise<Result<SubscriptionDetailsResponse, ApiClientError>> {
    return Err(NOT_CONFIGURED);
  }

  async getCreditBalance(): Promise<Result<CreditBalanceResponse, ApiClientError>> {
    return Err(NOT_CONFIGURED);
  }

  async getCreditHistory(
    _limit?: number,
    _offset?: number,
  ): Promise<Result<CreditHistoryResponse, ApiClientError>> {
    return Err(NOT_CONFIGURED);
  }

  async createCheckout(
    _tier: string,
  ): Promise<Result<CheckoutResponse, ApiClientError>> {
    return Err(NOT_CONFIGURED);
  }

  async synthesize(
    _request: TTSSynthesizeRequest,
  ): Promise<Result<SynthesizeResponse, ApiClientError>> {
    return Err(NOT_CONFIGURED);
  }

  async testApiKey(
    _provider: string,
    _apiKey: string,
  ): Promise<Result<TTSTestKeyResponse, ApiClientError>> {
    return Err(NOT_CONFIGURED);
  }
}
