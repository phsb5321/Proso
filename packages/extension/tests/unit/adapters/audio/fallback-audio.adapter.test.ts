/**
 * Fallback audio adapter unit tests (spec 100 FR-4/FR-2).
 *
 * The decorator owns the fallback decision: gate failure routes to the
 * secondary with the reason retained; the lazy primary is NEVER constructed
 * when the gate fails (FR-2 — an unconfigured/unpermitted local host issues
 * no request and builds no adapter); abort is never a fallback trigger.
 *
 * @module tests/unit/adapters/audio/fallback-audio
 */

import { describe, expect, it, jest } from '@jest/globals';
import { FallbackAudioAdapter } from '../../../../src/adapters/audio/fallback-audio.adapter';
import { createMockAudioGenerator } from '../../../mocks';
import { audioError } from '../../../../src/core/shared/errors';
import { Ok, isErr, isOk } from '../../../../src/core/shared/result';
import type { AudioError } from '../../../../src/core/shared/errors';
import type { AudioRequest } from '../../../../src/ports/audio-generator.port';

const request: AudioRequest = {
  text: 'Hello from the fallback suite.',
  voice: null,
  speed: 1,
  language: 'en',
};

/**
 * Shared constructor: every case needs a primary (or factory), a secondary,
 * and a gate; the helper keeps the individual cases about their own concern.
 */
function makeAdapter(
  overrides: {
    primary?: ReturnType<typeof createMockAudioGenerator>;
    primaryFactory?: () => Promise<ReturnType<typeof createMockAudioGenerator>>;
    secondary?: ReturnType<typeof createMockAudioGenerator>;
    gate?: () => Promise<{ ok: boolean; reason?: string }>;
  } = {},
): {
  adapter: FallbackAudioAdapter;
  primary: ReturnType<typeof createMockAudioGenerator>;
  secondary: ReturnType<typeof createMockAudioGenerator>;
} {
  const primary = overrides.primary ?? createMockAudioGenerator({ providerId: 'local' });
  const secondary = overrides.secondary ?? createMockAudioGenerator();
  const adapter = new FallbackAudioAdapter({
    ...(overrides.primaryFactory
      ? { primaryFactory: overrides.primaryFactory }
      : { primary }),
    secondary,
    gate: overrides.gate ?? (async () => ({ ok: true })),
  });
  return { adapter, primary, secondary };
}

describe('FallbackAudioAdapter', () => {
  it.each([false, true])('rechecks the gate between chunks (failClosed=%s)', async (failClosedOnGate) => {
    let enabled = true;
    let dispatches = 0;
    let closed = false;
    const secondary = createMockAudioGenerator();
    const adapter = new FallbackAudioAdapter({
      primary: {
        ...chunkedPrimary([]),
        async *generateAudioChunks() {
          try {
            for (let index = 0; index < 6; index++) {
              dispatches++;
              yield Ok({ audioBlob: new Blob(['chunk']), durationMs: 1000, wordTimings: null });
            }
          } finally { closed = true; }
        },
      },
      secondary,
      gate: async () => ({ ok: enabled, reason: 'Synthesis disabled' }),
      failClosedOnGate,
    });
    const iterator = adapter.generateAudioChunks(request);
    expect((await iterator.next()).value?.ok).toBe(true);
    enabled = false;
    expect((await iterator.next()).value).toEqual({
      ok: false,
      error: audioError.providerError('local_host_gate', 'Synthesis disabled'),
    });
    expect((await iterator.next()).done).toBe(true);
    expect(dispatches).toBe(1);
    expect(closed).toBe(true);
    expect(secondary.generateAudioCalls).toHaveLength(0);
  });

  it('serves from the primary when the gate passes', async () => {
    const { adapter, primary, secondary } = makeAdapter();
    const result = await adapter.generateAudio(request);
    expect(isOk(result)).toBe(true);
    expect(primary.generateAudioCalls).toHaveLength(1);
    expect(secondary.generateAudioCalls).toHaveLength(0);
    expect(adapter.lastFallbackReason).toBeNull();
  });

  it('gate failure routes to the secondary exactly once and never builds the primary (FR-2)', async () => {
    let built = false;
    const { adapter, secondary } = makeAdapter({
      primaryFactory: async () => {
        built = true;
        return createMockAudioGenerator({ providerId: 'local' });
      },
      gate: async () => ({ ok: false, reason: 'Local synthesis host is disabled' }),
    });

    const result = await adapter.generateAudio(request);
    expect(isOk(result)).toBe(true);
    expect(built).toBe(false);
    expect(secondary.generateAudioCalls).toHaveLength(1);
    expect(adapter.lastFallbackReason).toBe('Local synthesis host is disabled');
  });

  it('primary error falls back to the secondary once, retaining the reason', async () => {
    const { adapter, primary, secondary } = makeAdapter();
    primary.setForceError(audioError.network('Host unreachable'));
    const result = await adapter.generateAudio(request);
    expect(isOk(result)).toBe(true);
    expect(secondary.generateAudioCalls).toHaveLength(1);
    expect(adapter.lastFallbackReason).toContain('Host unreachable');
  });

  it('abort is never a fallback trigger', async () => {
    const { adapter, primary, secondary } = makeAdapter();
    primary.setForceError(audioError.providerError('appliance_aborted', 'Request aborted'));
    const result = await adapter.generateAudio(request);
    expect(isErr(result)).toBe(true);
    expect(secondary.generateAudioCalls).toHaveLength(0);
  });

  it('chunked synthesis falls back to the secondary as a single chunk on gate failure', async () => {
    const { adapter, secondary } = makeAdapter({
      primaryFactory: async () => createMockAudioGenerator({ providerId: 'local' }),
      gate: async () => ({ ok: false, reason: 'Host permission revoked' }),
    });

    const chunks = [];
    for await (const chunk of adapter.generateAudioChunks!(request)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(isOk(chunks[0]!)).toBe(true);
    expect(secondary.generateAudioCalls).toHaveLength(1);
    expect(adapter.lastFallbackReason).toBe('Host permission revoked');
  });

  it('lazy primary is built once and cached', async () => {
    let builds = 0;
    const { adapter } = makeAdapter({
      primaryFactory: async () => {
        builds += 1;
        return createMockAudioGenerator({ providerId: 'local' });
      },
    });

    await adapter.generateAudio(request);
    await adapter.generateAudio(request);
    expect(builds).toBe(1);
  });

  it('primary factory failure routes to the secondary with the reason', async () => {
    const { adapter, secondary } = makeAdapter({
      primaryFactory: async () => {
        throw new Error('Local synthesis host URL is not configured');
      },
    });

    const result = await adapter.generateAudio(request);
    expect(isOk(result)).toBe(true);
    expect(secondary.generateAudioCalls).toHaveLength(1);
    expect(adapter.lastFallbackReason).toContain('not configured');
  });

  it('validateCredentials respects the gate', async () => {
    const { adapter } = makeAdapter({
      gate: async () => ({ ok: false, reason: 'disabled' }),
    });
    expect(await adapter.validateCredentials()).toBe(false);
  });

  it('failClosedOnGate: gate failure returns the gate reason as a typed error, secondary never called (PROSO-114)', async () => {
    let built = false;
    const secondary = createMockAudioGenerator();
    const adapter = new FallbackAudioAdapter({
      primaryFactory: async () => {
        built = true;
        return createMockAudioGenerator({ providerId: 'local' });
      },
      secondary,
      failClosedOnGate: true,
      gate: async () => ({ ok: false, reason: 'Local synthesis host is disabled' }),
    });

    const result = await adapter.generateAudio(request);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe('provider_error');
    if (result.error.type === 'provider_error') {
      expect(result.error.code).toBe('local_host_gate');
      expect(result.error.message).toBe('Local synthesis host is disabled');
    }
    expect(built).toBe(false);
    expect(secondary.generateAudioCalls).toHaveLength(0);
    expect(adapter.lastFallbackReason).toBe('Local synthesis host is disabled');
  });

  it('failClosedOnGate: chunked path yields the gate error, no secondary fallback (PROSO-114)', async () => {
    const secondary = createMockAudioGenerator();
    const adapter = new FallbackAudioAdapter({
      primary: createMockAudioGenerator({ providerId: 'local' }),
      secondary,
      failClosedOnGate: true,
      gate: async () => ({ ok: false, reason: 'The extension has no access to the configured host origin' }),
    });

    const chunks = [];
    for await (const chunk of adapter.generateAudioChunks!(request)) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.ok).toBe(false);
    if (chunks[0]?.ok) return;
    expect(chunks[0]?.error.type).toBe('provider_error');
    expect(secondary.generateAudioCalls).toHaveLength(0);
  });

  /**
   * A chunk-capable primary. `createMockAudioGenerator` has no
   * `generateAudioChunks`, and the local host adapter does — which is why the
   * chunked path is the one that actually runs in the product, and the one
   * PROSO-147 found still handing failures to the server.
   */
  function chunkedPrimary(chunks: ReadonlyArray<{ ok: false; error: AudioError }>) {
    return {
      providerId: 'local' as const,
      supportsWordTiming: false,
      supportsChunkedSynthesis: true,
      supportedLanguages: ['en'],
      generateAudio: async () => chunks[0] ?? { ok: false, error: audioError.network('none') },
      async *generateAudioChunks() {
        for (const chunk of chunks) yield chunk;
      },
      getVoices: async () => ({ ok: true as const, value: [] }),
      validateCredentials: async () => true,
    };
  }

  /**
   * Drain the chunked path of a fail-closed local adapter. The gate passes in
   * every case here: the concern is what happens AFTER it passes and the local
   * route then fails.
   */
  async function drainFailClosed(primary: unknown) {
    const secondary = createMockAudioGenerator();
    const adapter = new FallbackAudioAdapter({
      primary: primary as never,
      secondary,
      failClosedOnGate: true,
      gate: async () => ({ ok: true }),
    });
    const chunks = [];
    for await (const chunk of adapter.generateAudioChunks!(request)) {
      chunks.push(chunk);
    }
    return { adapter, secondary, chunks };
  }

  it('failClosedOnGate: a chunked primary whose FIRST chunk errors reports its own failure (PROSO-147)', async () => {
    const { secondary, chunks } = await drainFailClosed(
      chunkedPrimary([{ ok: false, error: audioError.network('Host refused the connection') }]),
    );

    expect(chunks).toHaveLength(1);
    const first = chunks[0];
    expect(first?.ok).toBe(false);
    if (!first || first.ok || first.error.type !== 'provider_error') return;
    // The reader's own host failed; the answer must say so rather than hand the
    // request to the server, whose reply for an unentitled tier is a 402 about
    // billing. That misdiagnosis is what PROSO-137 set out to end, and this
    // path — the only one the local route actually takes — still produced it.
    expect(first.error.message).toContain('Host refused the connection');
    expect(secondary.generateAudioCalls).toHaveLength(0);
  });

  it('failClosedOnGate: a chunked primary that yields nothing reports its own failure (PROSO-147)', async () => {
    const { adapter, secondary, chunks } = await drainFailClosed(chunkedPrimary([]));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.ok).toBe(false);
    expect(secondary.generateAudioCalls).toHaveLength(0);
    expect(adapter.lastFallbackReason).toBe('local route produced no audio');
  });

  it('failClosedOnGate: a primary without chunked support reports its own failure (PROSO-147)', async () => {
    const { secondary, chunks } = await drainFailClosed(
      createMockAudioGenerator({ providerId: 'local' }),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.ok).toBe(false);
    expect(secondary.generateAudioCalls).toHaveLength(0);
  });

  it('getVoices falls back when the primary declines a language', async () => {
    const { adapter, primary } = makeAdapter();
    jest.spyOn(primary, 'getVoices').mockImplementation(async () =>
      ({ ok: false, error: audioError.unsupportedLanguage('de') }) as never,
    );
    const result = await adapter.getVoices('de');
    expect(isOk(result)).toBe(true);
  });
});
