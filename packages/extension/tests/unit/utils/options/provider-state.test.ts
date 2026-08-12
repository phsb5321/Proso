/**
 * Derived provider-state tests (PROSO-130d falsifier E).
 *
 * The provider dropdown, the local-host section and the stored `provider`
 * are ONE derived state: the sync pushes storage onto the UI, the collect
 * reads the UI back into storage. Neither direction can disagree.
 *
 * @module tests/unit/utils/options/provider-state
 */

import { describe, expect, it } from '@jest/globals';
import {
  collectProviderStateFromUI,
  deriveProviderState,
  syncProviderUI,
  type ProviderUI,
} from '../../../../src/utils/options/provider-state';

function makeUI(overrides: Partial<ProviderUI> = {}): ProviderUI {
  return {
    quickProvider: { value: 'elevenlabs' },
    localHostEnabled: { checked: false },
    localHostUrl: { value: '' },
    localHostVoice: { value: '' },
    ...overrides,
  };
}

describe('deriveProviderState', () => {
  it('defaults: elevenlabs provider, local host off (PROSO-130)', () => {
    const state = deriveProviderState({});
    expect(state.provider).toBe('elevenlabs');
    expect(state.localHostEnabled).toBe(false);
    expect(state.localHostUrl).toBeNull();
  });

  it('reads the stored provider and local-host fields', () => {
    const state = deriveProviderState({
      provider: 'local',
      localHostEnabled: true,
      localHostUrl: 'https://host.example',
    });
    expect(state.provider).toBe('local');
    expect(state.localHostEnabled).toBe(true);
    expect(state.localHostUrl).toBe('https://host.example');
  });
});

describe('syncProviderUI (falsifier E)', () => {
  it("stored provider 'local' lands in the dropdown, never ElevenLabs", () => {
    const ui = makeUI();
    syncProviderUI(ui, {
      provider: 'local',
      localHostEnabled: true,
      localHostUrl: 'https://host.example',
      localHostVoice: null,
    });
    expect(ui.quickProvider.value).toBe('local');
    expect(ui.localHostEnabled.checked).toBe(true);
    expect(ui.localHostUrl.value).toBe('https://host.example');
  });

  it('round-trips: collect(UI) re-derives the same state the sync pushed', () => {
    const ui = makeUI();
    const stored = {
      provider: 'local',
      localHostEnabled: true,
      localHostUrl: 'https://host.example',
      localHostVoice: 'pt_BR-faber-medium',
    };
    syncProviderUI(ui, deriveProviderState(stored));
    expect(collectProviderStateFromUI(ui)).toEqual({
      provider: 'local',
      localHostEnabled: true,
      localHostUrl: 'https://host.example',
      localHostVoice: 'pt_BR-faber-medium',
    });
  });

  it('a non-local provider clears the local-host enablement from the UI', () => {
    const ui = makeUI({ localHostEnabled: { checked: true } });
    syncProviderUI(ui, deriveProviderState({ provider: 'groq' }));
    expect(ui.quickProvider.value).toBe('groq');
    expect(ui.localHostEnabled.checked).toBe(false);
  });
});
