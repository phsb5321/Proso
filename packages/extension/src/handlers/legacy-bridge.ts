// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Legacy Action Name Bridge
 *
 * Older parts of the content script send `{ action: 'someName' }` where the
 * rest of the extension sends `{ type: 'domain.name' }`. The background maps
 * the first onto the second here, in one place, so the handler registry only
 * ever has to know the canonical names.
 *
 * Every value in this map must be a name a handler is actually registered
 * under — a row pointing at nothing turns its action into a silent no-op,
 * which is how `jumpToParagraph` and `jumpToWord` went years without doing
 * anything. `tests/unit/handlers/message-wiring.test.ts` holds that line.
 *
 * @module handlers/legacy-bridge
 */

export const LEGACY_BRIDGE: Record<string, string> = {
  // Content script legacy actions
  languageDetected: 'language.detect',
  controllerAction: 'footer.action',
  requestResync: 'playback.resync',
  // SCREAMING_SNAKE footer messages
  FOOTER_SHOW: 'footer.show',
  FOOTER_HIDE: 'footer.hide',
  FOOTER_STATE_UPDATE: 'footer.stateUpdate',
  FOOTER_ACTION: 'footer.action',
  // 'TOGGLE_FOOTER_SETTINGS' used to be bridged here to 'footer.toggleSettings',
  // which no handler was registered under. It never belonged in this map either:
  // it is a name the background sends out to a tab, not one a tab sends in.
};
