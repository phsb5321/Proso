/**
 * Proso API Adapter
 *
 * HTTP client for communicating with the Proso backend server.
 * Implements IApiClient port with retry logic and license key auth.
 *
 * @module adapters/api/proso-api
 */

import type { Result } from '../../core/shared/result';
import { Ok, Err } from '../../core/shared/result';
import type {
  IApiClient,
  ApiClientError,
  SynthesizeResponse,
} from '../../ports/api-client.port';
import { apiClientError } from '../../ports/api-client.port';
import type {
  LicenseValidateResponse,
  SubscriptionDetailsResponse,
  CheckoutResponse,
  CreditBalanceResponse,
  CreditHistoryResponse,
  ErrorResponse,
  TTSSynthesizeRequest,
  TTSTestKeyResponse,
} from '@proso/shared';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

/**
 * Proso API adapter — HTTP client with retry and auth headers.
 */
export class ProsoApiAdapter implements IApiClient {
  private readonly baseUrl: string;
  private licenseKey: string | null;

  constructor(baseUrl: string, licenseKey: string | null = null) {
    // Normalize: remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.licenseKey = licenseKey;
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  /**
   * Update the license key (e.g., after user enters one in settings).
   */
  setLicenseKey(key: string | null): void {
    this.licenseKey = key;
  }

  async validateLicense(
    licenseKey: string,
  ): Promise<Result<LicenseValidateResponse, ApiClientError>> {
    return this.post<LicenseValidateResponse>('/api/v1/license/validate', {
      licenseKey,
    });
  }

  async getSubscription(): Promise<Result<SubscriptionDetailsResponse, ApiClientError>> {
    if (!this.licenseKey) {
      return Err(apiClientError.notConfigured('No license key configured'));
    }
    return this.get<SubscriptionDetailsResponse>('/api/v1/subscription');
  }

  async getCreditBalance(): Promise<Result<CreditBalanceResponse, ApiClientError>> {
    if (!this.licenseKey) {
      return Err(apiClientError.notConfigured('No license key configured'));
    }
    return this.get<CreditBalanceResponse>('/api/v1/credits/balance');
  }

  async getCreditHistory(
    limit = 50,
    offset = 0,
  ): Promise<Result<CreditHistoryResponse, ApiClientError>> {
    if (!this.licenseKey) {
      return Err(apiClientError.notConfigured('No license key configured'));
    }
    return this.get<CreditHistoryResponse>(
      `/api/v1/credits/history?limit=${limit}&offset=${offset}`,
    );
  }

  async createCheckout(
    tier: string,
  ): Promise<Result<CheckoutResponse, ApiClientError>> {
    if (!this.licenseKey) {
      return Err(apiClientError.notConfigured('No license key configured'));
    }
    return this.post<CheckoutResponse>('/api/v1/subscription/checkout', { tier });
  }

  async synthesize(
    request: TTSSynthesizeRequest,
  ): Promise<Result<SynthesizeResponse, ApiClientError>> {
    // BYOK requests can proceed without a license key (INV-002)
    if (!this.licenseKey && !request.byokApiKey) {
      return Err(apiClientError.notConfigured(
        'API key required. Add your API key in Settings \u2192 Developer \u2192 API Keys.',
      ));
    }
    return this.requestBinary('/api/v1/tts/synthesize', request);
  }

  async testApiKey(
    provider: string,
    apiKey: string,
  ): Promise<Result<TTSTestKeyResponse, ApiClientError>> {
    return this.post<TTSTestKeyResponse>('/api/v1/tts/test-key', {
      provider,
      apiKey,
    });
  }

  // ── HTTP helpers ──

  private async get<T>(path: string): Promise<Result<T, ApiClientError>> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, body: unknown): Promise<Result<T, ApiClientError>> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
  ): Promise<Result<T, ApiClientError>> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (this.licenseKey) {
        headers['X-License-Key'] = this.licenseKey;
      }

      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }

      const response = await fetch(url, init);

      if (response.ok) {
        const data = (await response.json()) as T;
        return Ok(data);
      }

      // Handle specific HTTP error codes
      if (response.status === 401 || response.status === 403) {
        const errorBody = await this.tryParseError(response);
        return Err(apiClientError.unauthorized(errorBody?.message ?? 'Unauthorized'));
      }

      // Retry on 5xx
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * (attempt + 1));
        return this.request<T>(method, path, body, attempt + 1);
      }

      const errorBody = await this.tryParseError(response);
      return Err(
        apiClientError.serverError(
          response.status,
          errorBody?.message ?? `HTTP ${response.status}`,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return Err(apiClientError.timeout(DEFAULT_TIMEOUT_MS));
      }

      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * (attempt + 1));
        return this.request<T>(method, path, body, attempt + 1);
      }

      const message = error instanceof Error ? error.message : 'Unknown network error';
      return Err(apiClientError.network(message));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async requestBinary(
    path: string,
    body: unknown,
    attempt = 0,
  ): Promise<Result<SynthesizeResponse, ApiClientError>> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.licenseKey) {
        headers['X-License-Key'] = this.licenseKey;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        return Ok({
          audioBlob,
          contentType: response.headers.get('Content-Type') ?? 'audio/mpeg',
          creditsUsed: Number(response.headers.get('X-Credits-Used') ?? '0'),
          creditsRemaining: Number(response.headers.get('X-Credits-Remaining') ?? '0'),
          cacheHit: response.headers.get('X-Cache-Hit') === 'true',
          provider: response.headers.get('X-Provider') ?? 'unknown',
        });
      }

      if (response.status === 401 || response.status === 403) {
        const errorBody = await this.tryParseError(response);
        return Err(apiClientError.unauthorized(errorBody?.message ?? 'Unauthorized'));
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * (attempt + 1));
        return this.requestBinary(path, body, attempt + 1);
      }

      const errorBody = await this.tryParseError(response);
      return Err(
        apiClientError.serverError(
          response.status,
          errorBody?.message ?? `HTTP ${response.status}`,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return Err(apiClientError.timeout(DEFAULT_TIMEOUT_MS));
      }

      if (attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * (attempt + 1));
        return this.requestBinary(path, body, attempt + 1);
      }

      const message = error instanceof Error ? error.message : 'Unknown network error';
      return Err(apiClientError.network(message));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async tryParseError(response: Response): Promise<ErrorResponse | null> {
    try {
      return (await response.json()) as ErrorResponse;
    } catch {
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
