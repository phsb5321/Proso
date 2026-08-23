import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
globalThis.MutationObserver = TestResizeObserver as unknown as typeof MutationObserver;

// Feature 200: the footer attaches a CLOSED shadow root; open it in tests so
// dropdown state (option highlights, open class) is observable. Applied before
// any StickyFooter instance calls show().
const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit): ShadowRoot {
  return originalAttachShadow.call(this, { ...init, mode: 'open' });
} as typeof Element.prototype.attachShadow;

const storageGet = jest.fn(async () => ({}));
const storageSet = jest.fn(async () => undefined);
const sendMessage = jest.fn(async () => ({}));

jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    runtime: { sendMessage },
    storage: { local: { get: storageGet, set: storageSet } },
  },
}));

const { StickyFooter } = await import('../../../src/utils/content/sticky-footer');

type FooterInternals = {
  _handleAction(action: string, data?: { value?: number }): void;
  _formatPositionIndicator(): string;
  shadowRoot: ShadowRoot | null;
};

describe('StickyFooter runtime coherence', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    for (const key of [...document.body.attributes]) {
      if (key.name.startsWith('data-proso-')) document.body.removeAttribute(key.name);
    }
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('adopts the document after a previous content-script world was destroyed', async () => {
    const obsoleteRoot = document.createElement('div');
    obsoleteRoot.id = 'proso-sticky-footer';
    document.body.appendChild(obsoleteRoot);
    const currentWorld = new StickyFooter();

    await currentWorld.show();

    expect(document.querySelectorAll('#proso-sticky-footer')).toHaveLength(1);
    expect(document.getElementById('proso-sticky-footer')).not.toBe(obsoleteRoot);
    currentWorld.hide();
  });

  it('lets a fresh content-script world remove an obsolete document player', () => {
    document.body.style.paddingBottom = '80px';
    const obsoleteRoot = document.createElement('div');
    obsoleteRoot.id = 'proso-sticky-footer';
    document.body.appendChild(obsoleteRoot);

    new StickyFooter().hide();

    expect(document.querySelectorAll('#proso-sticky-footer')).toHaveLength(0);
    expect(document.body.style.paddingBottom).toBe('0px');
  });

  it('does not sweep live word and paragraph state during footer lifecycle', async () => {
    document.body.innerHTML =
      '<p class="proso-highlight" data-proso-index="0"><span class="proso-w">live word</span></p>';
    const footer = new StickyFooter();

    await footer.show();
    footer.hide();

    expect(document.querySelectorAll('.proso-w')).toHaveLength(1);
    expect(document.querySelector('.proso-highlight')).not.toBeNull();
    expect(document.querySelector('[data-proso-index]')).not.toBeNull();
  });

  it('recomputes minimize padding from one immutable author value', async () => {
    document.body.style.paddingBottom = '12px';
    const footer = new StickyFooter();
    await footer.show();
    expect(document.body.style.paddingBottom).toBe('92px');

    const internals = footer as unknown as FooterInternals;
    internals._handleAction('toggleMinimize');
    expect(document.body.style.paddingBottom).toBe('76px');
    internals._handleAction('toggleMinimize');
    expect(document.body.style.paddingBottom).toBe('92px');

    footer.hide();
    expect(document.body.style.paddingBottom).toBe('12px');
  });

  it('renders the first paragraph with the same one-based counter as the popup', () => {
    const footer = new StickyFooter();
    footer.updateState({ currentParagraph: 0, totalParagraphs: 56 });

    expect((footer as unknown as FooterInternals)._formatPositionIndicator()).toBe('1/56');
  });

  it('refreshes speed dropdown option highlights on updateState (Feature 200)', async () => {
    const footer = new StickyFooter();
    await footer.show();
    const internals = footer as unknown as FooterInternals;
    internals._handleAction('toggleSpeed'); // open the dropdown

    const activeBefore = internals.shadowRoot?.querySelector('.speed-option.active');
    expect(activeBefore?.getAttribute('aria-selected')).toBe('true');

    footer.updateState({ speed: 1.5 });

    const activeAfter = internals.shadowRoot?.querySelector('.speed-option.active');
    expect(activeAfter?.textContent).toBe('1.5x');
    expect(activeAfter?.getAttribute('aria-selected')).toBe('true');
    expect(activeBefore?.textContent).toBe('1x'); // the old option is de-selected
    footer.hide();
  });

  it('refreshes language dropdown option highlights on updateState (Feature 200)', async () => {
    const footer = new StickyFooter();
    await footer.show();
    const internals = footer as unknown as FooterInternals;

    footer.updateState({ languageCode: 'pt', isAutoDetected: false });
    const active = internals.shadowRoot?.querySelector('.language-option.active');
    expect((active as HTMLElement | null)?.dataset.lang).toBe('pt');
    expect(active?.getAttribute('aria-selected')).toBe('true');

    footer.updateState({ isAutoDetected: true });
    const autoActive = internals.shadowRoot?.querySelector('.language-option.active');
    expect((autoActive as HTMLElement | null)?.dataset.lang).toBe('auto');
    footer.hide();
  });

  it('updates speed without rebuilding the footer DOM (Feature 200)', async () => {
    const footer = new StickyFooter();
    await footer.show();
    const internals = footer as unknown as FooterInternals;
    const playButton = internals.shadowRoot?.querySelector('[data-action="playPause"]');

    internals._handleAction('speed', { value: 1.5 });

    // The same element instance survives — no shadow-root rebuild.
    expect(internals.shadowRoot?.querySelector('[data-action="playPause"]')).toBe(playButton);
    expect(internals.shadowRoot?.querySelector('.speed-btn')?.textContent).toBe('1.5x');
    footer.hide();
  });

  it('closes both dropdowns on Escape (Feature 200)', async () => {
    const footer = new StickyFooter();
    await footer.show();
    const internals = footer as unknown as FooterInternals;
    const shadow = internals.shadowRoot;
    const footerEl = shadow?.querySelector('.footer');

    // The two dropdowns are mutually exclusive by design (opening one closes
    // the other); Escape must close whichever is currently open.
    internals._handleAction('toggleSpeed');
    expect(shadow?.querySelector('.speed-dropdown')?.classList.contains('open')).toBe(true);
    expect(shadow?.querySelector('.language-dropdown')?.classList.contains('open')).toBe(false);

    footerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shadow?.querySelector('.speed-dropdown')?.classList.contains('open')).toBe(false);

    internals._handleAction('toggleLanguage');
    expect(shadow?.querySelector('.language-dropdown')?.classList.contains('open')).toBe(true);

    footerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(shadow?.querySelector('.speed-dropdown')?.classList.contains('open')).toBe(false);
    expect(shadow?.querySelector('.language-dropdown')?.classList.contains('open')).toBe(false);
    footer.hide();
  });

  it('closes open dropdowns on an outside click (Feature 200)', async () => {
    const footer = new StickyFooter();
    await footer.show();
    const internals = footer as unknown as FooterInternals;
    internals._handleAction('toggleSpeed');
    expect(internals.shadowRoot?.querySelector('.speed-dropdown')?.classList.contains('open')).toBe(
      true,
    );

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(internals.shadowRoot?.querySelector('.speed-dropdown')?.classList.contains('open')).toBe(
      false,
    );
    footer.hide();
  });
});
