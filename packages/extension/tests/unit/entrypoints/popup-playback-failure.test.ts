// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from '@jest/globals';
import { showPlaybackStartFailure } from '../../../src/entrypoints/popup/playback-failure';

describe('showPlaybackStartFailure', () => {
  it('shows the actionable remedy verbatim and leaves playback stopped', () => {
    const statusDot = document.createElement('span');
    const statusText = document.createElement('span');
    const remedy =
      'Managed TTS is not included in this tier. Add a provider API key in settings, or use a plan that includes managed TTS.';

    showPlaybackStartFailure(statusDot, statusText, remedy);

    expect(statusDot.getAttribute('data-status')).toBe('stopped');
    expect(statusText.textContent).toBe(remedy);
    expect(statusText.textContent).not.toMatch(/^(Network error|Provider error|Error):/);
  });
});
