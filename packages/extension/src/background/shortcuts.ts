// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Keyboard Shortcut + Context Menu Wiring
 *
 * Maps `browser.commands` ids and the "Read with Proso" context-menu click to
 * the hexagonal playback handlers via the background `dispatchMessage` seam.
 *
 * The mapping logic is kept here (rather than inline in background.ts) so it can
 * be unit-tested with a mocked dispatcher + playback state, mirroring the
 * footer/playback handler tests.
 *
 * @module background/shortcuts
 */

import { createLogger } from '../utils/logging/logger';

const log = createLogger('background');

/**
 * Stable command ids declared in the `commands` manifest block (wxt.config.ts).
 */
export const SHORTCUT_COMMANDS = {
  TOGGLE: 'playback-toggle',
  STOP: 'playback-stop',
  NEXT: 'playback-next',
  PREVIOUS: 'playback-previous',
} as const;

export type ShortcutCommandId = (typeof SHORTCUT_COMMANDS)[keyof typeof SHORTCUT_COMMANDS];

/**
 * The context-menu item id for "Read with Proso".
 */
export const READ_SELECTION_MENU_ID = 'read-with-proso';

/**
 * Dispatch function seam — the background `dispatchMessage(type, data)`.
 * Returns the handler response, or null when no handler matched.
 */
export type DispatchMessageFn = (type: string, data: Record<string, unknown>) => Promise<unknown>;

/**
 * Minimal playback-status reader. Returns the current status, or null when the
 * playback service is not available (e.g. container init failed). `undefined`
 * is treated the same as null.
 */
export type PlaybackStatusReader = () => string | null | undefined;

/**
 * Resolve a command id to the playback message it should dispatch.
 *
 * The toggle (`Alt+P`) is state-dependent: while reading it pauses, when paused
 * it resumes, otherwise it starts fresh playback. Returns `null` for unknown
 * command ids so callers can ignore them.
 *
 * `loading` counts as reading: every paragraph transition passes through it
 * while the next clip is fetched. Treating it as "not reading" made a toggle
 * pressed between paragraphs restart the article from the top.
 *
 * @param commandId - The `browser.commands` command id
 * @param getStatus - Reader for the current playback status (toggle only)
 * @returns The message type to dispatch, or null if the command is unknown
 */
export function resolveCommandMessage(
  commandId: string,
  getStatus: PlaybackStatusReader,
): string | null {
  switch (commandId) {
    case SHORTCUT_COMMANDS.TOGGLE: {
      const status = getStatus();
      if (status === 'playing' || status === 'loading') return 'playback.pause';
      if (status === 'paused') return 'playback.resume';
      return 'playback.start';
    }
    case SHORTCUT_COMMANDS.STOP:
      return 'playback.stop';
    case SHORTCUT_COMMANDS.NEXT:
      return 'playback.next';
    case SHORTCUT_COMMANDS.PREVIOUS:
      return 'playback.previous';
    default:
      return null;
  }
}

/**
 * Handle a keyboard command by mapping it to a playback message and dispatching.
 *
 * @param commandId - The fired command id
 * @param deps - Dispatcher + playback status reader
 * @returns The dispatch response, or null when the command was ignored
 */
export async function handleShortcutCommand(
  commandId: string,
  deps: { dispatch: DispatchMessageFn; getStatus: PlaybackStatusReader },
): Promise<unknown> {
  const message = resolveCommandMessage(commandId, deps.getStatus);

  if (message === null) {
    log.warn('[Shortcuts] Ignoring unknown command', { commandId });
    return null;
  }

  log.debug('[Shortcuts] Command dispatched', { commandId, message });
  return deps.dispatch(message, {});
}

/**
 * Handle a "Read with Proso" context-menu click by reading the active tab's
 * current text selection through the existing playback-start path (selection
 * extraction mode). Returns null when the click is for another menu item.
 *
 * @param info - The clicked menu item info (id + optional selectionText)
 * @param tab - The tab the click originated from (may be undefined)
 * @param deps - Dispatcher seam
 * @returns The dispatch response, or null when the click was ignored
 */
export async function handleReadSelectionClick(
  info: { menuItemId: string | number; selectionText?: string },
  tab: { id?: number; url?: string } | undefined,
  deps: { dispatch: DispatchMessageFn },
): Promise<unknown> {
  if (info.menuItemId !== READ_SELECTION_MENU_ID) {
    return null;
  }

  // Reuse the existing playback-start flow: it asks the content script to
  // extract via `mode: 'selection'` (window.getSelection()), then plays it.
  const data: Record<string, unknown> = { mode: 'selection' };
  if (typeof tab?.id === 'number') {
    data.tabId = tab.id;
  }
  if (typeof tab?.url === 'string') {
    data.pageUrl = tab.url;
  }

  log.debug('[Shortcuts] Read with Proso clicked', { tabId: tab?.id });
  return deps.dispatch('playback.start', data);
}
