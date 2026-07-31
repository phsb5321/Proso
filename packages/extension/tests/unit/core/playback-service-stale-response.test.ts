import { describe, expect, it, jest } from '@jest/globals';

import { PlaybackService } from '../../../src/core/playback/playback-service';
import type { AudioError } from '../../../src/core/shared/errors';
import { Ok } from '../../../src/core/shared/result';
import type { Result } from '../../../src/core/shared/result';
import type {
  AudioRequest,
  AudioResponse,
  IAudioGenerator,
} from '../../../src/ports/audio-generator.port';
import {
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../../mocks';

/**
 * T015 rewrite: PlaybackService now cancels a superseded/stopped fetch via a
 * real per-generation AbortController instead of only letting it run to
 * completion and discarding the result through the generation counter. The
 * generation counter still exists as a defense-in-depth backstop for a
 * generator that doesn't honor the signal (second test below), but the
 * behavior this file exists to prove is now the abort itself — that's the
 * deliberate, intentional change from "discard-after-completion" to
 * "cancel-in-flight" (spec 089 T015).
 */
describe('PlaybackService stale response handling', () => {
  it('aborts the in-flight generateAudio signal when playback is stopped', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveAudio: ((response: Result<AudioResponse, AudioError>) => void) | undefined;
    let markGenerationStarted: (() => void) | undefined;
    const generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });
    const audioGenerator: IAudioGenerator = {
      providerId: 'elevenlabs',
      supportsWordTiming: false,
      supportedLanguages: [],
      generateAudio: jest.fn(
        (_request: AudioRequest, signal?: AbortSignal) =>
          new Promise<Result<AudioResponse, AudioError>>((resolve) => {
            capturedSignal = signal;
            resolveAudio = resolve;
            markGenerationStarted?.();
          }),
      ),
      getVoices: jest.fn(async () => Ok([])),
      validateCredentials: jest.fn(async () => true),
    };
    const service = new PlaybackService({
      audioGenerator,
      audioUrlProvider: createMockAudioUrlProvider(),
      cacheStore: createMockCacheStore(),
      highlightSync: createMockHighlightSync({ validTabIds: [7] }),
      settingsStore: createMockSettingsStore(),
    });

    const pendingStart = service.start(['first document'], 7, 'https://example.test/first');
    await generationStarted;

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);

    await service.stop();

    // The defining assertion of this rewrite: stop() really cancels the
    // in-flight request, proven directly on the signal it was given —
    // not inferred indirectly from what happens if it's left to finish.
    expect(capturedSignal?.aborted).toBe(true);

    // Let the generator settle so `pendingStart` resolves and nothing is
    // left dangling at the end of the test.
    resolveAudio?.(
      Ok({
        audioBlob: new Blob(['late audio'], { type: 'audio/mpeg' }),
        durationMs: 1_000,
        wordTimings: null,
      }),
    );
    await pendingStart;
  });

  it('does not play or publish audio from a generator that ignores the abort signal', async () => {
    // Defense-in-depth: this mock never checks `signal.aborted` before
    // resolving, so the only thing standing between a late resolve and a
    // stale playback is the pre-existing generation check. Abort is the
    // primary mechanism now (previous test); this proves it's not the only
    // one, for adapters/providers that can't be cancelled mid-flight.
    let resolveAudio: ((response: Result<AudioResponse, AudioError>) => void) | undefined;
    let markGenerationStarted: (() => void) | undefined;
    const generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });
    const audioGenerator: IAudioGenerator = {
      providerId: 'elevenlabs',
      supportsWordTiming: false,
      supportedLanguages: [],
      generateAudio: jest.fn(
        () =>
          new Promise<Result<AudioResponse, AudioError>>((resolve) => {
            resolveAudio = resolve;
            markGenerationStarted?.();
          }),
      ),
      getVoices: jest.fn(async () => Ok([])),
      validateCredentials: jest.fn(async () => true),
    };
    const audioUrlProvider = createMockAudioUrlProvider();
    const service = new PlaybackService({
      audioGenerator,
      audioUrlProvider,
      cacheStore: createMockCacheStore(),
      highlightSync: createMockHighlightSync({ validTabIds: [7] }),
      settingsStore: createMockSettingsStore(),
    });

    const pendingStart = service.start(['first document'], 7, 'https://example.test/first');
    await generationStarted;
    expect(audioGenerator.generateAudio).toHaveBeenCalledTimes(1);

    await service.stop();
    resolveAudio?.(
      Ok({
        audioBlob: new Blob(['stale audio'], { type: 'audio/mpeg' }),
        durationMs: 1_000,
        wordTimings: null,
      }),
    );
    await pendingStart;

    expect(service.getState().status).toBe('stopped');
    expect(audioUrlProvider.createUrlCalls).toHaveLength(0);
  });

  it('aborts the previous generation signal when next() supersedes an in-flight fetch', async () => {
    // Cancellation isn't stop()-only: any call that starts a new generation
    // (next/previous/seekToParagraph) must abort whatever the last
    // generation was still waiting on via the same beginGeneration() path.
    const signals: Array<AbortSignal | undefined> = [];
    const resolvers: Array<(response: Result<AudioResponse, AudioError>) => void> = [];
    let markGenerationStarted: (() => void) | undefined;
    let generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });
    const audioGenerator: IAudioGenerator = {
      providerId: 'elevenlabs',
      supportsWordTiming: false,
      supportedLanguages: [],
      generateAudio: jest.fn(
        (_request: AudioRequest, signal?: AbortSignal) =>
          new Promise<Result<AudioResponse, AudioError>>((resolve) => {
            signals.push(signal);
            resolvers.push(resolve);
            markGenerationStarted?.();
          }),
      ),
      getVoices: jest.fn(async () => Ok([])),
      validateCredentials: jest.fn(async () => true),
    };
    const service = new PlaybackService({
      audioGenerator,
      audioUrlProvider: createMockAudioUrlProvider(),
      cacheStore: createMockCacheStore(),
      highlightSync: createMockHighlightSync({ validTabIds: [7] }),
      settingsStore: createMockSettingsStore(),
    });

    const pendingStart = service.start(['first', 'second'], 7, 'https://example.test/first');
    await generationStarted;
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);

    // Re-arm the latch for the second generateAudio call next() is about to
    // trigger.
    generationStarted = new Promise<void>((resolve) => {
      markGenerationStarted = resolve;
    });

    // beginGeneration() runs synchronously inside next() (before
    // generateAndPlayParagraph's first await), so the abort must already be
    // visible on the captured signal immediately — not merely "eventually,
    // once the promise happens to resolve".
    const pendingNext = service.next();
    expect(signals[0]?.aborted).toBe(true);

    await generationStarted;
    expect(signals).toHaveLength(2);
    expect(signals[1]?.aborted).toBe(false);

    resolvers[0]?.(Ok({ audioBlob: new Blob(['stale']), durationMs: 500, wordTimings: null }));
    resolvers[1]?.(Ok({ audioBlob: new Blob(['second']), durationMs: 500, wordTimings: null }));
    await pendingStart;
    await pendingNext;
  });
});
