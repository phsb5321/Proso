import { describe, expect, it, jest } from '@jest/globals';

import { PlaybackService } from '../../../src/core/playback/playback-service';
import type { AudioError } from '../../../src/core/shared/errors';
import { Ok } from '../../../src/core/shared/result';
import type { Result } from '../../../src/core/shared/result';
import type { AudioResponse, IAudioGenerator } from '../../../src/ports/audio-generator.port';
import {
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../../mocks';

describe('PlaybackService stale response handling', () => {
  it('does not play or publish audio that resolves after playback was stopped', async () => {
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
});
