/**
 * Background-playback polarity (pure).
 *
 * The stored preference is `stopPlaybackOnTabChange` (default true) because it
 * shipped first and renaming a stored key needs a migration. The product now
 * presents the opposite, positive choice — "Keep listening when I leave this
 * page" — so exactly one module owns the inversion, and no second boolean is
 * added. Storage access lives with the callers that own it (the settings port
 * for the service, the background policy for the raw key), so this module stays
 * framework-free and usable from the core layer.
 *
 * @module utils/config/background-playback
 */

/** Stored default: end playback when the reader leaves the page. */
export const STOP_ON_LEAVE_DEFAULT = true;

export interface StoredBackgroundPreference {
  readonly stopPlaybackOnTabChange?: unknown;
}

/** Stored preference -> product behavior. A missing value keeps the default. */
export function isBackgroundPlaybackEnabled(
  stored: StoredBackgroundPreference | null | undefined,
): boolean {
  return (stored?.stopPlaybackOnTabChange ?? STOP_ON_LEAVE_DEFAULT) === false;
}

/** Product behavior -> value to persist under the legacy key. */
export function toStoredPreference(backgroundPlaybackEnabled: boolean): boolean {
  return !backgroundPlaybackEnabled;
}

/**
 * Read the preference straight from extension storage.
 *
 * Fails closed to the shipped default so a storage error can never silently
 * turn on a mode the reader did not choose.
 */
export async function readBackgroundPlaybackEnabled(): Promise<boolean> {
  const { browser } = await import('wxt/browser');
  try {
    const stored = await browser.storage.local.get('stopPlaybackOnTabChange');
    return isBackgroundPlaybackEnabled(stored as StoredBackgroundPreference);
  } catch {
    return isBackgroundPlaybackEnabled({});
  }
}
