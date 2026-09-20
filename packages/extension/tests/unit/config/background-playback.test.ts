/**
 * Background-playback polarity.
 *
 * The stored key is the legacy `stopPlaybackOnTabChange`; the product presents
 * a positive choice. Exactly one module owns that inversion, so these tests pin
 * both directions and the fail-closed default.
 *
 * @module tests/unit/config/background-playback
 */

import { describe, expect, it } from '@jest/globals';

import {
  STOP_ON_LEAVE_DEFAULT,
  isBackgroundPlaybackEnabled,
  toStoredPreference,
} from '../../../src/utils/config/background-playback';

describe('background playback polarity', () => {
  it('treats the stored default as "leaving ends playback"', () => {
    expect(STOP_ON_LEAVE_DEFAULT).toBe(true);
    expect(isBackgroundPlaybackEnabled({})).toBe(false);
    expect(isBackgroundPlaybackEnabled(null)).toBe(false);
    expect(isBackgroundPlaybackEnabled(undefined)).toBe(false);
  });

  it('maps stored true to background playback off and stored false to on', () => {
    expect(isBackgroundPlaybackEnabled({ stopPlaybackOnTabChange: true })).toBe(false);
    expect(isBackgroundPlaybackEnabled({ stopPlaybackOnTabChange: false })).toBe(true);
  });

  it('round-trips through the stored representation', () => {
    expect(toStoredPreference(true)).toBe(false);
    expect(toStoredPreference(false)).toBe(true);
    expect(isBackgroundPlaybackEnabled({ stopPlaybackOnTabChange: toStoredPreference(true) })).toBe(
      true,
    );
    expect(
      isBackgroundPlaybackEnabled({ stopPlaybackOnTabChange: toStoredPreference(false) }),
    ).toBe(false);
  });

  it('ignores non-boolean stored values rather than guessing', () => {
    expect(isBackgroundPlaybackEnabled({ stopPlaybackOnTabChange: 'false' })).toBe(false);
  });
});
