// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Derived provider state (PROSO-130d).
 *
 * "Which provider will play" is ONE derived value; the provider dropdown, the
 * local-host section, and the stored `provider` must never disagree. This
 * module is the single reconciliation: every UI surface derives from the
 * stored state, and every UI write funnels back through it. Pure logic with
 * jsdom-compatible element access — directly unit-testable.
 *
 * @module utils/options/provider-state
 */

import type { Provider } from '../../utils/config/schema';

/**
 * The stored state that decides which provider will play.
 */
export interface ProviderStoredState {
  readonly provider: Provider | string;
  readonly localHostEnabled: boolean;
  readonly localHostUrl: string | null;
  readonly localHostVoice: string | null;
}

/** The minimal DOM surface the sync needs (the settings page's controls). */
export interface ProviderUI {
  readonly quickProvider: { value: string };
  readonly localHostEnabled: { checked: boolean };
  readonly localHostUrl: { value: string };
  readonly localHostVoice: { value: string };
  readonly localHostSection?: {
    readonly querySelector: (selector: string) => { removeAttribute(name: string): void } | null;
  };
}

/**
 * Derive the provider state from raw storage values. Defaults mirror
 * `settingsSchema`: provider elevenlabs, local host off.
 */
export function deriveProviderState(stored: Record<string, unknown>): ProviderStoredState {
  return {
    provider: (stored.provider as Provider | undefined) ?? 'elevenlabs',
    localHostEnabled: stored.localHostEnabled === true,
    localHostUrl: (stored.localHostUrl as string | null) ?? null,
    localHostVoice: (stored.localHostVoice as string | null) ?? null,
  };
}

/**
 * Push the derived state onto every UI surface. Call after any state change:
 * load, save, cross-tab sync. The dropdown can no longer disagree with the
 * stored provider, and the local-host section can no longer look configured
 * while the active provider is something else.
 */
export function syncProviderUI(ui: ProviderUI, state: ProviderStoredState): void {
  ui.quickProvider.value = state.provider;
  ui.localHostEnabled.checked = state.localHostEnabled;
  ui.localHostUrl.value = state.localHostUrl ?? '';
  ui.localHostVoice.value = state.localHostVoice ?? '';

  // The local-host section expands when the local provider is active, so the
  // reader sees the thing that will actually play.
  if (state.provider === 'local' && ui.localHostSection) {
    const content = ui.localHostSection.querySelector('#local-host-content');
    content?.removeAttribute('hidden');
  }
}

/**
 * The stored state the UI would produce right now (the save direction).
 * The inverse of the sync: a save derived from the same controls cannot
 * introduce a disagreement either.
 */
export function collectProviderStateFromUI(ui: ProviderUI): ProviderStoredState {
  return {
    provider: ui.quickProvider.value,
    localHostEnabled: ui.localHostEnabled.checked,
    localHostUrl: ui.localHostUrl.value.trim() || null,
    localHostVoice: ui.localHostVoice.value || null,
  };
}
