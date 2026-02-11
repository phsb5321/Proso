/**
 * API Client Port Interface
 *
 * Defines the contract for communication with the VoxPage backend server.
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
} from '@voxpage/shared';

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
 * Port interface for VoxPage server communication.
 *
 * Adapters:
 * - VoxPageApiAdapter (HTTP client with retry and auth)
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
   * Generate a checkout URL for upgrading to a paid tier.
   *
   * @param tier - Target subscription tier ('pro' or 'enterprise')
   */
  createCheckout(tier: string): Promise<Result<CheckoutResponse, ApiClientError>>;

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
