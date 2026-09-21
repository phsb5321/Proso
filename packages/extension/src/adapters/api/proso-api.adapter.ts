/**
 * Proso API Adapter
 *
 * HTTP client for communicating with the Proso backend server.
 * Implements IApiClient port with retry logic and license key auth.
 *
 * @module adapters/api/proso-api
 */

import type {
  CheckoutResponse,
  CreditBalanceResponse,
  CreditHistoryResponse,
  ErrorCode,
  ErrorResponse,
  LicenseValidateResponse,
  SubscriptionDetailsResponse,
  TTSSynthesizeRequest,
  TTSTestKeyResponse,
} from '@proso/shared';
import type { Result } from '../../core/shared/result';
import { Err, Ok } from '../../core/shared/result';
import type { ApiClientError, IApiClient, SynthesizeResponse } from '../../ports/api-client.port';
import { apiClientError } from '../../ports/api-client.port';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;
/** Upper bound on how long a Retry-After hint is honored (ms), so a hostile or
 * malformed value cannot stall a retry indefinitely; MAX_RETRIES still bounds
 * the total number of attempts regardless of this cap. */
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * The server always sends `code` alongside `error`/`message`, but the shared
 * `ErrorResponse` type doesn't declare it yet (packages/shared/src/types/api.ts).
 * Widened locally so it can be read without an `any` cast or an out-of-scope
 * edit to the shared package.
 */
interface ParsedErrorBody extends ErrorResponse {
  code?: ErrorCode;
}

/**
 * Parse RFC 7231 §7.1.3 `Retry-After` — either delta-seconds ("120") or an
 * HTTP-date ("Wed, 21 Oct 2026 07:28:00 GMT"). Returns undefined when the
 * header is absent or unparseable. Clamped to MAX_RETRY_AFTER_MS; a
 * past HTTP-date clamps to 0 (retry immediately) rather than going negative.
 */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();

  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, MAX_RETRY_AFTER_MS);
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }

  return undefined;
}

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
    // This route is public and the candidate belongs in its body. Attaching the
    // currently configured key as well would disclose two credentials while a
    // reader is replacing one, and the server does not use that header here.
    return this.post<LicenseValidateResponse>('/api/v1/license/validate', { licenseKey }, false);
  }

  async getSubscription(
    licenseKey?: string,
  ): Promise<Result<SubscriptionDetailsResponse, ApiClientError>> {
    const effectiveKey = licenseKey ?? this.licenseKey;
    if (!effectiveKey) {
      return Err(apiClientError.notConfigured('No license key configured'));
    }
    return this.request<SubscriptionDetailsResponse>(
      'GET',
      '/api/v1/subscription',
      undefined,
      0,
      true,
      effectiveKey,
    );
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

  async createCheckout(tier: string): Promise<Result<CheckoutResponse, ApiClientError>> {
    if (!this.licenseKey) {
      return Err(apiClientError.notConfigured('No license key configured'));
    }
    return this.post<CheckoutResponse>('/api/v1/subscription/checkout', { tier });
  }

  async synthesize(
    request: TTSSynthesizeRequest,
    signal?: AbortSignal,
  ): Promise<Result<SynthesizeResponse, ApiClientError>> {
    // All requests go to the server — the server uses its own API keys
    // for free-tier users, and BYOK keys when provided (INV-001, INV-002).
    return this.requestBinary('/api/v1/tts/synthesize', request, 0, signal);
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

  private async post<T>(
    path: string,
    body: unknown,
    authenticated = true,
  ): Promise<Result<T, ApiClientError>> {
    return this.request<T>('POST', path, body, 0, authenticated);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
    authenticated = true,
    licenseKey: string | null = this.licenseKey,
  ): Promise<Result<T, ApiClientError>> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (authenticated && licenseKey) {
        headers['X-License-Key'] = licenseKey;
      }

      const init: RequestInit = {
        method,
        redirect: 'error',
        credentials: 'omit',
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

      const retryDelay = this.retryDelayMs(response, attempt);
      if (retryDelay !== null) {
        await this.delay(retryDelay);
        return this.request<T>(method, path, body, attempt + 1, authenticated, licenseKey);
      }

      return Err(await this.toApiClientError(response));
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return Err(apiClientError.timeout(DEFAULT_TIMEOUT_MS));
      }

      // Retry on network errors
      if (attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * (attempt + 1));
        return this.request<T>(method, path, body, attempt + 1, authenticated, licenseKey);
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
    signal?: AbortSignal,
  ): Promise<Result<SynthesizeResponse, ApiClientError>> {
    if (signal?.aborted) {
      return Err(apiClientError.aborted());
    }

    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    // Compose the caller-supplied signal with the internal timeout controller so
    // aborting either one aborts the fetch. AbortSignal.any needs no manual
    // cleanup (engines drop the internal listener once the composed signal is
    // unreachable); the fallback path adds a real listener and must remove it.
    let fetchSignal: AbortSignal = controller.signal;
    let onExternalAbort: (() => void) | undefined;
    if (signal) {
      if (typeof AbortSignal.any === 'function') {
        fetchSignal = AbortSignal.any([controller.signal, signal]);
      } else {
        onExternalAbort = () => controller.abort();
        signal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.licenseKey) {
        headers['X-License-Key'] = this.licenseKey;
      }

      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        credentials: 'omit',
        headers,
        body: JSON.stringify(body),
        signal: fetchSignal,
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

      const retryDelay = this.retryDelayMs(response, attempt);
      if (retryDelay !== null) {
        await this.delay(retryDelay);
        return this.requestBinary(path, body, attempt + 1, signal);
      }

      return Err(await this.toApiClientError(response));
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (signal?.aborted) {
          return Err(apiClientError.aborted());
        }
        return Err(apiClientError.timeout(DEFAULT_TIMEOUT_MS));
      }

      if (attempt < MAX_RETRIES) {
        await this.delay(RETRY_DELAY_MS * (attempt + 1));
        return this.requestBinary(path, body, attempt + 1, signal);
      }

      const message = error instanceof Error ? error.message : 'Unknown network error';
      return Err(apiClientError.network(message));
    } finally {
      clearTimeout(timeoutId);
      if (onExternalAbort) {
        signal?.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private async tryParseError(response: Response): Promise<ParsedErrorBody | null> {
    try {
      return (await response.json()) as ParsedErrorBody;
    } catch {
      return null;
    }
  }

  /**
   * Delay before retrying a failed response, or null when the response is terminal.
   * Only 5xx and 429 are retryable; a 429 carrying `Retry-After` overrides the backoff.
   */
  private retryDelayMs(response: Response, attempt: number): number | null {
    const retryable = response.status >= 500 || response.status === 429;
    if (!retryable || attempt >= MAX_RETRIES) {
      return null;
    }
    return parseRetryAfterMs(response.headers.get('Retry-After')) ?? RETRY_DELAY_MS * (attempt + 1);
  }

  /**
   * Map a non-OK response onto the error the reader will eventually see.
   * Reads `message` first, then `error`, so both the current and the pre-089 server
   * shapes yield a real reason instead of a bare status code.
   */
  private async toApiClientError(response: Response): Promise<ApiClientError> {
    const errorBody = await this.tryParseError(response);

    if (response.status === 401 || response.status === 403) {
      return apiClientError.unauthorized(
        errorBody?.message ?? errorBody?.error ?? 'Unauthorized',
        errorBody?.code,
      );
    }

    const retryAfterMs =
      response.status === 429 ? parseRetryAfterMs(response.headers.get('Retry-After')) : undefined;

    return apiClientError.serverError(
      response.status,
      errorBody?.message ?? errorBody?.error ?? `HTTP ${response.status}`,
      errorBody?.code,
      retryAfterMs,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
