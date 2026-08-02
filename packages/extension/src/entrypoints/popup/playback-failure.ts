// SPDX-License-Identifier: AGPL-3.0-or-later

/** Render a failed public playback start without leaving a transient status. */
export function showPlaybackStartFailure(
  statusDot: HTMLElement,
  statusText: HTMLElement,
  error: unknown,
): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string' && error.length > 0
        ? error
        : 'Playback failed';

  statusDot.setAttribute('data-status', 'stopped');
  statusText.textContent = message;
}
