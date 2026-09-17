/**
 * Prefetch playback harness
 *
 * Shared wiring for tests that exercise the paragraph-lookahead route: a real
 * PlaybackQueue + PrefetchService bound to a PlaybackService via the same
 * generatePrefetchAudio / isParagraphCached seam production uses.
 *
 * @module tests/helpers/prefetch-playback-harness
 */

import { PlaybackService } from '../../src/core/playback/playback-service';
import type { IAudioGenerator } from '../../src/ports/audio-generator.port';
import { PlaybackQueue } from '../../src/utils/playback/playback-queue';
import { PrefetchService } from '../../src/utils/playback/prefetch';
import {
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../mocks';

export type PrefetchPlaybackHarness = {
  audioGenerator: IAudioGenerator;
  generateMock: jest.Mock;
  audioUrlProvider: ReturnType<typeof createMockAudioUrlProvider>;
  queue: PlaybackQueue;
  prefetch: PrefetchService;
  service: PlaybackService;
};

/** Bind a real lookahead pipeline to `audioGenerator` with fresh mocks. */
export function createPrefetchPlaybackHarness(
  audioGenerator: IAudioGenerator,
  options: { tabId?: number; maxBufferSize?: number; batchIntervalMs?: number } = {},
): PrefetchPlaybackHarness {
  const audioUrlProvider = createMockAudioUrlProvider();
  const queue = new PlaybackQueue();
  const prefetch = new PrefetchService({
    maxBufferSize: options.maxBufferSize ?? 5,
    maxConcurrent: 2,
    batchIntervalMs: options.batchIntervalMs ?? 1,
  });
  const service = new PlaybackService({
    audioGenerator,
    audioUrlProvider,
    cacheStore: createMockCacheStore(),
    highlightSync: createMockHighlightSync({ validTabIds: [options.tabId ?? 7] }),
    settingsStore: createMockSettingsStore(),
    prefetch: { service: prefetch, queue },
  });
  prefetch.configure(
    queue,
    (text, index) => service.generatePrefetchAudio(text, index),
    (index) => service.isParagraphCached(index),
  );
  return {
    audioGenerator,
    generateMock: audioGenerator.generateAudio as jest.Mock,
    audioUrlProvider,
    queue,
    prefetch,
    service,
  };
}
