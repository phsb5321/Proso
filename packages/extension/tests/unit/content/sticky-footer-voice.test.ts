/**
 * The reader's voice control lives in the footer, because a reader who
 * dislikes the narrator is in the middle of an article, not in the settings
 * page. These tests pin what the control has to do: offer the provider's
 * voices, persist the choice, and show which one is speaking.
 *
 * @module tests/unit/content/sticky-footer-voice
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { StickyFooter, sendMessage, showFooter } from '../../helpers/footer-test-environment';
import type { FooterInternals } from '../../helpers/footer-test-environment';

/** Open the dropdown and let the lazy voice request settle. */
async function openVoiceDropdown(footer: InstanceType<typeof StickyFooter>): Promise<ShadowRoot> {
  const internals = footer as unknown as FooterInternals;
  internals._handleAction('toggleVoice');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const root = internals.shadowRoot;
  if (!root) throw new Error('footer has no shadow root');
  return root;
}

const optionLabels = (root: ShadowRoot): string[] =>
  Array.from(root.querySelectorAll('.voice-option')).map((el) => el.textContent ?? '');

describe('StickyFooter voice control', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    jest.clearAllMocks();
    sendMessage.mockReset().mockImplementation(async () => ({
      voices: [
        { id: 'voice-river', name: 'River' },
        { id: 'voice-atlas', name: 'Atlas' },
      ],
    }));
  });

  it('offers the provider voices plus the provider default', async () => {
    const footer = new StickyFooter();
    await footer.show();

    const root = await openVoiceDropdown(footer);

    expect(optionLabels(root)).toEqual(['Default', 'River', 'Atlas']);
    expect(root.querySelector('.voice-dropdown')?.classList.contains('open')).toBe(true);
    footer.hide();
  });

  it('asks for voices only when the reader opens the control', async () => {
    const footer = new StickyFooter();
    await footer.show();

    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'audio.getVoices' }),
    );

    await openVoiceDropdown(footer);

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio.getVoices' }));
    footer.hide();
  });

  it('persists the chosen voice and shows it on the button', async () => {
    const footer = new StickyFooter();
    await footer.show();
    const root = await openVoiceDropdown(footer);

    const atlas = Array.from(root.querySelectorAll<HTMLElement>('.voice-option')).find(
      (el) => el.textContent === 'Atlas',
    );
    atlas?.click();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'audio.setVoice', voiceId: 'voice-atlas' });
    expect(root.querySelector('.voice-name')?.textContent).toBe('Atlas');
    expect(root.querySelector('.voice-dropdown')?.classList.contains('open')).toBe(false);
    footer.hide();
  });

  it('lets the reader go back to the provider default', async () => {
    const footer = new StickyFooter();
    await footer.show();
    const root = await openVoiceDropdown(footer);

    Array.from(root.querySelectorAll<HTMLElement>('.voice-option'))
      .find((el) => el.textContent === 'River')
      ?.click();
    (footer as unknown as FooterInternals)._handleAction('toggleVoice');
    Array.from(root.querySelectorAll<HTMLElement>('.voice-option'))
      .find((el) => el.textContent === 'Default')
      ?.click();

    expect(sendMessage).toHaveBeenCalledWith({ type: 'audio.setVoice', voiceId: null });
    expect(root.querySelector('.voice-name')?.textContent).toBe('Default');
    footer.hide();
  });

  it('names the voice the background reports, not its provider id', async () => {
    const { footer } = await showFooter();

    // The background knows only the id — the footer resolves the name once it
    // has the list, so the button never shows a provider identifier.
    footer.updateState({ voiceId: 'voice-river' });
    const root = await openVoiceDropdown(footer);

    expect(root.querySelector('.voice-name')?.textContent).toBe('River');
    expect(root.querySelector('.voice-option.active')?.textContent).toBe('River');
    footer.hide();
  });

  it('refreshes the displayed name after an external voice change', async () => {
    const { footer, root } = await showFooter();
    await openVoiceDropdown(footer);
    root.querySelector<HTMLElement>('[data-voice-id="voice-river"]')?.click();

    footer.updateState({ voiceId: 'voice-atlas' });
    expect(root.querySelector('.voice-name')?.textContent).toBe('Atlas');
    footer.updateState({ voiceId: null });
    expect(root.querySelector('.voice-name')?.textContent).toBe('Default');
    footer.hide();
  });

  it('keeps the focused voice option across playback updates', async () => {
    const { footer, root } = await showFooter();
    await openVoiceDropdown(footer);
    const option = root.querySelector<HTMLElement>('[data-voice-id="voice-atlas"]');
    option?.focus();
    footer.updateState({ voiceId: null, progress: 25 });
    expect(root.activeElement).toBe(option);
    expect(option?.isConnected).toBe(true);
    footer.hide();
  });

  it('closes the voice dropdown with Escape', async () => {
    const { footer, root } = await showFooter();
    await openVoiceDropdown(footer);
    root
      .querySelector('.footer')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector('.voice-dropdown')?.classList.contains('open')).toBe(false);
    footer.hide();
  });

  it('does not steal native option activation for the playback shortcut', async () => {
    const { footer, root } = await showFooter();
    await openVoiceDropdown(footer);
    const option = root.querySelector<HTMLElement>('[data-voice-id="voice-atlas"]');
    if (!option) throw new Error('voice option missing');
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      option.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'footer.action' }),
    );
    footer.hide();
  });

  it('refreshes the catalog on reopen without leaving old provider choices clickable', async () => {
    const { footer, root } = await showFooter();
    await openVoiceDropdown(footer);
    root.querySelector<HTMLElement>('[data-voice-id="voice-river"]')?.click();
    let finish!: (value: unknown) => void;
    sendMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    await openVoiceDropdown(footer);
    expect(optionLabels(root)).toEqual(['Default']);
    expect(root.querySelector('.voice-status')?.textContent).toBe('Loading voices…');
    expect(root.querySelector('.voice-name')?.textContent).not.toBe('River');
    finish({ voices: [{ id: 'voice-sage', name: 'Sage' }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(optionLabels(root)).toEqual(['Default', 'Sage']);
    root.querySelector<HTMLElement>('[data-voice-id="voice-sage"]')?.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'audio.setVoice', voiceId: 'voice-sage' });
    footer.hide();
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores an older catalog %s after reopening or recreating the footer',
    async (outcome) => {
      const { footer, root } = await showFooter();
      let resolveOld!: (value: unknown) => void;
      let rejectOld!: (error: Error) => void;
      sendMessage.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveOld = resolve;
            rejectOld = reject;
          }),
      );
      await openVoiceDropdown(footer);
      // A provider can change while a previous catalog request is still pending.
      if (outcome === 'resolve') {
        (footer as unknown as FooterInternals)._handleAction('toggleVoice');
      } else {
        footer.hide();
        await footer.show();
      }
      sendMessage.mockResolvedValueOnce({ voices: [{ id: 'voice-sage', name: 'Sage' }] });
      const currentRoot = await openVoiceDropdown(footer);
      expect(optionLabels(currentRoot)).toEqual(['Default', 'Sage']);
      const option = currentRoot.querySelector<HTMLElement>('[data-voice-id="voice-sage"]');
      option?.focus();
      if (outcome === 'resolve') resolveOld({ voices: [{ id: 'voice-old', name: 'Old' }] });
      else rejectOld(new Error('old provider unavailable'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(optionLabels(currentRoot)).toEqual(['Default', 'Sage']);
      expect(currentRoot.activeElement).toBe(option);
      expect(currentRoot.querySelector('.voice-status')).toBeNull();
      expect(outcome === 'resolve' ? currentRoot === root : currentRoot !== root).toBe(true);
      footer.hide();
    },
  );

  it('discards a hidden footer catalog before a replacement menu is opened', async () => {
    const { footer } = await showFooter();
    footer.updateState({ voiceId: 'voice-old' });
    let finish!: (value: unknown) => void;
    sendMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await openVoiceDropdown(footer);
    footer.hide();
    finish({ voices: [{ id: 'voice-old', name: 'Old provider name' }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await footer.show();
    const root = (footer as unknown as FooterInternals).shadowRoot;
    expect(root?.querySelector('.voice-name')?.textContent).not.toBe('Old provider name');
    expect(root?.querySelector('[data-voice-id="voice-old"]')).toBeNull();
    footer.hide();
  });

  it('says so when the provider offers no voices', async () => {
    sendMessage.mockResolvedValueOnce({ voices: [] });
    const footer = new StickyFooter();
    await footer.show();

    const root = await openVoiceDropdown(footer);

    expect(root.querySelector('.voice-status')?.textContent).toBe('No voices available');
    expect(optionLabels(root)).toEqual(['Default']);
    footer.hide();
  });
});
