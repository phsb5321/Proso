// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * Unit tests for keyboard-shortcut + context-menu command mapping.
 *
 * Covers:
 *   - resolveCommandMessage: command id -> playback message, incl. Alt+P toggle
 *   - handleShortcutCommand: dispatch wiring + unknown-command guard
 *   - handleReadSelectionClick: "Read with Proso" -> playback.start selection
 *
 * The playback service is represented by a `getStatus` reader (mirroring the
 * background seam), so no composition import is needed here.
 *
 * @module tests/unit/background/shortcuts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  READ_SELECTION_MENU_ID,
  SHORTCUT_COMMANDS,
  handleReadSelectionClick,
  handleShortcutCommand,
  resolveCommandMessage,
} from '../../../src/background/shortcuts';

describe('background/shortcuts', () => {
  // -----------------------------------------------------------------------
  // resolveCommandMessage
  // -----------------------------------------------------------------------
  describe('resolveCommandMessage', () => {
    it('maps stop/next/previous to their playback messages', () => {
      const getStatus = () => 'playing';
      expect(resolveCommandMessage(SHORTCUT_COMMANDS.STOP, getStatus)).toBe('playback.stop');
      expect(resolveCommandMessage(SHORTCUT_COMMANDS.NEXT, getStatus)).toBe('playback.next');
      expect(resolveCommandMessage(SHORTCUT_COMMANDS.PREVIOUS, getStatus)).toBe(
        'playback.previous',
      );
    });

    it('toggle pauses when playing', () => {
      expect(resolveCommandMessage(SHORTCUT_COMMANDS.TOGGLE, () => 'playing')).toBe(
        'playback.pause',
      );
    });

    it('toggle resumes when paused', () => {
      expect(resolveCommandMessage(SHORTCUT_COMMANDS.TOGGLE, () => 'paused')).toBe(
        'playback.resume',
      );
    });

    it('toggle starts fresh playback when idle/stopped/unavailable', () => {
      for (const status of ['idle', 'stopped', 'loading', 'error', null, undefined]) {
        expect(resolveCommandMessage(SHORTCUT_COMMANDS.TOGGLE, () => status)).toBe(
          'playback.start',
        );
      }
    });

    it('returns null for an unknown command id', () => {
      expect(resolveCommandMessage('not-a-command', () => 'playing')).toBeNull();
    });

    it('only reads playback status for the toggle command', () => {
      const getStatus = jest.fn<() => string | null>(() => 'playing');

      resolveCommandMessage(SHORTCUT_COMMANDS.STOP, getStatus);
      resolveCommandMessage(SHORTCUT_COMMANDS.NEXT, getStatus);
      resolveCommandMessage(SHORTCUT_COMMANDS.PREVIOUS, getStatus);
      expect(getStatus).not.toHaveBeenCalled();

      resolveCommandMessage(SHORTCUT_COMMANDS.TOGGLE, getStatus);
      expect(getStatus).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // handleShortcutCommand
  // -----------------------------------------------------------------------
  describe('handleShortcutCommand', () => {
    let dispatch: jest.Mock<(type: string, data: Record<string, unknown>) => Promise<unknown>>;

    beforeEach(() => {
      dispatch = jest.fn<(type: string, data: Record<string, unknown>) => Promise<unknown>>(
        async () => ({ success: true }),
      );
    });

    it('dispatches the resolved message with empty data', async () => {
      const result = await handleShortcutCommand(SHORTCUT_COMMANDS.STOP, {
        dispatch,
        getStatus: () => 'playing',
      });

      expect(dispatch).toHaveBeenCalledWith('playback.stop', {});
      expect(result).toEqual({ success: true });
    });

    it('dispatches playback.pause for the toggle when playing', async () => {
      await handleShortcutCommand(SHORTCUT_COMMANDS.TOGGLE, {
        dispatch,
        getStatus: () => 'playing',
      });
      expect(dispatch).toHaveBeenCalledWith('playback.pause', {});
    });

    it('dispatches playback.start for the toggle when stopped', async () => {
      await handleShortcutCommand(SHORTCUT_COMMANDS.TOGGLE, {
        dispatch,
        getStatus: () => 'stopped',
      });
      expect(dispatch).toHaveBeenCalledWith('playback.start', {});
    });

    it('does not dispatch and returns null for an unknown command', async () => {
      const result = await handleShortcutCommand('bogus', {
        dispatch,
        getStatus: () => 'playing',
      });

      expect(dispatch).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // handleReadSelectionClick
  // -----------------------------------------------------------------------
  describe('handleReadSelectionClick', () => {
    let dispatch: jest.Mock<(type: string, data: Record<string, unknown>) => Promise<unknown>>;

    beforeEach(() => {
      dispatch = jest.fn<(type: string, data: Record<string, unknown>) => Promise<unknown>>(
        async () => ({ success: true }),
      );
    });

    it('dispatches playback.start in selection mode with tab id + url', async () => {
      await handleReadSelectionClick(
        { menuItemId: READ_SELECTION_MENU_ID, selectionText: 'hello world' },
        { id: 7, url: 'https://example.com/page' },
        { dispatch },
      );

      expect(dispatch).toHaveBeenCalledWith('playback.start', {
        mode: 'selection',
        tabId: 7,
        pageUrl: 'https://example.com/page',
      });
    });

    it('omits tabId/pageUrl when the tab is undefined', async () => {
      await handleReadSelectionClick(
        { menuItemId: READ_SELECTION_MENU_ID },
        undefined,
        { dispatch },
      );

      expect(dispatch).toHaveBeenCalledWith('playback.start', { mode: 'selection' });
    });

    it('ignores clicks for other menu items', async () => {
      const result = await handleReadSelectionClick(
        { menuItemId: 'some-other-menu' },
        { id: 1 },
        { dispatch },
      );

      expect(dispatch).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});
