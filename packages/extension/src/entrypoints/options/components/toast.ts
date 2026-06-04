// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Toast Notification Component
 * Accessible toast notifications with auto-dismiss and ARIA live regions
 *
 * @module entrypoints/options/components/toast
 * @description FR-020, FR-021, FR-031 - Toast notifications with accessibility
 */

export interface ToastOptions {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number; // ms, 0 = persist until dismissed
  dismissible?: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}

/**
 * Default durations by type (ms)
 */
const DEFAULT_DURATIONS: Record<ToastOptions['type'], number> = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 0, // persist until dismissed
};

/**
 * Toast container element (lazy created)
 */
let toastContainer: HTMLElement | null = null;

/**
 * Create or get the toast container element
 */
function getToastContainer(): HTMLElement {
  if (toastContainer && document.body.contains(toastContainer)) {
    return toastContainer;
  }

  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.className = 'toast-container';
  // FR-031: ARIA live region for screen readers
  toastContainer.setAttribute('role', 'region');
  toastContainer.setAttribute('aria-label', 'Notifications');
  toastContainer.setAttribute('aria-live', 'polite');
  toastContainer.setAttribute('aria-atomic', 'false');
  document.body.appendChild(toastContainer);

  return toastContainer;
}

/**
 * Show a toast notification
 */
export function showToast(options: ToastOptions): HTMLElement {
  const container = getToastContainer();
  const duration = options.duration ?? DEFAULT_DURATIONS[options.type];
  const dismissible = options.dismissible ?? true;

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast toast--${options.type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', options.type === 'error' ? 'assertive' : 'polite');

  // Create icon
  const icon = document.createElement('span');
  icon.className = 'toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = getIconForType(options.type);
  toast.appendChild(icon);

  // Create message container
  const content = document.createElement('div');
  content.className = 'toast__content';

  const message = document.createElement('span');
  message.className = 'toast__message';
  message.textContent = options.message;
  content.appendChild(message);

  // Add action button if provided
  if (options.action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast__action';
    actionBtn.textContent = options.action.label;
    actionBtn.addEventListener('click', () => {
      options.action?.handler();
      dismissToast(toast);
    });
    content.appendChild(actionBtn);
  }

  toast.appendChild(content);

  // Add dismiss button if dismissible
  if (dismissible) {
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'toast__dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss notification');
    dismissBtn.textContent = '\u00d7'; // Unicode multiplication sign (×)
    dismissBtn.addEventListener('click', () => dismissToast(toast));
    toast.appendChild(dismissBtn);
  }

  // Add to container with animation
  container.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  // Auto-dismiss if duration > 0
  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }

  return toast;
}

/**
 * Dismiss a toast notification with animation
 */
export function dismissToast(toast: HTMLElement): void {
  toast.classList.remove('toast--visible');
  toast.classList.add('toast--exiting');

  // Remove after animation completes
  toast.addEventListener(
    'animationend',
    () => {
      toast.remove();
    },
    { once: true },
  );

  // Fallback removal if animation doesn't fire
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 300);
}

/**
 * Dismiss all toasts
 */
export function dismissAllToasts(): void {
  const container = document.getElementById('toast-container');
  if (container) {
    const toasts = container.querySelectorAll('.toast');
    toasts.forEach((toast) => dismissToast(toast as HTMLElement));
  }
}

/**
 * Get icon character for toast type
 */
function getIconForType(type: ToastOptions['type']): string {
  switch (type) {
    case 'success':
      return '\u2713'; // Check mark
    case 'error':
      return '\u2717'; // X mark
    case 'warning':
      return '\u26A0'; // Warning triangle
    case 'info':
      return '\u2139'; // Information i
    default:
      return '';
  }
}

/**
 * Convenience methods for common toast types
 */
export const toast = {
  success: (message: string, options?: Partial<ToastOptions>) =>
    showToast({ type: 'success', message, ...options }),

  error: (message: string, options?: Partial<ToastOptions>) =>
    showToast({ type: 'error', message, ...options }),

  warning: (message: string, options?: Partial<ToastOptions>) =>
    showToast({ type: 'warning', message, ...options }),

  info: (message: string, options?: Partial<ToastOptions>) =>
    showToast({ type: 'info', message, ...options }),
};
