// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * Confirmation Modal Component
 * Provides a reusable modal for confirmations and dialogs
 *
 * @module entrypoints/options/components/modal
 * @description FR-026 - Confirmation dialogs for reset operations
 */

export interface ModalOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

let activeModal: HTMLElement | null = null;
let previousActiveElement: HTMLElement | null = null;

/**
 * Show a confirmation modal
 * Returns a promise that resolves to true if confirmed, false if cancelled
 */
export function showConfirmModal(options: ModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const {
      title,
      message,
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      confirmVariant = 'primary',
      onConfirm,
      onCancel,
    } = options;

    // Store currently focused element for restoration
    previousActiveElement = document.activeElement as HTMLElement;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'voxpage-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');
    overlay.setAttribute('aria-describedby', 'modal-message');

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'voxpage-modal';

    // Create modal header
    const header = document.createElement('div');
    header.className = 'voxpage-modal__header';

    const titleEl = document.createElement('h3');
    titleEl.id = 'modal-title';
    titleEl.className = 'voxpage-modal__title';
    titleEl.textContent = title;

    header.appendChild(titleEl);

    // Create modal body
    const body = document.createElement('div');
    body.className = 'voxpage-modal__body';

    const messageEl = document.createElement('p');
    messageEl.id = 'modal-message';
    messageEl.className = 'voxpage-modal__message';
    messageEl.textContent = message;

    body.appendChild(messageEl);

    // Create modal footer with buttons
    const footer = document.createElement('div');
    footer.className = 'voxpage-modal__footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'voxpage-button voxpage-button--secondary';
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `voxpage-button voxpage-button--${confirmVariant}`;
    confirmBtn.textContent = confirmText;

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // Add to DOM
    document.body.appendChild(overlay);
    activeModal = overlay;

    // Focus the cancel button by default (safer option)
    requestAnimationFrame(() => {
      cancelBtn.focus();
    });

    // Cleanup function
    const closeModal = (confirmed: boolean) => {
      if (activeModal) {
        activeModal.classList.add('voxpage-modal-overlay--closing');

        // Wait for animation to complete
        setTimeout(() => {
          activeModal?.remove();
          activeModal = null;

          // Restore focus
          if (previousActiveElement && previousActiveElement.focus) {
            previousActiveElement.focus();
          }
          previousActiveElement = null;
        }, 150);
      }

      resolve(confirmed);
    };

    // Event handlers
    const handleConfirm = async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Processing...';

      try {
        await onConfirm();
        closeModal(true);
      } catch (error) {
        console.error('Modal confirm action failed:', error);
        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmText;
      }
    };

    const handleCancel = () => {
      if (onCancel) {
        onCancel();
      }
      closeModal(false);
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }

      // Trap focus within modal
      if (e.key === 'Tab') {
        const focusableElements = modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    const handleOverlayClick = (e: MouseEvent) => {
      if (e.target === overlay) {
        handleCancel();
      }
    };

    // Attach event listeners
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    overlay.addEventListener('keydown', handleKeydown);
    overlay.addEventListener('click', handleOverlayClick);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      overlay.classList.add('voxpage-modal-overlay--visible');
    });
  });
}

/**
 * Close any active modal
 */
export function closeActiveModal(): void {
  if (activeModal) {
    activeModal.classList.add('voxpage-modal-overlay--closing');

    setTimeout(() => {
      activeModal?.remove();
      activeModal = null;

      if (previousActiveElement && previousActiveElement.focus) {
        previousActiveElement.focus();
      }
      previousActiveElement = null;
    }, 150);
  }
}

/**
 * Check if a modal is currently open
 */
export function isModalOpen(): boolean {
  return activeModal !== null;
}
