import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HighlightSyncAdapter } from '../../../src/adapters/messaging/highlight-sync.adapter';
import type { FooterState } from '../../../src/ports/highlight-sync.port';

const badge = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const title = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const broadcast = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const send = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const state: FooterState = { status: 'playing', audioLive: true, documentTitle: 'Original article',
  visualAttachmentDetached: false, currentIndex: 0, totalParagraphs: 2, progress: 0,
  currentTime: '0:00', totalTime: '0:30', speed: 1, voice: null };
const settle = async () => { await new Promise((r) => setTimeout(r, 0)); };
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(browser, { browserAction: { setBadgeText: badge, setTitle: title },
    runtime: { ...browser.runtime, sendMessage: broadcast },
    tabs: { ...browser.tabs, sendMessage: send } });
});
describe('popup broadcast and toolbar orientation', () => {
  it('publishes and badges even when the content script is gone', async () => {
    send.mockRejectedValueOnce(new Error('No tab'));
    await new HighlightSyncAdapter().updateFooterState(7, state); await settle();
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({
      activeTabId: 7, documentTitle: 'Original article', audioLive: true,
    }) }));
    expect(badge).toHaveBeenCalledWith({ text: '▶' });
    expect(title).toHaveBeenCalledWith({ title: 'Proso — Playing: Original article' });
  });
  it('publishes detached state without contacting the vanished reading view', async () => {
    await new HighlightSyncAdapter().updateFooterState(7, { ...state, visualAttachmentDetached: true });
    await settle();
    expect(send).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ visualAttachmentDetached: true }) }));
  });
  it.each(['paused', 'stopped', 'error', 'loading'] as const)('clears the badge for %s', async (status) => {
    const adapter = new HighlightSyncAdapter();
    await adapter.updateFooterState(7, state);
    await adapter.updateFooterState(7, { ...state, status }); await settle();
    expect(badge).toHaveBeenLastCalledWith({ text: '' });
    expect(title).toHaveBeenLastCalledWith({ title: 'Proso' });
  });
  it('does not badge a started request or repeat toolbar writes for paragraph progress', async () => {
    const adapter = new HighlightSyncAdapter();
    await adapter.updateFooterState(7, { ...state, audioLive: false }); await settle();
    expect(badge).toHaveBeenLastCalledWith({ text: '' });
    await adapter.updateFooterState(7, state);
    await adapter.updateFooterState(7, { ...state, currentIndex: 1, progress: 0.5 }); await settle();
    expect(badge).toHaveBeenCalledTimes(2);
    expect(title).toHaveBeenCalledTimes(2);
  });
});
