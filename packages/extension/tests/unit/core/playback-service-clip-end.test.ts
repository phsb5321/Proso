/**
 * Natural clip end vs the popup-honesty pause handler (256 T008, Gap A).
 *
 * Firefox dispatches `pause` with `ended === true` *before* `ended` at a
 * natural clip boundary. The pause listener added for popup honesty used to
 * flip the session to `paused` first, and the `ended` handler's
 * playing-status guard then suppressed the auto-advance — playback stalled
 * at every clip boundary on the loaded-Firefox journey, hidden or not.
 *
 * @module tests/unit/core/playback-service-clip-end
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { PlaybackService } from '../../../src/core/playback/playback-service';
import { captureAudioElementListeners, type AudioListenerCapture } from '../../helpers/audio-listener-capture';
import {
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

describe("PlaybackService at a natural clip end ('pause' before 'ended')", () => {
  const testTabId = 123;
  const testPageUrl = 'https://example.com/article';

  let service: PlaybackService;
  let mockHighlightSync: MockHighlightSync;
  let audio: AudioListenerCapture;

  beforeEach(() => {
    const mockAudioUrlProvider: MockAudioUrlProvider = createMockAudioUrlProvider();
    const mockCacheStore: MockCacheStore = createMockCacheStore();
    mockHighlightSync = createMockHighlightSync({ validTabIds: [testTabId] });
    const mockSettingsStore: MockSettingsStore = createMockSettingsStore();
    audio = captureAudioElementListeners();

    service = new PlaybackService({
      audioGenerator: createMockAudioGenerator(),
      audioUrlProvider: mockAudioUrlProvider,
      cacheStore: mockCacheStore,
      highlightSync: mockHighlightSync,
      settingsStore: mockSettingsStore,
    });
  });

  afterEach(async () => {
    await service.stop().catch(() => undefined);
    // captureAudioElementListeners installs jest.spyOn mocks; restore them so
    // later suites see the real prototypes.
    const { jest } = await import('@jest/globals');
    jest.restoreAllMocks();
  });

  /** Replay Firefox's natural clip end: pause (already ended) then ended. */
  async function fireNaturalClipEnd(): Promise<void> {
    audio.setEnded(true);
    audio.pause();
    audio.ended();
    // Let next() + the instant generator settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it("advances to the next paragraph although 'pause' fires before 'ended'", async () => {
    await service.start(
      ['First paragraph with text.', 'Second paragraph with text.'],
      testTabId,
      testPageUrl,
    );
    expect(service.getState().status).toBe('playing');

    await fireNaturalClipEnd();

    const state = service.getState();
    expect(state.currentParagraphIndex).toBe(1);
    expect(state.status).toBe('playing');
    // The next paragraph's highlight was requested from the (alive) view.
    expect(mockHighlightSync.highlightParagraphCalls.some((c) => c.paragraphIndex === 1)).toBe(
      true,
    );
  });

  it('stops cleanly when the final clip ends naturally', async () => {
    await service.start(['Only paragraph.'], testTabId, testPageUrl);

    await fireNaturalClipEnd();

    const state = service.getState();
    expect(state.status).toBe('stopped');
    expect(state.currentParagraphIndex).toBe(0);
  });

  it("still publishes 'paused' when the browser pauses mid-clip (popup honesty)", async () => {
    await service.start(
      ['First paragraph with text.', 'Second paragraph with text.'],
      testTabId,
      testPageUrl,
    );
    audio.setEnded(false);

    audio.pause();

    expect(service.getState().status).toBe('paused');
  });
});
