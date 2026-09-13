import { jest } from '@jest/globals';

class TestObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestObserver as unknown as typeof ResizeObserver;
globalThis.MutationObserver = TestObserver as unknown as typeof MutationObserver;

// Production keeps the root closed. Only tests expose its rendered controls.
const attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
  return attachShadow.call(this, { ...init, mode: 'open' });
};

export const sendMessage = jest.fn<(message: unknown) => Promise<unknown>>(async () => ({}));
jest.unstable_mockModule('wxt/browser', () => ({
  browser: {
    runtime: { sendMessage },
    storage: {
      local: { get: jest.fn(async () => ({})), set: jest.fn(async () => undefined) },
    },
  },
}));

export const { StickyFooter } = await import('../../src/utils/content/sticky-footer');

export type FooterInternals = {
  _handleAction(action: string, data?: { value?: number }): void;
  _formatPositionIndicator(): string;
  shadowRoot: ShadowRoot | null;
};

export async function showFooter() {
  const footer = new StickyFooter();
  await footer.show();
  const root = (footer as unknown as FooterInternals).shadowRoot;
  if (!root) throw new Error('footer has no shadow root');
  return { footer, root };
}
