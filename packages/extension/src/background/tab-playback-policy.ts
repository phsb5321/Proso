import type { PlaybackService } from '../core/playback/playback-service';

/**
 * Stop a reading session when browser focus moves away from its page.
 *
 * The service owns cancellation and visual cleanup; this policy only decides
 * whether the existing stop path applies to the activation event.
 */
export async function stopPlaybackForTabChange(
  playback: Pick<PlaybackService, 'getState' | 'stop'>,
  activatedTabId: number,
  enabled: boolean,
): Promise<boolean> {
  const playbackTabId = playback.getState().activeTabId;
  if (!enabled || playbackTabId === null || playbackTabId === activatedTabId) {
    return false;
  }

  await playback.stop();
  return true;
}
