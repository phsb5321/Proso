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
  requestTimeoutMs?: number;
  jitterRatio?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  retries: 3,
  minTimeoutMs: 500,
  factor: 2,
  maxTimeoutMs: 10_000,
  requestTimeoutMs: 15_000,
  jitterRatio: 0.2,
};

export interface RetryRuntime {
  fetch: typeof fetch;
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
  now: () => number;
  scheduleTimeout: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearScheduledTimeout: (handle: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_RUNTIME: RetryRuntime = {
  fetch: (input, init) => globalThis.fetch(input, init),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random: Math.random,
  now: Date.now,
  scheduleTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearScheduledTimeout: (handle) => clearTimeout(handle),
};

class NonRetryableHttpError extends Error {}

function delayMs(
  attempt: number,
  config: Required<RetryOptions>,
  random: () => number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, config.maxTimeoutMs);
  }

  const base = config.minTimeoutMs * config.factor ** attempt;
  const boundedBase = Math.min(base, config.maxTimeoutMs);
  const jitter = 1 - config.jitterRatio + 2 * config.jitterRatio * random();
  return Math.round(Math.min(boundedBase * jitter, config.maxTimeoutMs));
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (value === null) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

async function fetchWithDeadline(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  runtime: RetryRuntime,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeout = runtime.scheduleTimeout(
    () =>
      controller.abort(new DOMException(`request timed out after ${timeoutMs}ms`, 'TimeoutError')),
    timeoutMs,
  );

  try {
    return await runtime.fetch(url, { ...init, signal: controller.signal });
  } finally {
    runtime.clearScheduledTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
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
  runtimeOverrides: Partial<RetryRuntime> = {},
): Promise<Response> {
  const config = { ...DEFAULTS, ...opts };
  const runtime = { ...DEFAULT_RUNTIME, ...runtimeOverrides };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    let retryAfterMs: number | undefined;

    try {
      const response = await fetchWithDeadline(url, init, config.requestTimeoutMs, runtime);

      if (response.ok) return response;

      if (!RETRYABLE_STATUSES.has(response.status)) {
        const body = await response.text().catch(() => '');
        throw new NonRetryableHttpError(`HTTP ${response.status}: ${body || 'no body'}`);
      }

      lastError = new Error(`HTTP ${response.status}`);
      retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'), runtime.now());
      await response.body?.cancel().catch(() => undefined);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (err instanceof NonRetryableHttpError || init?.signal?.aborted) {
        throw err;
      }

      lastError = err;
    }

    if (attempt < config.retries) {
      await runtime.sleep(delayMs(attempt, config, runtime.random, retryAfterMs));
    }
  }

  throw lastError ?? new Error('retryableFetch: exhausted without capturing error');
}
