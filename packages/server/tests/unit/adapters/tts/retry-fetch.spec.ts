import { type RetryRuntime, retryableFetch } from '../../../../src/adapters/tts/retry-fetch';

function response(status: number, headers?: HeadersInit): Response {
  return new Response(status >= 200 && status < 300 ? 'ok' : 'error', {
    status,
    headers,
  });
}

function runtime(
  fetchImpl: typeof fetch,
  sleep: (milliseconds: number) => Promise<void> = async () => undefined,
): Partial<RetryRuntime> {
  return {
    fetch: fetchImpl,
    sleep,
    random: () => 0.75,
    now: () => Date.parse('2026-07-30T18:00:00.000Z'),
  };
}

describe('retryableFetch', () => {
  it('does not retry deterministic client errors', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue(response(400));
    const sleep = jest.fn(async () => undefined);

    await expect(
      retryableFetch('https://provider.test/tts', undefined, undefined, runtime(fetchImpl, sleep)),
    ).rejects.toThrow('HTTP 400: error');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('uses deterministic jitter for transient failures', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const sleep = jest.fn(async () => undefined);

    await retryableFetch(
      'https://provider.test/tts',
      undefined,
      { minTimeoutMs: 500, jitterRatio: 0.2 },
      runtime(fetchImpl, sleep),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(550);
  });

  it('honors a bounded Retry-After response hint', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(429, { 'Retry-After': '20' }))
      .mockResolvedValueOnce(response(200));
    const sleep = jest.fn(async () => undefined);

    await retryableFetch(
      'https://provider.test/tts',
      undefined,
      { maxTimeoutMs: 10_000 },
      runtime(fetchImpl, sleep),
    );

    expect(sleep).toHaveBeenCalledWith(10_000);
  });

  it('bounds a provider that never completes with a per-attempt deadline', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async (_input, init) => {
      if (!init?.signal?.aborted) {
        throw new Error('test runtime did not enforce the request deadline');
      }
      throw new DOMException('request timed out', 'AbortError');
    });
    const sleep = jest.fn(async () => undefined);
    const scheduleTimeout: RetryRuntime['scheduleTimeout'] = (callback) => {
      callback();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    };

    await expect(
      retryableFetch(
        'https://provider.test/tts',
        undefined,
        { retries: 2, requestTimeoutMs: 25 },
        { ...runtime(fetchImpl, sleep), scheduleTimeout },
      ),
    ).rejects.toThrow('request timed out');

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('bounds disconnect retries', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('socket disconnected'));
    const sleep = jest.fn(async () => undefined);

    await expect(
      retryableFetch(
        'https://provider.test/tts',
        undefined,
        { retries: 3 },
        runtime(fetchImpl, sleep),
      ),
    ).rejects.toThrow('socket disconnected');

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });
});
