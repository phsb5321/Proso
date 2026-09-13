/**
 * Reader-control regressions reported from a real reading session
 * (02/09/2026): the footer froze mid-article, and its readouts disagreed
 * with each other — `14:00 / 14:00` beside an empty progress bar and
 * `11/56`.
 *
 * Each test here is the smallest thing that fails when one of those
 * behaviors regresses.
 *
 * @module tests/unit/core/playback-service-reader-controls
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { PlaybackService } from '../../../src/core/playback/playback-service';
import { audioError } from '../../../src/core/shared/errors';
import { isOk } from '../../../src/core/shared/result';
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

describe('PlaybackService reader controls', () => {
  let service: PlaybackService;
  let audioGenerator: MockAudioGenerator;
  let audioUrlProvider: MockAudioUrlProvider;
  let cacheStore: MockCacheStore;
  let highlightSync: MockHighlightSync;
  let settingsStore: MockSettingsStore;

  const paragraphs = [
    'First paragraph of the article under test.',
    'Second paragraph of the article under test.',
    'Third paragraph of the article under test.',
    'Fourth paragraph of the article under test.',
  ];
  const tabId = 123;
  const pageUrl = 'https://example.com/article';

  beforeEach(() => {
    audioGenerator = createMockAudioGenerator();
    audioUrlProvider = createMockAudioUrlProvider();
    cacheStore = createMockCacheStore();
    highlightSync = createMockHighlightSync({ validTabIds: [tabId] });
    settingsStore = createMockSettingsStore();

    service = new PlaybackService({
      audioGenerator,
      audioUrlProvider,
      cacheStore,
      highlightSync,
      settingsStore,
    });
  });

  describe('Play is never a no-op while the footer is up', () => {
    it('retries the current paragraph after a generation failure', async () => {
      await service.start(paragraphs, tabId, pageUrl);
      await service.seekToParagraph(2);

      audioGenerator.setForceError(audioError.providerError('429', 'Rate limited'));
      await service.next();
      expect(service.getState().status).toBe('error');

      audioGenerator.setForceError(null);
      const callsBeforePlay = audioGenerator.generateAudioCalls.length;

      const result = await service.resume();

      expect(isOk(result)).toBe(true);
      expect(audioGenerator.generateAudioCalls.length).toBe(callsBeforePlay + 1);
      expect(service.getState().status).toBe('playing');
      expect(service.getState().currentParagraphIndex).toBe(3);
    });

    it('retries a paragraph still stuck loading', async () => {
      await service.start(paragraphs, tabId, pageUrl);

      // A transition whose fetch has not landed leaves the state in `loading`,
      // and the footer draws the play glyph there too. Play is the only
      // control the reader has, so it has to do something.
      audioGenerator.setLatency(400);
      const stalled = service.next();
      expect(service.getState().status).toBe('loading');

      audioGenerator.setLatency(0);
      const result = await service.resume();

      expect(isOk(result)).toBe(true);
      expect(service.getState().status).toBe('playing');
      await stalled;
    });

    it('still refuses to resume with nothing loaded', async () => {
      const result = await service.resume();

      expect(isOk(result)).toBe(false);
      expect(service.getState().status).toBe('idle');
    });
  });

  describe('footer readouts describe the article, not one paragraph', () => {
    it('reports document progress rather than intra-paragraph progress', async () => {
      await service.start(paragraphs, tabId, pageUrl);
      await service.seekToParagraph(2);

      const footerState = highlightSync.getFooterState(tabId);
      expect(footerState).toBeDefined();
      if (!footerState) return;

      // Paragraph 3 of 4 has just begun: half the article is behind us, not
      // none of it and not all of it.
      expect(footerState.progress).toBeGreaterThanOrEqual(0.5);
      expect(footerState.progress).toBeLessThan(0.75);
    });

    it('never shows elapsed equal to total before the last paragraph', async () => {
      await service.start(paragraphs, tabId, pageUrl);
      await service.seekToParagraph(1);

      const footerState = highlightSync.getFooterState(tabId);
      expect(footerState).toBeDefined();
      if (!footerState) return;

      expect(footerState.currentTime).not.toBe(footerState.totalTime);
    });

    it('advances elapsed time as paragraphs complete', async () => {
      await service.start(paragraphs, tabId, pageUrl);
      const atStart = highlightSync.getFooterState(tabId)?.currentTime;

      await service.seekToParagraph(3);
      const atEnd = highlightSync.getFooterState(tabId)?.currentTime;

      expect(atStart).toBe('0:00');
      expect(atEnd).not.toBe('0:00');
    });
  });

  describe('voice changes apply to the paragraph being read', () => {
    /** A reader picking a voice writes it to the settings store, from any surface. */
    const chooseVoice = async (voice: string | null): Promise<void> => {
      await settingsStore.updateSettings({ voice });
      // The store notifies synchronously; the re-read it triggers is async.
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    it('re-synthesizes the current paragraph with the new voice', async () => {
      await service.start(paragraphs, tabId, pageUrl);
      const callsBeforeSwitch = audioGenerator.generateAudioCalls.length;

      await chooseVoice('mock-voice-2');

      expect(audioGenerator.generateAudioCalls.length).toBe(callsBeforeSwitch + 1);
      const lastCall = audioGenerator.generateAudioCalls.at(-1);
      expect(lastCall?.voice).toBe('mock-voice-2');
      expect(lastCall?.text).toBe(paragraphs[0]);
      expect(service.getState().currentParagraphIndex).toBe(0);
    });

    it('keeps an explicitly paused reading paused after selecting a new voice', async () => {
      await service.start(paragraphs, tabId, pageUrl);
      await service.pause();
      await chooseVoice('mock-voice-2');
      expect(audioGenerator.generateAudioCalls.at(-1)?.voice).toBe('mock-voice-2');
      expect(service.getState().status).toBe('paused');
      expect(service.getState().currentParagraphIndex).toBe(0);
    });

    it('does not synthesize when the voice is unchanged', async () => {
      await service.start(paragraphs, tabId, pageUrl);
      await chooseVoice('mock-voice-2');
      const callsAfterSwitch = audioGenerator.generateAudioCalls.length;

      await chooseVoice('mock-voice-2');

      expect(audioGenerator.generateAudioCalls.length).toBe(callsAfterSwitch);
    });

    it('does not start playback when nothing is being read', async () => {
      await chooseVoice('mock-voice-2');

      expect(audioGenerator.generateAudioCalls).toHaveLength(0);
      expect(service.getState().status).toBe('idle');
    });

    it('leaves the clip alone for an internal voice repair', async () => {
      await service.start(paragraphs, tabId, pageUrl);
      const callsBeforeRepair = audioGenerator.generateAudioCalls.length;

      // Adopting a provider's own voice is a route repair, not a reader asking
      // to be read to differently — it must not restart the paragraph.
      await service.setVoice(null);

      expect(audioGenerator.generateAudioCalls.length).toBe(callsBeforeRepair);
      expect(service.getState().voice).toBeNull();
    });
  });
});
