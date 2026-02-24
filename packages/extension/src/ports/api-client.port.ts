/**
 * API Client Port Interface
 *
 * Defines the contract for communication with the Proso backend server.
 * Used for license validation, subscription management, and managed TTS credits.
 *
 * @module ports/api-client
 */

import type { Result } from '../core/shared/result';
import type {
  LicenseValidateResponse,
  SubscriptionDetailsResponse,
  CheckoutResponse,
  CreditBalanceResponse,
  CreditHistoryResponse,
  TTSSynthesizeRequest,
} from '@proso/shared';

/**
 * TTS synthesis response from the server.
 * Contains audio blob and metadata from response headers.
 */
export interface SynthesizeResponse {
  audioBlob: Blob;
  contentType: string;
  creditsUsed: number;
  creditsRemaining: number;
  cacheHit: boolean;
  provider: string;
}

/**
 * API client errors — discriminated union.
 */
export type ApiClientError =
  | { type: 'network'; message: string }
  | { type: 'timeout'; timeoutMs: number }
  | { type: 'unauthorized'; message: string }
  | { type: 'server_error'; status: number; message: string }
  | { type: 'invalid_response'; message: string }
  | { type: 'not_configured'; message: string };

/**
 * Port interface for Proso server communication.
 *
 * Adapters:
 * - ProsoApiAdapter (HTTP client with retry and auth)
 * - NoOpApiClientAdapter (returns free-tier defaults, used when server URL not configured)
 */
export interface IApiClient {
  /**
   * Validate a license key against the server.
   * Returns the user's tier, features, and credit balance.
   *
   * INV-001: If the server is unreachable or no license key is configured,
   * callers should fall back to free tier defaults.
   *
   * @param licenseKey - Raw license key to validate
   */
  validateLicense(licenseKey: string): Promise<Result<LicenseValidateResponse, ApiClientError>>;

  /**
   * Get the current subscription details for the authenticated user.
   */
  getSubscription(): Promise<Result<SubscriptionDetailsResponse, ApiClientError>>;

  /**
   * Get the current credit balance for the authenticated user.
   */
  getCreditBalance(): Promise<Result<CreditBalanceResponse, ApiClientError>>;

  /**
   * Get credit transaction history for the authenticated user.
   *
   * @param limit - Max number of transactions to return (default 50)
   * @param offset - Number of transactions to skip (default 0)
   */
  getCreditHistory(limit?: number, offset?: number): Promise<Result<CreditHistoryResponse, ApiClientError>>;

  /**
   * Generate a checkout URL for upgrading to a paid tier.
   *
   * @param tier - Target subscription tier ('pro' or 'enterprise')
   */
  createCheckout(tier: string): Promise<Result<CheckoutResponse, ApiClientError>>;

  /**
   * Synthesize text to audio via the server TTS proxy.
   * Returns audio blob with metadata (credits used, cache hit, provider).
   *
   * INV-002: This is only called for managed-credit users.
   * BYOK users call provider APIs directly from the extension.
   *
   * @param request - Text, provider, voice, and language params
   */
  synthesize(request: TTSSynthesizeRequest): Promise<Result<SynthesizeResponse, ApiClientError>>;

  /**
   * Check if the API client is configured with a server URL.
   */
  readonly isConfigured: boolean;
}

/**
 * API client error helper factory.
 */
export const apiClientError = {
  network: (message: string): ApiClientError => ({
    type: 'network',
    message,
  }),
  timeout: (timeoutMs: number): ApiClientError => ({
    type: 'timeout',
    timeoutMs,
  }),
  unauthorized: (message: string): ApiClientError => ({
    type: 'unauthorized',
    message,
  }),
  serverError: (status: number, message: string): ApiClientError => ({
    type: 'server_error',
    status,
    message,
  }),
  invalidResponse: (message: string): ApiClientError => ({
    type: 'invalid_response',
    message,
  }),
  notConfigured: (message: string): ApiClientError => ({
    type: 'not_configured',
    message,
  }),
};
