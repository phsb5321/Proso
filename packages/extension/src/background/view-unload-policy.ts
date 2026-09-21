import { readBackgroundPlaybackEnabled } from '../utils/config/background-playback';

/**
 * Decide what a view unload means for playback.
 *
 * The content script never decides on its own: it reports that its view is gone
 * (navigation, reload, tab close) and this policy applies the same preference
 * the tab-activation policy uses. That keeps one owner for the stop-vs-continue
 * decision instead of two paths that can disagree.
 *
 * Two identities guard the decision, because a tab id is not a session:
 *
 * 1. The unloader's document id must match the session's, so a tab that
 *    navigated and started a new session cannot be ended by the previous
 *    document's late unload.
 * 2. The session owner is captured before the preference read and revalidated
 *    after it, so a session that starts (or ends) while storage is in flight is
 *    never acted on with the old decision.
 */
export interface SessionOwner {
  readonly tabId: number;
  readonly documentId: string | null;
}

export interface ViewUnload {
  /** Tab that reported the unload, when the sender had one. */
  readonly tabId?: number;
  /** Document that reported the unload; null/absent means "unknown". */
  readonly documentId?: string | null;
}

export interface ViewUnloadPlayback {
  getState(): { activeTabId: number | null };
  getSessionOwner(): SessionOwner | null;
  stop(): Promise<unknown>;
  detachVisualAttachment(documentId?: string | null): void;
}

export interface ViewUnloadOutcome {
  /** Audio continues with no attached view. */
  readonly detached: boolean;
  /** Playback ended because the reader left with background playback off. */
  readonly stopped: boolean;
}

const NO_OP: ViewUnloadOutcome = { detached: false, stopped: false };

function sameOwner(left: SessionOwner, right: SessionOwner): boolean {
  return left.tabId === right.tabId && left.documentId === right.documentId;
}

/** Whether the unload can belong to this session at all. */
function unloadMatchesOwner(unload: ViewUnload, owner: SessionOwner): boolean {
  if (unload.tabId !== undefined && unload.tabId !== owner.tabId) return false;
  if (
    unload.documentId !== undefined &&
    unload.documentId !== null &&
    owner.documentId !== null &&
    unload.documentId !== owner.documentId
  ) {
    return false;
  }
  return true;
}

export async function applyViewUnloadPolicy(
  playback: ViewUnloadPlayback,
  unload: ViewUnload,
  backgroundPlaybackEnabled?: boolean,
): Promise<ViewUnloadOutcome> {
  const ownerBefore = playback.getSessionOwner();
  if (ownerBefore === null) return NO_OP;
  if (!unloadMatchesOwner(unload, ownerBefore)) {
    // Another tab, or another document in the same tab, went away.
    return NO_OP;
  }

  const enabled = backgroundPlaybackEnabled ?? (await readBackgroundPlaybackEnabled());

  // Storage may have taken arbitrarily long; the session that decision was made
  // for may no longer exist, and acting on the stale answer would stop or
  // detach a session the reader started in the meantime.
  const ownerAfter = playback.getSessionOwner();
  if (ownerAfter === null || !sameOwner(ownerBefore, ownerAfter)) return NO_OP;

  if (enabled) {
    playback.detachVisualAttachment(ownerAfter.documentId);
    return { detached: true, stopped: false };
  }

  await playback.stop();
  return { detached: false, stopped: true };
}
