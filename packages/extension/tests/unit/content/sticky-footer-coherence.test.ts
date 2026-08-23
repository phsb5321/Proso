import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
globalThis.MutationObserver = TestResizeObserver as unknown as typeof MutationObserver;

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
  _handleAction(action: string): void;
  _formatPositionIndicator(): string;
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
});
