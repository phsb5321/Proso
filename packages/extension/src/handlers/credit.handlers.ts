/**
 * Credit Message Handlers
 *
 * Hexagonal handlers for credit balance and history operations.
 * Delegates to IApiClient port for server communication.
 *
 * Only active when the API client is configured (server URL + license key).
 * BYOK / free-tier users get a not_configured error gracefully.
 *
 * @module handlers/credit
 */

import type { CreditBalanceResponse, CreditHistoryResponse } from '@voxpage/shared';
import type { ApiClientError, IApiClient } from '../ports/api-client.port';
import type { HandlerRegistry } from './registry';

// ============================================
// Response Types
// ============================================

/**
 * Credit handler error type.
 */
export type CreditHandlerError =
  | { type: 'not_configured'; message: string }
  | { type: 'api_error'; message: string };

/**
 * Credit balance response wrapper.
 */
export interface CreditBalanceHandlerResponse {
  success: true;
  balance: CreditBalanceResponse;
}

/**
 * Credit history response wrapper.
 */
export interface CreditHistoryHandlerResponse {
  success: true;
  history: CreditHistoryResponse;
}

/**
 * Error response for credit handlers.
 */
export interface CreditErrorResponse {
  success: false;
  error: CreditHandlerError;
}

// ============================================
// Handler Parameters
// ============================================

interface CreditHistoryParams {
  limit?: number;
  offset?: number;
}

// ============================================
// Module State
// ============================================

let apiClient: IApiClient | null = null;

/**
 * Set the API client instance for credit handlers.
 * Called during container initialization.
 */
export function setCreditApiClient(client: IApiClient): void {
  apiClient = client;
}

/**
 * Get the API client instance.
 */
function getApiClient(): IApiClient {
  if (!apiClient) {
    throw new Error('API client not initialized. Call setCreditApiClient() first.');
  }
  return apiClient;
}

/**
 * Format an ApiClientError into a CreditHandlerError.
 */
function toHandlerError(err: ApiClientError): CreditHandlerError {
  if (err.type === 'not_configured') {
    return { type: 'not_configured', message: err.message };
  }
  const message = 'message' in err ? err.message : `API error: ${err.type}`;
  return { type: 'api_error', message };
}

// ============================================
// Handlers
// ============================================

/**
 * Get the current credit balance.
 * Returns not_configured error for BYOK/free-tier users.
 */
async function handleGetBalance(): Promise<CreditBalanceHandlerResponse | CreditErrorResponse> {
  const client = getApiClient();

  if (!client.isConfigured) {
    return {
      success: false,
      error: { type: 'not_configured', message: 'No server configured' },
    };
  }

  const result = await client.getCreditBalance();

  if (!result.ok) {
    return { success: false, error: toHandlerError(result.error) };
  }

  return { success: true, balance: result.value };
}

/**
 * Get credit transaction history.
 * Returns not_configured error for BYOK/free-tier users.
 */
async function handleGetHistory(
  params?: CreditHistoryParams,
): Promise<CreditHistoryHandlerResponse | CreditErrorResponse> {
  const client = getApiClient();

  if (!client.isConfigured) {
    return {
      success: false,
      error: { type: 'not_configured', message: 'No server configured' },
    };
  }

  const result = await client.getCreditHistory(params?.limit, params?.offset);

  if (!result.ok) {
    return { success: false, error: toHandlerError(result.error) };
  }

  return { success: true, history: result.value };
}

// ============================================
// Registration
// ============================================

/**
 * Register all credit handlers on the given registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerCreditHandlers(registry: HandlerRegistry): void {
  registry.register('credit.getBalance', handleGetBalance, 'Get current credit balance');
  registry.register('credit.getHistory', handleGetHistory, 'Get credit transaction history');
}
