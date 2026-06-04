// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Unit Tests - Accessible Confirmation Dialog
 *
 * Task: T081 (spec 056 — production readiness, User Story 6, FR-029).
 *
 * Validates the accessibility contract of {@link confirmDialog}: ARIA modal
 * semantics, focus management (move-in, trap, restore), and the Escape /
 * backdrop / button resolution paths.
 *
 * @module tests/unit/ui/confirm-dialog.test
 */

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { confirmDialog } from '../../../src/utils/ui/confirm-dialog';

/** Dispatch a keydown on the document (capture-phase listener handles it). */
function pressKey(key: string, opts: { shiftKey?: boolean } = {}): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }),
  );
}

function getDialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}

function dialogButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'));
}

describe('confirmDialog (T081)', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    // Remove any leftover overlay between tests.
    document.querySelector('.proso-confirm-overlay')?.remove();
    document.body.replaceChildren();
  });

  it('renders an ARIA modal dialog labelled by its title', async () => {
    confirmDialog({ title: 'Delete item', message: 'This cannot be undone.' });
    // Allow the microtask that builds the DOM to flush.
    await Promise.resolve();

    const dialog = getDialog();
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    const labelledBy = dialog?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const title = labelledBy ? document.getElementById(labelledBy) : null;
    expect(title?.textContent).toBe('Delete item');

    const describedBy = dialog?.getAttribute('aria-describedby');
    const message = describedBy ? document.getElementById(describedBy) : null;
    expect(message?.textContent).toBe('This cannot be undone.');
  });

  it('moves focus into the dialog on open', async () => {
    confirmDialog({ title: 'T', message: 'M' });
    await Promise.resolve();

    const dialog = getDialog();
    expect(dialog?.contains(document.activeElement)).toBe(true);
  });

  it('resolves true when confirm is activated', async () => {
    const result = confirmDialog({ title: 'T', message: 'M', confirmLabel: 'Yes' });
    await Promise.resolve();

    dialogButtons().find((b) => b.textContent === 'Yes')?.click();

    await expect(result).resolves.toBe(true);
    // Dialog is torn down after resolution.
    expect(getDialog()).toBeNull();
  });

  it('resolves false when cancel is activated', async () => {
    const result = confirmDialog({ title: 'T', message: 'M', cancelLabel: 'No' });
    await Promise.resolve();

    dialogButtons().find((b) => b.textContent === 'No')?.click();

    await expect(result).resolves.toBe(false);
    expect(getDialog()).toBeNull();
  });

  it('resolves false on Escape', async () => {
    const result = confirmDialog({ title: 'T', message: 'M' });
    await Promise.resolve();

    pressKey('Escape');
    await expect(result).resolves.toBe(false);
    expect(getDialog()).toBeNull();
  });

  it('resolves false on backdrop click', async () => {
    const result = confirmDialog({ title: 'T', message: 'M' });
    await Promise.resolve();

    const overlay = document.querySelector<HTMLElement>('.proso-confirm-overlay');
    // mousedown directly on the overlay (not the dialog) dismisses.
    overlay?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    await expect(result).resolves.toBe(false);
    expect(getDialog()).toBeNull();
  });

  it('traps focus: Tab from the last control wraps to the first', async () => {
    confirmDialog({ title: 'T', message: 'M', cancelLabel: 'Cancel', confirmLabel: 'OK' });
    await Promise.resolve();

    const buttons = dialogButtons();
    const last = buttons[buttons.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    pressKey('Tab');
    expect(document.activeElement).toBe(buttons[0]);

    // Shift+Tab from the first wraps back to the last.
    buttons[0].focus();
    pressKey('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('restores focus to the trigger element on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const result = confirmDialog({ title: 'T', message: 'M' });
    await Promise.resolve();
    expect(document.activeElement).not.toBe(trigger);

    pressKey('Escape');
    await result;
    expect(document.activeElement).toBe(trigger);
  });

  it('marks the confirm button destructive when requested', async () => {
    confirmDialog({ title: 'T', message: 'M', confirmLabel: 'Delete', destructive: true });
    await Promise.resolve();

    const destructive = document.querySelector('.proso-confirm-dialog__btn--destructive');
    expect(destructive).not.toBeNull();
    expect(destructive?.textContent).toBe('Delete');
  });
});
