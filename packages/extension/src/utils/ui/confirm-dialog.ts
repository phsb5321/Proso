// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Accessible Confirmation Dialog
 *
 * Reusable, accessible replacement for the native `window.confirm()`.
 * Implements the WAI-ARIA modal dialog pattern:
 * - `role="dialog"` + `aria-modal="true"`, labelled by its title
 * - focus moves into the dialog on open and is trapped (Tab cycles within)
 * - Escape key and backdrop click resolve `false`
 * - focus returns to the previously-focused element on close
 *
 * Styled with the project design tokens (`var(--color-*)`); no raw colors.
 *
 * Task: T081 (spec 056 — production readiness / accessibility, FR-029)
 *
 * @module utils/ui/confirm-dialog
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Options for {@link confirmDialog}.
 */
export interface ConfirmDialogOptions {
  /** Dialog title (announced as the accessible name). */
  title: string;
  /** Body message describing the consequence of the action. */
  message: string;
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /**
   * When true, styles the confirm button as a destructive action.
   * Defaults to false.
   */
  destructive?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STYLE_ELEMENT_ID = 'proso-confirm-dialog-styles';
const OVERLAY_CLASS = 'proso-confirm-overlay';
const DIALOG_CLASS = 'proso-confirm-dialog';

/**
 * Focusable selector used to find the first/last tabbable element for the
 * focus trap. Excludes elements that are disabled or removed from tab order.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// ============================================================================
// Styles
// ============================================================================

/**
 * Inject the dialog stylesheet once per document. Uses design tokens only.
 */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = `
.${OVERLAY_CLASS} {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg, 16px);
  background: var(--color-overlay-bg, rgba(0, 0, 0, 0.6));
  z-index: var(--z-overlay, 100);
}

.${DIALOG_CLASS} {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg, 16px);
  width: 100%;
  max-width: 360px;
  padding: var(--spacing-2xl, 24px);
  background: var(--color-bg-primary, #1a1a2e);
  border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.4));
  color: var(--color-text-primary, #ffffff);
}

.${DIALOG_CLASS}__title {
  margin: 0;
  font-size: var(--font-size-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #ffffff);
}

.${DIALOG_CLASS}__message {
  margin: 0;
  font-size: var(--font-size-md, 14px);
  line-height: var(--line-height-normal, 1.5);
  color: var(--color-text-secondary, #b8c5d6);
}

.${DIALOG_CLASS}__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm, 8px);
}

.${DIALOG_CLASS}__btn {
  min-height: var(--min-touch-target, 44px);
  padding: var(--spacing-sm, 8px) var(--spacing-lg, 16px);
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 4px);
  font-family: inherit;
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: var(--transition-colors, none);
}

.${DIALOG_CLASS}__btn--cancel {
  background: var(--color-button-bg, rgba(255, 255, 255, 0.05));
  color: var(--color-text-secondary, #b8c5d6);
  border-color: var(--color-border, rgba(255, 255, 255, 0.1));
}

.${DIALOG_CLASS}__btn--cancel:hover {
  background: var(--color-button-bg-hover, rgba(255, 255, 255, 0.1));
  color: var(--color-text-primary, #ffffff);
}

.${DIALOG_CLASS}__btn--confirm {
  background: var(--color-accent-primary, #0d9488);
  color: var(--color-text-primary, #ffffff);
}

.${DIALOG_CLASS}__btn--confirm:hover {
  filter: brightness(1.1);
}

.${DIALOG_CLASS}__btn--destructive {
  background: var(--color-error, #ef4444);
  color: #ffffff;
}

.${DIALOG_CLASS}__btn:focus-visible {
  outline: 2px solid var(--color-accent-primary, #0d9488);
  outline-offset: 2px;
}
`;

  document.head.appendChild(style);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Show an accessible confirmation dialog and resolve to the user's choice.
 *
 * Resolves `true` when the confirm button is activated, `false` when the
 * dialog is cancelled (cancel button, Escape, or backdrop click).
 *
 * @param options - Dialog content and labels.
 * @returns Promise resolving to the user's decision.
 */
export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
  } = options;

  ensureStyles();

  return new Promise<boolean>((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Unique id so the dialog can be labelled by its title.
    const titleId = `proso-confirm-title-${Math.random().toString(36).slice(2)}`;
    const messageId = `proso-confirm-message-${Math.random().toString(36).slice(2)}`;

    // Overlay (backdrop)
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;

    // Dialog
    const dialog = document.createElement('div');
    dialog.className = DIALOG_CLASS;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.setAttribute('aria-describedby', messageId);

    const titleEl = document.createElement('h2');
    titleEl.className = `${DIALOG_CLASS}__title`;
    titleEl.id = titleId;
    titleEl.textContent = title;

    const messageEl = document.createElement('p');
    messageEl.className = `${DIALOG_CLASS}__message`;
    messageEl.id = messageId;
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = `${DIALOG_CLASS}__actions`;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = `${DIALOG_CLASS}__btn ${DIALOG_CLASS}__btn--cancel`;
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `${DIALOG_CLASS}__btn ${DIALOG_CLASS}__btn--confirm${
      destructive ? ` ${DIALOG_CLASS}__btn--destructive` : ''
    }`;
    confirmBtn.textContent = confirmLabel;

    actions.append(cancelBtn, confirmBtn);
    dialog.append(titleEl, messageEl, actions);
    overlay.appendChild(dialog);

    let settled = false;

    /** Tear down listeners + DOM and restore focus, then resolve once. */
    function close(result: boolean): void {
      if (settled) return;
      settled = true;

      document.removeEventListener('keydown', onKeydown, true);
      overlay.remove();

      // Restore focus to the trigger if it is still in the document.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }

      resolve(result);
    }

    /** Focus trap + Escape handling. */
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap focus at the boundaries to keep it inside the dialog.
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));

    // Backdrop click (only when the click lands on the overlay itself).
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) {
        close(false);
      }
    });

    // Capture phase so the trap wins even if inner handlers stop propagation.
    document.addEventListener('keydown', onKeydown, true);

    document.body.appendChild(overlay);

    // Move focus into the dialog (cancel is the safe default for destructive ops).
    cancelBtn.focus();
  });
}
