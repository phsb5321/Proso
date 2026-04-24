// Retry helper for TTS provider HTTP calls.
// Retries transient failures (5xx, 408, 429, network errors) with exponential
// backoff. Aborts immediately on deterministic 4xx so callers don't retry bad
// API keys, malformed requests, or auth failures.
//
// Uses native fetch + a hand-rolled retry loop rather than p-retry (ESM-only,
// incompatible with the server's CommonJS Jest setup). Keeps the server dep
// tree one package lighter and avoids Jest VM-modules gymnastics.

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  retries?: number;
  minTimeoutMs?: number;
  factor?: number;
  maxTimeoutMs?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  retries: 3,
  minTimeoutMs: 500,
  factor: 2,
  maxTimeoutMs: 10_000,
};

function delayMs(attempt: number, config: Required<RetryOptions>): number {
  const base = config.minTimeoutMs * config.factor ** attempt;
  return Math.min(base, config.maxTimeoutMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential-backoff retry on transient failures.
 *
 * Retries on network errors and HTTP 408/429/5xx. Aborts (no retry) on other
 * 4xx — those are deterministic client errors (bad API key, invalid body)
 * where retrying would only burn quota.
 *
 * @param url - Request URL
 * @param init - Fetch init options
 * @param opts - Retry tuning (defaults: 3 retries, 500ms→10s backoff, factor 2)
 * @returns Resolved Response with `response.ok === true`.
 * @throws Error with the last failure reason after exhausting retries, or
 *         immediately on a non-retryable HTTP status.
 */
export async function retryableFetch(
  url: string,
  init?: RequestInit,
  opts?: RetryOptions,
): Promise<Response> {
  const config = { ...DEFAULTS, ...opts };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.ok) return response;

      if (!RETRYABLE_STATUSES.has(response.status)) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${body || 'no body'}`);
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Non-retryable HTTP error (thrown above) — re-throw immediately.
      if (err.message.startsWith('HTTP ') && !err.message.match(/^HTTP (408|429|5\d\d)/)) {
        throw err;
      }

      lastError = err;
    }

    if (attempt < config.retries) {
      await sleep(delayMs(attempt, config));
    }
  }

  throw lastError ?? new Error('retryableFetch: exhausted without capturing error');
}
