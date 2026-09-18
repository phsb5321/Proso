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
import type { Settings } from '../../src/ports/settings-store.port';
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
  highlightSync: ReturnType<typeof createMockHighlightSync>;
  audioUrlProvider: ReturnType<typeof createMockAudioUrlProvider>;
  settingsStore: ReturnType<typeof createMockSettingsStore>;
  queue: PlaybackQueue;
  prefetch: PrefetchService;
  service: PlaybackService;
};

/** Bind a real lookahead pipeline to `audioGenerator` with fresh mocks. */
export function createPrefetchPlaybackHarness(
  audioGenerator: IAudioGenerator,
  options: {
    tabId?: number;
    maxBufferSize?: number;
    batchIntervalMs?: number;
    settings?: Partial<Settings>;
    settingsLatencyMs?: number;
  } = {},
): PrefetchPlaybackHarness {
  const audioUrlProvider = createMockAudioUrlProvider();
  const queue = new PlaybackQueue();
  const prefetch = new PrefetchService({
    maxBufferSize: options.maxBufferSize ?? 5,
    maxConcurrent: 2,
    batchIntervalMs: options.batchIntervalMs ?? 1,
  });
  const highlightSync = createMockHighlightSync({ validTabIds: [options.tabId ?? 7] });
  const settingsStore = createMockSettingsStore({
    initialSettings: options.settings,
    latencyMs: options.settingsLatencyMs,
  });
  const service = new PlaybackService({
    audioGenerator,
    audioUrlProvider,
    cacheStore: createMockCacheStore(),
    highlightSync,
    settingsStore,
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
    highlightSync,
    settingsStore,
    audioUrlProvider,
    queue,
    prefetch,
    service,
  };
}
