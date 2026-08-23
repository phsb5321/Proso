import { describe, expect, it, jest } from '@jest/globals';
import type { PlaybackService } from '../../../src/core/playback/playback-service';
import { stopPlaybackForTabChange } from '../../../src/background/tab-playback-policy';

function playbackAt(tabId: number | null) {
  const stop = jest.fn(async () => ({ ok: true }));
  const playback = {
    getState: () => ({ activeTabId: tabId }),
    stop,
  } as unknown as Pick<PlaybackService, 'getState' | 'stop'>;
  return { playback, stop };
}

describe('stopPlaybackForTabChange', () => {
  it('stops through PlaybackService when another tab replaces the reading tab', async () => {
    const { playback, stop } = playbackAt(7);

    await expect(stopPlaybackForTabChange(playback, 9, true)).resolves.toBe(true);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the preference is disabled', 7, 9, false],
    ['nothing is being read', null, 9, true],
    ['the activated tab owns playback', 9, 9, true],
  ])('does not stop when %s', async (_case, playbackTabId, activatedTabId, enabled) => {
    const { playback, stop } = playbackAt(playbackTabId as number | null);

    await expect(stopPlaybackForTabChange(playback, activatedTabId, enabled)).resolves.toBe(false);
    expect(stop).not.toHaveBeenCalled();
  });
});
