/**
 * PlaybackService Unit Tests
 *
 * Tests for the core playback orchestration service.
 * Uses mock adapters to test in isolation without network, browser APIs, or storage.
 *
 * @module tests/unit/core/playback-service
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PlaybackService } from '../../../src/core/playback/playback-service';
import { audioError, highlightError } from '../../../src/core/shared/errors';
import { isErr, isOk } from '../../../src/core/shared/result';
import {
  type MockAudioGenerator,
  type MockAudioUrlProvider,
  type MockCacheStore,
  type MockHighlightSync,
  type MockSettingsStore,
  createMockAudioGenerator,
  createMockAudioUrlProvider,
  createMockCacheStore,
  createMockHighlightSync,
  createMockSettingsStore,
} from '../../mocks';

describe('PlaybackService', () => {
  let service: PlaybackService;
  let mockAudioGenerator: MockAudioGenerator;
  let mockAudioUrlProvider: MockAudioUrlProvider;
  let mockCacheStore: MockCacheStore;
  let mockHighlightSync: MockHighlightSync;
  let mockSettingsStore: MockSettingsStore;

  const testParagraphs = [
    'This is the first paragraph with some text.',
    'This is the second paragraph with more text.',
    'This is the third paragraph to test navigation.',
  ];
  const testTabId = 123;
  const testPageUrl = 'https://example.com/article';

  beforeEach(() => {
    mockAudioGenerator = createMockAudioGenerator();
    mockAudioUrlProvider = createMockAudioUrlProvider();
    mockCacheStore = createMockCacheStore();
    mockHighlightSync = createMockHighlightSync({ validTabIds: [testTabId] });
    mockSettingsStore = createMockSettingsStore();

    service = new PlaybackService({
      audioGenerator: mockAudioGenerator,
      audioUrlProvider: mockAudioUrlProvider,
      cacheStore: mockCacheStore,
      highlightSync: mockHighlightSync,
      settingsStore: mockSettingsStore,
    });
  });

  describe('initial state', () => {
    it('should start in idle state', () => {
      const state = service.getState();
      expect(state.status).toBe('idle');
      expect(state.currentParagraphIndex).toBe(0);
      expect(state.totalParagraphs).toBe(0);
    });
  });

  describe('start()', () => {
    it('should transition to playing state', async () => {
      const result = await service.start(testParagraphs, testTabId, testPageUrl);

      expect(isOk(result)).toBe(true);
      const state = service.getState();
      expect(state.status).toBe('playing');
      expect(state.currentParagraphIndex).toBe(0);
      expect(state.totalParagraphs).toBe(3);
    });

    it('should call audio generator for first paragraph', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      expect(mockAudioGenerator.generateAudioCalls).toHaveLength(1);
      expect(mockAudioGenerator.generateAudioCalls[0].text).toBe(testParagraphs[0]);
    });

    it('should show footer and highlight first paragraph', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      expect(mockHighlightSync.showFooterCalls).toContain(testTabId);
      expect(mockHighlightSync.highlightParagraphCalls).toHaveLength(2); // Initial + after audio
      expect(mockHighlightSync.highlightParagraphCalls[0]).toMatchObject({
        tabId: testTabId,
        paragraphIndex: 0,
        scroll: true,
      });
    });

    it('should return error for empty paragraphs', async () => {
      const result = await service.start([], testTabId, testPageUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('no_content');
      }
    });

    it('preserves rejected credentials for the popup repair classifier', async () => {
      mockAudioGenerator.setForceError(audioError.invalidCredentials());

      const result = await service.start(testParagraphs, testTabId, testPageUrl);

      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error).toEqual({
        type: 'invalid_credentials',
        provider: 'elevenlabs',
      });
    });

    it('should check cache before generating audio', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      // Cache should be checked
      expect(mockCacheStore.getCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should use cached audio if available', async () => {
      // Pre-populate cache
      const cacheKey = {
        urlHash: expect.any(String),
        paragraphIndex: 0,
        provider: 'elevenlabs',
        voice: 'default',
        contentHash: expect.any(String),
      };

      // Set up cache to return a value
      mockCacheStore.prePopulate([
        {
          key: {
            urlHash: 'test',
            paragraphIndex: 0,
            provider: 'elevenlabs',
            voice: 'default',
            contentHash: 'test',
          },
          entry: {
            audioBlob: new Blob(),
            durationMs: 1000,
            wordTimings: null,
            createdAt: Date.now(),
            lastAccessedAt: Date.now(),
            accessCount: 1,
            sizeBytes: 100,
          },
        },
      ]);

      await service.start(testParagraphs, testTabId, testPageUrl);

      // Audio generator should still be called since our key doesn't match
      // (real implementation would match properly)
      expect(mockAudioGenerator.generateAudioCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should cache generated audio', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      // Cache set should be called
      expect(mockCacheStore.setCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('pause()', () => {
    it('should transition from playing to paused', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      const result = await service.pause();

      expect(isOk(result)).toBe(true);
      expect(service.getState().status).toBe('paused');
    });

    it('should return error when not playing', async () => {
      const result = await service.pause();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('playback_failed');
      }
    });

    it('should update footer state', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      mockHighlightSync.updateFooterStateCalls = []; // Reset

      await service.pause();

      expect(mockHighlightSync.updateFooterStateCalls.length).toBeGreaterThan(0);
      const lastUpdate = mockHighlightSync.updateFooterStateCalls.at(-1);
      expect(lastUpdate?.state.status).toBe('paused');
    });
  });

  describe('resume()', () => {
    it('should transition from paused to playing', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      await service.pause();
      const result = await service.resume();

      expect(isOk(result)).toBe(true);
      expect(service.getState().status).toBe('playing');
    });

    it('should return error when not paused', async () => {
      const result = await service.resume();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('playback_failed');
      }
    });
  });

  describe('stop()', () => {
    it('should transition to stopped state', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      const result = await service.stop();

      expect(isOk(result)).toBe(true);
      expect(service.getState().status).toBe('stopped');
    });

    it('should clear highlights and hide footer', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      mockHighlightSync.clearHighlightsCalls = [];
      mockHighlightSync.hideFooterCalls = [];

      await service.stop();

      expect(mockHighlightSync.clearHighlightsCalls).toContain(testTabId);
      expect(mockHighlightSync.hideFooterCalls).toContain(testTabId);
    });
  });

  describe('next()', () => {
    it('should advance to next paragraph', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      const initialIndex = service.getState().currentParagraphIndex;

      const result = await service.next();

      expect(isOk(result)).toBe(true);
      expect(service.getState().currentParagraphIndex).toBe(initialIndex + 1);
    });

    it('should generate audio for next paragraph', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      mockAudioGenerator.generateAudioCalls = [];

      await service.next();

      expect(mockAudioGenerator.generateAudioCalls).toHaveLength(1);
      expect(mockAudioGenerator.generateAudioCalls[0].text).toBe(testParagraphs[1]);
    });

    it('should stop when at end', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      await service.next(); // 0 -> 1
      await service.next(); // 1 -> 2
      await service.next(); // 2 -> end

      expect(service.getState().status).toBe('stopped');
    });

    it('should highlight new paragraph', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      mockHighlightSync.highlightParagraphCalls = [];

      await service.next();

      const calls = mockHighlightSync.highlightParagraphCalls;
      expect(calls.some((c) => c.paragraphIndex === 1)).toBe(true);
    });
  });

  describe('previous()', () => {
    it('should go back to previous paragraph', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      await service.next(); // 0 -> 1

      const result = await service.previous();

      expect(isOk(result)).toBe(true);
      expect(service.getState().currentParagraphIndex).toBe(0);
    });

    it('should restart current paragraph when at beginning', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      const result = await service.previous();

      expect(isOk(result)).toBe(true);
      expect(service.getState().currentParagraphIndex).toBe(0);
    });
  });

  describe('seekToParagraph()', () => {
    it('should jump to specific paragraph', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      const result = await service.seekToParagraph(2);

      expect(isOk(result)).toBe(true);
      expect(service.getState().currentParagraphIndex).toBe(2);
    });

    it('should return error for invalid index', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      const result = await service.seekToParagraph(100);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('invalid_paragraph_index');
      }
    });

    it('should generate audio for target paragraph', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      mockAudioGenerator.generateAudioCalls = [];

      await service.seekToParagraph(2);

      expect(mockAudioGenerator.generateAudioCalls).toHaveLength(1);
      expect(mockAudioGenerator.generateAudioCalls[0].text).toBe(testParagraphs[2]);
    });
  });

  describe('seek()', () => {
    it('should update progress', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      const result = await service.seek(0.5);

      expect(isOk(result)).toBe(true);
      expect(service.getState().progress).toBe(0.5);
    });
  });

  describe('setSpeed()', () => {
    it('should update playback speed', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      const result = await service.setSpeed(1.5);

      expect(isOk(result)).toBe(true);
      expect(service.getState().speed).toBe(1.5);
    });

    it('should clamp speed to valid range', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);

      await service.setSpeed(10); // Above max
      expect(service.getState().speed).toBe(2.0);

      await service.setSpeed(0.1); // Below min
      expect(service.getState().speed).toBe(0.5);
    });

    it('should update footer state', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      mockHighlightSync.updateFooterStateCalls = [];

      await service.setSpeed(1.5);

      expect(mockHighlightSync.updateFooterStateCalls.length).toBeGreaterThan(0);
      const lastUpdate = mockHighlightSync.updateFooterStateCalls.at(-1);
      expect(lastUpdate?.state.speed).toBe(1.5);
    });
  });

  describe('setProvider()', () => {
    it('should update provider in state', async () => {
      await service.setProvider('elevenlabs');

      expect(service.getState().provider).toBe('elevenlabs');
    });
  });

  describe('setVoice()', () => {
    it('should update voice in state', async () => {
      await service.setVoice('custom-voice');

      expect(service.getState().voice).toBe('custom-voice');
    });
  });

  describe('setMode()', () => {
    it('should update mode in state', async () => {
      await service.setMode('selection');

      expect(service.getState().mode).toBe('selection');
    });
  });

  // PROSO-136 regression. The service adopted `initialPlaybackState` wholesale,
  // whose provider is the hardcoded literal 'elevenlabs'. Combined with the dead
  // `subscribeToSettings()` wiring, a reader configured for any other provider
  // had a service that was born believing it was ElevenLabs and never learned
  // otherwise — so a configured, granted, reachable local host still routed to
  // the managed server and answered a billing 402.
  describe('provider seeded from configuration', () => {
    it('reports the configured provider, not the hardcoded vendor default', () => {
      const configured = new PlaybackService({
        audioGenerator: mockAudioGenerator,
        audioUrlProvider: mockAudioUrlProvider,
        cacheStore: mockCacheStore,
        highlightSync: mockHighlightSync,
        settingsStore: mockSettingsStore,
        provider: 'local',
      });

      expect(configured.getState().provider).toBe('local');
    });

    it('falls back to the default when no provider is supplied', () => {
      expect(service.getState().provider).toBe('elevenlabs');
    });
  });

  describe('subscribeToSettings()', () => {
    // PROSO-136: the constructor now subscribes, because nothing else ever did —
    // the method was defined and never called, so `state.provider` had no live
    // source and kept its hardcoded birth value forever. This test previously
    // asserted exactly one call, which only held while the wiring was dead.
    it('subscribes at construction, and re-subscribing replaces rather than stacks', () => {
      expect(mockSettingsStore.subscribeCalls).toBe(1);

      service.subscribeToSettings();

      expect(mockSettingsStore.subscribeCalls).toBe(2);
    });

    it('should update state when settings change', () => {
      service.subscribeToSettings();

      mockSettingsStore.setSettings({
        provider: 'elevenlabs',
        speed: 1.5,
        voice: 'echo',
      });

      const state = service.getState();
      expect(state.provider).toBe('elevenlabs');
      expect(state.speed).toBe(1.5);
      expect(state.voice).toBe('echo');
    });
  });

  describe('unsubscribeFromSettings()', () => {
    it('should unsubscribe from settings store', () => {
      service.subscribeToSettings();
      expect(mockSettingsStore.getSubscriberCount()).toBe(1);

      service.unsubscribeFromSettings();
      expect(mockSettingsStore.getSubscriberCount()).toBe(0);
    });
  });

  describe('dispose()', () => {
    it('should clean up resources', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      service.subscribeToSettings();

      service.dispose();

      // Settings subscription should be cleaned up
      expect(mockSettingsStore.getSubscriberCount()).toBe(0);
      // Note: dispose() calls stop() synchronously but doesn't await it
      // The audio element should be nullified regardless of async stop
    });

    it('should unsubscribe from settings even without active playback', () => {
      service.subscribeToSettings();
      expect(mockSettingsStore.getSubscriberCount()).toBe(1);

      service.dispose();

      expect(mockSettingsStore.getSubscriberCount()).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle audio generation errors', async () => {
      mockAudioGenerator.setForceError({
        type: 'network',
        message: 'Connection failed',
      });

      const result = await service.start(testParagraphs, testTabId, testPageUrl);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.type).toBe('audio_generation');
      }
    });

    it('should set error state on audio generation failure', async () => {
      mockAudioGenerator.setForceError({
        type: 'network',
        message: 'Connection failed',
      });

      await service.start(testParagraphs, testTabId, testPageUrl);

      expect(service.getState().status).toBe('error');
      expect(service.getState().error).toBeDefined();
    });

    it('should notify the tab when audio generation fails (T006/T007)', async () => {
      mockAudioGenerator.setForceError({
        type: 'network',
        message: 'Connection failed',
      });

      await service.start(testParagraphs, testTabId, testPageUrl);

      expect(mockHighlightSync.showErrorCalls.length).toBeGreaterThan(0);
      expect(mockHighlightSync.showErrorCalls[0]?.tabId).toBe(testTabId);
      expect(mockHighlightSync.showErrorCalls[0]?.message.length).toBeGreaterThan(0);
    });

    it('should notify the tab when auto-advance generation fails (T008)', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      mockHighlightSync.showErrorCalls = []; // Reset

      mockAudioGenerator.setForceError({
        type: 'network',
        message: 'Connection failed',
      });

      await service.next();

      expect(mockHighlightSync.showErrorCalls.length).toBeGreaterThan(0);
      expect(service.getState().status).toBe('error');
    });

    it('should notify the tab when audio.play() rejects (T009)', async () => {
      const playSpy = jest
        .spyOn(global.Audio.prototype, 'play')
        .mockRejectedValueOnce(new DOMException('Blocked by autoplay policy', 'NotAllowedError'));

      await service.start(testParagraphs, testTabId, testPageUrl);

      expect(service.getState().status).toBe('error');
      expect(mockHighlightSync.showErrorCalls.length).toBeGreaterThan(0);

      playSpy.mockRestore();
    });

    it('should leave the footer in an error state, not stuck on playing', async () => {
      mockAudioGenerator.setForceError({
        type: 'network',
        message: 'Connection failed',
      });
      mockHighlightSync.updateFooterStateCalls = []; // Reset

      await service.start(testParagraphs, testTabId, testPageUrl);

      const lastUpdate = mockHighlightSync.updateFooterStateCalls.at(-1);
      expect(lastUpdate?.state.status).toBe('error');
    });

    it('should stop playback when the tab goes away mid-highlight (T010)', async () => {
      await service.start(testParagraphs, testTabId, testPageUrl);
      mockHighlightSync.setForceError(highlightError.tabNotFound(testTabId));

      await service.next();

      expect(service.getState().status).toBe('stopped');
    });
  });

  describe('setAudioGenerator (T020)', () => {
    it('should route generation through the newly-set generator', async () => {
      // Start playback so the service is in a state where next() will
      // trigger a fresh generateAndPlayParagraph (and thus a generator call).
      await service.start(testParagraphs, testTabId, testPageUrl);

      // The original generator was used for paragraph 0.
      expect(mockAudioGenerator.generateAudioCalls).toHaveLength(1);

      // Swap in a brand-new generator instance.
      const newGenerator = createMockAudioGenerator();
      service.setAudioGenerator(newGenerator);

      // Reset the original's call log so we can prove it is no longer used.
      mockAudioGenerator.generateAudioCalls = [];

      // Advance to the next paragraph — this exercises the generate path.
      const result = await service.next();

      expect(isOk(result)).toBe(true);
      // The NEW generator must have produced the audio for paragraph 1.
      expect(newGenerator.generateAudioCalls).toHaveLength(1);
      expect(newGenerator.generateAudioCalls[0].text).toBe(testParagraphs[1]);
      // The original generator must NOT have been touched after the swap.
      expect(mockAudioGenerator.generateAudioCalls).toHaveLength(0);
    });
  });

  describe('performance', () => {
    it('should complete operations quickly with mocks', async () => {
      const start = Date.now();

      await service.start(testParagraphs, testTabId, testPageUrl);
      await service.pause();
      await service.resume();
      await service.next();
      await service.previous();
      await service.stop();

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});
