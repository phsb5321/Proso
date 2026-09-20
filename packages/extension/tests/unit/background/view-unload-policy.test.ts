/**
 * View-unload policy.
 *
 * A view going away must end playback when the reader chose that, and must only
 * detach the view when they chose background playback. The decision also has to
 * ignore unloads from tabs that are not the playing one, or a background tab
 * navigating would kill an unrelated session.
 *
 * @module tests/unit/background/view-unload-policy
 */

import { describe, expect, it, jest } from '@jest/globals';

import { applyViewUnloadPolicy } from '../../../src/background/view-unload-policy';

function createFakeService(playingTabId: number | null) {
  const stop = jest.fn(async () => undefined);
  const detachVisualAttachment = jest.fn();
  return {
    stop,
    detachVisualAttachment,
    getState: () => ({ activeTabId: playingTabId }),
  };
}

interface Case {
  readonly name: string;
  readonly playingTabId: number | null;
  readonly unloadedTabId: number | undefined;
  readonly backgroundPlaybackEnabled: boolean;
  readonly expected: { detached: boolean; stopped: boolean };
  readonly detachCalls: number;
  readonly stopCalls: number;
}

const CASES: readonly Case[] = [
  {
    name: 'detaches the view and keeps audio when background playback is enabled',
    playingTabId: 7,
    unloadedTabId: 7,
    backgroundPlaybackEnabled: true,
    expected: { detached: true, stopped: false },
    detachCalls: 1,
    stopCalls: 0,
  },
  {
    name: 'stops playback when background playback is disabled',
    playingTabId: 7,
    unloadedTabId: 7,
    backgroundPlaybackEnabled: false,
    expected: { detached: false, stopped: true },
    detachCalls: 0,
    stopCalls: 1,
  },
  {
    name: 'ignores an unload reported by a tab that is not playing',
    playingTabId: 7,
    unloadedTabId: 42,
    backgroundPlaybackEnabled: true,
    expected: { detached: false, stopped: false },
    detachCalls: 0,
    stopCalls: 0,
  },
  {
    name: 'does nothing when no session is active',
    playingTabId: null,
    unloadedTabId: 7,
    backgroundPlaybackEnabled: true,
    expected: { detached: false, stopped: false },
    detachCalls: 0,
    stopCalls: 0,
  },
  {
    name: 'applies the same rule when the sender tab is unknown',
    playingTabId: 7,
    unloadedTabId: undefined,
    backgroundPlaybackEnabled: true,
    expected: { detached: true, stopped: false },
    detachCalls: 1,
    stopCalls: 0,
  },
];

describe('applyViewUnloadPolicy', () => {
  it.each(CASES)('$name', async (testCase) => {
    const service = createFakeService(testCase.playingTabId);

    const outcome = await applyViewUnloadPolicy(
      service,
      testCase.unloadedTabId,
      testCase.backgroundPlaybackEnabled,
    );

    expect(outcome).toEqual(testCase.expected);
    expect(service.detachVisualAttachment).toHaveBeenCalledTimes(testCase.detachCalls);
    expect(service.stop).toHaveBeenCalledTimes(testCase.stopCalls);
  });
});
