import { readBackgroundPlaybackEnabled } from '../utils/config/background-playback';

/**
 * Decide what a view unload means for playback.
 *
 * The content script no longer decides on its own: it reports that its view is
 * gone (navigation, reload, tab close) and this policy applies the same
 * preference the tab-activation policy uses. That keeps one owner for the
 * stop-vs-continue decision instead of two paths that can disagree.
 */
export interface ViewUnloadOutcome {
  /** Audio continues with no attached view. */
  readonly detached: boolean;
  /** Playback ended because the reader left with background playback off. */
  readonly stopped: boolean;
}

/**
 * The slice of the playback service this policy needs, declared structurally so
 * the decision can be tested without constructing the whole service.
 */
export interface ViewUnloadPlayback {
  getState(): { activeTabId: number | null };
  stop(): Promise<unknown>;
  detachVisualAttachment(): void;
}

export async function applyViewUnloadPolicy(
  playback: ViewUnloadPlayback,
  unloadedTabId: number | undefined,
  backgroundPlaybackEnabled?: boolean,
): Promise<ViewUnloadOutcome> {
  const playingTabId = playback.getState().activeTabId;
  if (playingTabId === null) return { detached: false, stopped: false };
  if (unloadedTabId !== undefined && unloadedTabId !== playingTabId) {
    // A different tab's view went away; the playing session is untouched.
    return { detached: false, stopped: false };
  }

  const enabled = backgroundPlaybackEnabled ?? (await readBackgroundPlaybackEnabled());
  if (enabled) {
    playback.detachVisualAttachment();
    return { detached: true, stopped: false };
  }

  await playback.stop();
  return { detached: false, stopped: true };
}
