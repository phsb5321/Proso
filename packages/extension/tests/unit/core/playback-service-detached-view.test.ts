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

import { describe, expect, it, jest } from '@jest/globals';

import type { PlaybackService } from '../../../src/core/playback/playback-service';
import { createInstantAudioGenerator } from '../../helpers/instant-audio-generator';
import { createPrefetchPlaybackHarness } from '../../helpers/prefetch-playback-harness';

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

  it('publishes the original title and live audio through detach, pause, resume and stop', async () => {
    const audio = new Audio();
    const audioConstructor = jest.spyOn(globalThis, 'Audio').mockImplementation(() => audio);
    const { service, highlightSync } = createPrefetchPlaybackHarness(
      createInstantAudioGenerator(),
      {
        settings: { stopPlaybackOnTabChange: false },
      },
    );
    try {
      service.setLanguage('en');
      await service.start(['First sentence.'], 7, 'https://example.test/a', 'Original article');
      expect(service.getAttentionState()).toMatchObject({
        documentTitle: 'Original article',
        audioLive: true,
      });
      service.detachVisualAttachment();
      expect(highlightSync.updateFooterStateCalls.at(-1)?.state).toMatchObject({
        visualAttachmentDetached: true,
        audioLive: true,
      });
      audio.dispatchEvent(new Event('waiting'));
      expect(service.getAttentionState().audioLive).toBe(false);
      audio.dispatchEvent(new Event('playing'));
      expect(service.getAttentionState().audioLive).toBe(true);
      await service.pause();
      expect(service.getAttentionState().audioLive).toBe(false);
      await service.resume();
      expect(service.getAttentionState().audioLive).toBe(true);
      await service.stop();
      expect(highlightSync.updateFooterStateCalls.at(-1)?.state).toMatchObject({
        status: 'stopped',
        audioLive: false,
        documentTitle: 'Original article',
      });
    } finally {
      await service.stop();
      audioConstructor.mockRestore();
    }
  });

  it('publishes stopped even when clearing and hiding the source view fail', async () => {
    const { service, highlightSync } = createPrefetchPlaybackHarness(
      createInstantAudioGenerator(),
      {
        settings: { stopPlaybackOnTabChange: false },
      },
    );
    service.setLanguage('en');
    await service.start(['First sentence.'], 999, 'https://example.test/a');
    await service.stop();
    expect(highlightSync.updateFooterStateCalls.at(-1)?.state).toMatchObject({
      status: 'stopped',
      audioLive: false,
    });
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

/** Start a session whose view is known to the highlight mock. */
async function startWithLiveView(options: {
  backgroundPlayback?: boolean;
  documentId?: string | null;
}): Promise<ReturnType<typeof createPrefetchPlaybackHarness>> {
  const harness = createPrefetchPlaybackHarness(createInstantAudioGenerator(), {
    settings: options.backgroundPlayback ? { stopPlaybackOnTabChange: false } : undefined,
  });
  harness.service.setLanguage('en');
  await harness.service.start(
    ['First sentence.', 'Second sentence.'],
    7,
    'https://example.test/a',
    'Article',
    options.documentId ?? 'doc-a',
  );
  return harness;
}

describe('PlaybackService visual delivery guards', () => {
  it('sends no progress visuals once the view detached', async () => {
    const harness = await startWithLiveView({ backgroundPlayback: true });
    harness.service.detachVisualAttachment('doc-a');
    const before = harness.highlightSync.highlightParagraphCalls.length;

    await harness.service.seekToParagraph(1);

    expect(harness.service.isVisuallyDetached()).toBe(true);
    expect(harness.highlightSync.highlightParagraphCalls.length).toBe(before);
  });

  it('sends no progress visuals while the view is hidden, and resumes when visible', async () => {
    const harness = await startWithLiveView({ backgroundPlayback: true });
    harness.service.setVisualsVisible(false, 'doc-a');
    const hiddenBefore = harness.highlightSync.highlightParagraphCalls.length;

    await harness.service.seekToParagraph(1);
    expect(harness.highlightSync.highlightParagraphCalls.length).toBe(hiddenBefore);

    harness.service.setVisualsVisible(true, 'doc-a');
    await harness.service.seekToParagraph(0);
    expect(harness.highlightSync.highlightParagraphCalls.length).toBeGreaterThan(hiddenBefore);
  });

  it('ignores a detach request that names another document', async () => {
    const harness = await startWithLiveView({ backgroundPlayback: true });

    harness.service.detachVisualAttachment('doc-replaced');
    expect(harness.service.isVisuallyDetached()).toBe(false);

    harness.service.detachVisualAttachment('doc-a');
    expect(harness.service.isVisuallyDetached()).toBe(true);
  });

  it('exposes the session owner so a late unload can be recognised', async () => {
    const harness = await startWithLiveView({ backgroundPlayback: true, documentId: 'doc-a' });

    expect(harness.service.getSessionOwner()).toEqual({ tabId: 7, documentId: 'doc-a' });
  });
});

describe('PlaybackService reattach, revocation and native transport', () => {
  it('re-attaches an identity-matched view and clears the detached state', async () => {
    const harness = await startWithLiveView({ backgroundPlayback: true, documentId: 'doc-a' });
    harness.service.detachVisualAttachment('doc-a');
    expect(harness.service.isVisuallyDetached()).toBe(true);

    expect(harness.service.reattachVisualAttachment('doc-a')).toBe(true);
    expect(harness.service.isVisuallyDetached()).toBe(false);
  });

  it('refuses to re-attach a document that does not own the session', async () => {
    const harness = await startWithLiveView({ backgroundPlayback: true, documentId: 'doc-a' });
    harness.service.detachVisualAttachment('doc-a');

    expect(harness.service.reattachVisualAttachment('doc-other')).toBe(false);
    expect(harness.service.isVisuallyDetached()).toBe(true);
  });

  it('stops a detached session only when one is detached', async () => {
    const harness = await startWithLiveView({ backgroundPlayback: true, documentId: 'doc-a' });

    // Attached: the preference change must not end a session the reader is
    // watching.
    expect(await harness.service.stopDetachedSession()).toBe(false);

    harness.service.detachVisualAttachment('doc-a');
    expect(await harness.service.stopDetachedSession()).toBe(true);
    expect(harness.service.getState().status).toBe('stopped');
  });

  it('publishes a pause the browser performed instead of the service', async () => {
    const audio = new Audio();
    const audioConstructor = jest.spyOn(globalThis, 'Audio').mockImplementation(() => audio);
    try {
      const harness = await startWithLiveView({ backgroundPlayback: true });
      // The element pauses for its own reasons (media key, output change).
      audio.dispatchEvent(new Event('pause'));
      expect(harness.service.getState().status).toBe('paused');

      audio.dispatchEvent(new Event('playing'));
      expect(harness.service.getState().status).not.toBe('paused');
    } finally {
      audioConstructor.mockRestore();
    }
  });
});
