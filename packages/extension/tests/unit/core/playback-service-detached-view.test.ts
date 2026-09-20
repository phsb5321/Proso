/**
 * A vanished reading view must not end the audio when the reader asked to keep
 * listening.
 *
 * `checkHighlight` used to treat `tab_not_found` / `content_script_not_loaded`
 * as fatal: navigating away, reloading, or closing the view stopped playback.
 * With background playback enabled the session detaches instead; with it
 * disabled the old stop stands.
 *
 * The preference arrives through the settings port exactly as production
 * delivers it, so these tests exercise the real polarity and its default.
 *
 * @module tests/unit/core/playback-service-detached-view
 */

import { describe, expect, it } from '@jest/globals';

import { PlaybackService } from '../../../src/core/playback/playback-service';
import { createPrefetchPlaybackHarness } from '../../helpers/prefetch-playback-harness';
import { createInstantAudioGenerator } from '../../helpers/instant-audio-generator';

/**
 * Start a session on a tab the highlight mock does not know, so every visual
 * call answers `tab_not_found` exactly as a navigated-away view does.
 */
async function startOnVanishedView(options: { backgroundPlayback?: boolean } = {}): Promise<{
  service: PlaybackService;
}> {
  const { service } = createPrefetchPlaybackHarness(createInstantAudioGenerator(), {
    settings: options.backgroundPlayback ? { stopPlaybackOnTabChange: false } : undefined,
  });
  service.setLanguage('en');
  await service.start(['First sentence.', 'Second sentence.'], 999, 'https://example.test/a');
  return { service };
}

describe('PlaybackService with a vanished view', () => {
  it('still stops when the reader left background playback off (shipped default)', async () => {
    const { service } = await startOnVanishedView();

    expect(service.isVisuallyDetached()).toBe(false);
    expect(service.getState().status).toBe('stopped');
  });

  it('detaches instead of stopping when the reader enabled background playback', async () => {
    const { service } = await startOnVanishedView({ backgroundPlayback: true });

    expect(service.isVisuallyDetached()).toBe(true);
    expect(service.getState().status).not.toBe('stopped');
  });

  it('clears the detached state when a new document starts', async () => {
    const { service } = await startOnVanishedView({ backgroundPlayback: true });
    expect(service.isVisuallyDetached()).toBe(true);

    // The harness's highlight mock knows tab 7, so the new document has a live view.
    service.setLanguage('en');
    await service.start(['Fresh.'], 7, 'https://example.test/b');

    expect(service.isVisuallyDetached()).toBe(false);
  });
});
