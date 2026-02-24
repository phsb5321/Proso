// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com/commercial

/**
 * Theme Manager Utility
 * Manages light/dark/system theme modes with instant switching
 *
 * @module utils/options/theme-manager
 * @description FR-008 - Theme switching with instant apply
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeManagerOptions {
  /** Storage key for persisting theme preference */
  storageKey?: string;
  /** Callback when theme changes */
  onThemeChange?: (theme: ResolvedTheme, mode: ThemeMode) => void;
}

export interface ThemeManager {
  /** Initialize theme manager and apply saved theme */
  init: () => Promise<void>;
  /** Get current theme mode */
  getMode: () => ThemeMode;
  /** Get resolved theme (light or dark) */
  getResolvedTheme: () => ResolvedTheme;
  /** Set theme mode */
  setMode: (mode: ThemeMode) => Promise<void>;
  /** Cleanup listeners */
  destroy: () => void;
}

/**
 * Create a theme manager instance
 * Handles system theme detection, storage, and instant application
 */
export function createThemeManager(options: ThemeManagerOptions = {}): ThemeManager {
  const { storageKey = 'themeMode', onThemeChange } = options;

  let currentMode: ThemeMode = 'system';
  let mediaQuery: MediaQueryList | null = null;
  let mediaQueryHandler: ((e: MediaQueryListEvent) => void) | null = null;

  /**
   * Get system theme preference
   */
  function getSystemTheme(): ResolvedTheme {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /**
   * Resolve theme mode to actual theme
   */
  function resolveTheme(mode: ThemeMode): ResolvedTheme {
    if (mode === 'system') {
      return getSystemTheme();
    }
    return mode;
  }

  /**
   * Apply theme to document
   */
  function applyTheme(theme: ResolvedTheme): void {
    // Update data-theme attribute on html element
    document.documentElement.setAttribute('data-theme', theme);

    // Update color-scheme meta tag
    const metaTag = document.querySelector('meta[name="color-scheme"]');
    if (metaTag) {
      metaTag.setAttribute('content', theme);
    }

    // Update class for additional CSS hooks
    document.documentElement.classList.remove('theme-light', 'theme-dark');
    document.documentElement.classList.add(`theme-${theme}`);
  }

  /**
   * Handle system theme change
   */
  function handleSystemThemeChange(): void {
    if (currentMode !== 'system') return;

    const resolved = resolveTheme('system');
    applyTheme(resolved);

    if (onThemeChange) {
      onThemeChange(resolved, 'system');
    }
  }

  /**
   * Initialize theme manager
   */
  async function init(): Promise<void> {
    // Load saved preference
    const result = await browser.storage.local.get(storageKey);
    currentMode = (result[storageKey] as ThemeMode) || 'system';

    // Apply initial theme
    const resolved = resolveTheme(currentMode);
    applyTheme(resolved);

    // T058: Listen for system theme changes
    if (typeof window !== 'undefined') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQueryHandler = () => handleSystemThemeChange();

      // Use modern API if available, fallback for older browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', mediaQueryHandler);
      } else {
        mediaQuery.addListener(mediaQueryHandler);
      }
    }

    // Listen for storage changes (cross-tab sync)
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes[storageKey]) {
        const newMode = changes[storageKey].newValue as ThemeMode;
        currentMode = newMode;
        const resolved = resolveTheme(newMode);
        applyTheme(resolved);

        if (onThemeChange) {
          onThemeChange(resolved, newMode);
        }
      }
    });
  }

  /**
   * Get current theme mode
   */
  function getMode(): ThemeMode {
    return currentMode;
  }

  /**
   * Get resolved theme (light or dark)
   */
  function getResolvedTheme(): ResolvedTheme {
    return resolveTheme(currentMode);
  }

  /**
   * Set theme mode with instant apply
   * T057: Theme change handler with instant apply
   */
  async function setMode(mode: ThemeMode): Promise<void> {
    currentMode = mode;

    // Apply immediately
    const resolved = resolveTheme(mode);
    applyTheme(resolved);

    // Persist to storage
    await browser.storage.local.set({ [storageKey]: mode });

    // Notify background script
    try {
      await browser.runtime.sendMessage({
        type: 'settings.setTheme',
        data: { mode },
      });
    } catch (error) {
      // Background script may not be ready, that's okay
      console.debug('Theme message to background failed:', error);
    }

    if (onThemeChange) {
      onThemeChange(resolved, mode);
    }
  }

  /**
   * Cleanup event listeners
   */
  function destroy(): void {
    if (mediaQuery && mediaQueryHandler) {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', mediaQueryHandler);
      } else {
        mediaQuery.removeListener(mediaQueryHandler);
      }
    }
    mediaQuery = null;
    mediaQueryHandler = null;
  }

  return {
    init,
    getMode,
    getResolvedTheme,
    setMode,
    destroy,
  };
}

/**
 * Singleton theme manager instance for the options page
 */
let themeManagerInstance: ThemeManager | null = null;

/**
 * Get or create the theme manager singleton
 */
export function getThemeManager(options?: ThemeManagerOptions): ThemeManager {
  if (!themeManagerInstance) {
    themeManagerInstance = createThemeManager(options);
  }
  return themeManagerInstance;
}
