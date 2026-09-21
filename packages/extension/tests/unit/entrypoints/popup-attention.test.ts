import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const html = readFileSync(new URL('../../../src/entrypoints/popup/index.html', import.meta.url), 'utf8');
let state: Record<string, unknown>;
let stored: Record<string, unknown>;
let broadcast: (message: unknown) => void;
let storageChanged: (changes: unknown, area: string) => void;
const sendMessage = jest.fn(async (message: { type: string }) =>
  message.type === 'playback.getState' ? { ...state } : {},
);
const getTab = jest.fn(async () => ({ id: 7, windowId: 2 }));
const updateTab = jest.fn(async () => ({ windowId: 2 }));
const updateWindow = jest.fn(async () => undefined);
const save = jest.fn(async (value: Record<string, unknown>) => { Object.assign(stored, value); });
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
async function openPopup() {
  jest.resetModules();
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  jest.unstable_mockModule('wxt/browser', () => ({ browser: {
    runtime: { getManifest: () => ({ version: 'test' }), sendMessage,
      onMessage: { addListener: (fn: typeof broadcast) => { broadcast = fn; } } },
    storage: { local: { get: async () => stored, set: save },
      onChanged: { addListener: (fn: typeof storageChanged) => { storageChanged = fn; } } },
    tabs: { query: async () => [{ id: 1, windowId: 1 }], get: getTab, update: updateTab,
      sendMessage: async () => ({ success: false }) },
    windows: { update: updateWindow },
  } }));
  await import('../../../src/entrypoints/popup/main');
  await settle();
}
beforeEach(() => {
  jest.clearAllMocks();
  state = { status: 'playing', audioLive: true, activeTabId: 7, visualAttachmentDetached: false,
    documentTitle: 'Original article', currentParagraph: 0, totalParagraphs: 5, progress: 0, speed: 1, provider: 'openai' };
  stored = { openaiApiKey: 'test', telemetryEnabled: false };
  getTab.mockResolvedValue({ id: 7, windowId: 2 });
});
describe('popup attention', () => {
  it.each([
    [1, false, 'Playing in this tab'],
    [7, false, 'Playing in another tab'],
    [1, true, 'Playing — reading view closed'],
  ])('orients tab %s, detached %s from live state', async (tabId, detached, label) => {
    Object.assign(state, { activeTabId: tabId, visualAttachmentDetached: detached });
    await openPopup();
    expect(button('status-text').textContent).toBe(label);
    expect(button('playing-document').textContent).toBe('Original article');
  });
  it('returns to the source tab and focuses its window', async () => {
    await openPopup();
    expect(button('open-playing-tab').hidden).toBe(false);
    button('open-playing-tab').click(); await settle();
    expect(updateTab).toHaveBeenCalledWith(7, { active: true });
    expect(updateWindow).toHaveBeenCalledWith(2, { focused: true });
  });
  it('hides return for a closed tab and handles a tab closing after lookup', async () => {
    getTab.mockRejectedValueOnce(new Error('No tab'));
    await openPopup();
    expect(button('open-playing-tab').hidden).toBe(true);
    broadcast({ type: 'playbackStateUpdate', state }); await settle();
    updateTab.mockRejectedValueOnce(new Error('No tab'));
    button('open-playing-tab').click(); await settle();
    expect(button('open-playing-tab').hidden).toBe(true);
  });
  it('never claims playing on resume acknowledgement or on silent playing status', async () => {
    Object.assign(state, { status: 'paused', audioLive: false });
    await openPopup();
    button('play-pause-btn').click(); await settle();
    expect(button('status-text').textContent).toBe('Paused');
    broadcast({ type: 'playbackStateUpdate', state: { ...state, status: 'playing' } });
    await settle();
    expect(button('status-text').textContent).not.toMatch(/^Playing/);
  });
  it('requires explicitly stopping a live session before starting this page', async () => {
    state.status = 'stopped';
    await openPopup();
    state.status = 'playing';
    button('play-pause-btn').click(); await settle();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'playback.start' }));
    expect(button('status-text').textContent).toContain('Stop the current reading');
  });
  it('does not start if Stop arrives while checking for an existing session', async () => {
    state.status = 'stopped';
    await openPopup();
    let finishCheck: (value: Record<string, unknown>) => void = () => {};
    sendMessage.mockImplementationOnce(() => new Promise((resolve) => { finishCheck = resolve; }));
    button('play-pause-btn').click();
    button('stop-btn').click();
    await settle();
    finishCheck({ ...state });
    await settle();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'playback.start' }));
    expect(button('play-pause-btn').disabled).toBe(false);
  });

  it('toggles the legacy preference once, displays state, and follows external changes', async () => {
    await openPopup();
    const toggle = button('background-playback-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.focus(); expect(document.activeElement).toBe(toggle);
    toggle.click(); await settle();
    expect(save).toHaveBeenCalledWith({ stopPlaybackOnTabChange: false });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toContain('On');
    storageChanged({ stopPlaybackOnTabChange: { newValue: true } }, 'local'); await settle();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });
  it('keeps the saved state and reports a preference write failure', async () => {
    await openPopup(); save.mockRejectedValueOnce(new Error('disk'));
    button('background-playback-toggle').click(); await settle();
    expect(button('background-playback-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(button('background-playback-feedback').textContent).toContain('Could not save');
  });
});
