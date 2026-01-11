/**
 * Usage Context Provider
 *
 * Manages stable identifiers and session context for usage tracking.
 * - installId: Persists across browser restarts (stored in browser.storage.local)
 * - sessionId: Regenerates on each browser session
 *
 * @module utils/telemetry/usage/context
 */

/// <reference types="wxt/browser" />

import type { Entrypoint, Provider } from './types';

/**
 * Current usage context snapshot.
 */
export interface UsageContext {
  /** Stable UUID generated on first installation */
  installId: string;

  /** UUID generated per browser session */
  sessionId: string;

  /** Extension version from manifest */
  extVersion: string;

  /** Extension context where code is running */
  entrypoint: Entrypoint;

  /** Current TTS provider */
  provider?: Provider;

  /** Migration feature flags snapshot */
  flags?: Record<string, boolean>;
}

/**
 * Storage key for install ID.
 */
const INSTALL_ID_KEY = 'telemetry.installId';

/**
 * Generate a UUID v4.
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Detect the current extension entry point.
 */
function detectEntrypoint(): Entrypoint {
  // Check if we're in a service worker / background context
  if (
    typeof self !== 'undefined' &&
    // @ts-expect-error - ServiceWorkerGlobalScope may not be defined
    typeof ServiceWorkerGlobalScope !== 'undefined' &&
    // @ts-expect-error - checking if self is ServiceWorkerGlobalScope
    self instanceof ServiceWorkerGlobalScope
  ) {
    return 'background';
  }

  // Check if we're in a background page (Firefox event pages)
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.location?.href) {
    const url = window.location.href;

    if (url.includes('background')) {
      return 'background';
    }

    if (url.includes('popup')) {
      return 'popup';
    }

    if (url.includes('options') || url.includes('settings')) {
      return 'options';
    }

    // Check if we're a moz-extension:// page (extension pages)
    if (url.startsWith('moz-extension://') || url.startsWith('chrome-extension://')) {
      // Could be popup, options, or background - check page content
      if (document.querySelector('[data-popup]')) {
        return 'popup';
      }
      if (document.querySelector('[data-options]')) {
        return 'options';
      }
      return 'background';
    }
  }

  // Default to content script
  return 'content';
}

/**
 * Get the extension version from manifest.
 */
async function getExtVersion(): Promise<string> {
  try {
    if (typeof browser !== 'undefined' && browser.runtime?.getManifest) {
      const manifest = browser.runtime.getManifest();
      return manifest.version || 'unknown';
    }
  } catch {
    // Ignore errors - version is optional
  }
  return 'unknown';
}

/**
 * Context Provider manages stable identifiers and session context.
 */
export class ContextProvider {
  private installId: string | null = null;
  private sessionId: string;
  private extVersion = 'unknown';
  private entrypoint: Entrypoint;
  private provider?: Provider;
  private flags?: Record<string, boolean>;
  private initialized = false;

  constructor(entrypoint?: Entrypoint) {
    this.sessionId = generateUUID();
    this.entrypoint = entrypoint ?? detectEntrypoint();
  }

  /**
   * Initialize the context provider.
   * Must be called before getContext().
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Get extension version
    this.extVersion = await getExtVersion();

    // Load or generate install ID
    this.installId = await this.loadOrCreateInstallId();

    this.initialized = true;
  }

  /**
   * Load install ID from storage or create a new one.
   */
  private async loadOrCreateInstallId(): Promise<string> {
    try {
      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const result = await browser.storage.local.get(INSTALL_ID_KEY);
        const storedId = result[INSTALL_ID_KEY];

        if (storedId && typeof storedId === 'string') {
          return storedId;
        }

        // Generate and store new install ID
        const newId = generateUUID();
        await browser.storage.local.set({ [INSTALL_ID_KEY]: newId });
        return newId;
      }
    } catch {
      // Fall through to generate ID without persistence
    }

    // Fallback: generate without persistence (content scripts without storage access)
    return generateUUID();
  }

  /**
   * Get the current usage context.
   * @throws Error if not initialized
   */
  getContext(): UsageContext {
    if (!this.initialized || !this.installId) {
      throw new Error('ContextProvider not initialized. Call initialize() first.');
    }

    return {
      installId: this.installId,
      sessionId: this.sessionId,
      extVersion: this.extVersion,
      entrypoint: this.entrypoint,
      provider: this.provider,
      flags: this.flags,
    };
  }

  /**
   * Get context without throwing if not initialized.
   * Returns partial context with generated IDs.
   */
  getContextSafe(): UsageContext {
    return {
      installId: this.installId ?? generateUUID(),
      sessionId: this.sessionId,
      extVersion: this.extVersion,
      entrypoint: this.entrypoint,
      provider: this.provider,
      flags: this.flags,
    };
  }

  /**
   * Set the current TTS provider.
   */
  setProvider(provider: Provider): void {
    this.provider = provider;
  }

  /**
   * Clear the current provider.
   */
  clearProvider(): void {
    this.provider = undefined;
  }

  /**
   * Set migration feature flags.
   */
  setFlags(flags: Record<string, boolean>): void {
    this.flags = { ...flags };
  }

  /**
   * Update a single flag.
   */
  setFlag(key: string, value: boolean): void {
    this.flags = { ...this.flags, [key]: value };
  }

  /**
   * Clear all flags.
   */
  clearFlags(): void {
    this.flags = undefined;
  }

  /**
   * Get the current entry point.
   */
  getEntrypoint(): Entrypoint {
    return this.entrypoint;
  }

  /**
   * Get the install ID (may be null if not initialized).
   */
  getInstallId(): string | null {
    return this.installId;
  }

  /**
   * Get the session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Check if provider is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Reset session ID (for testing or session refresh).
   */
  resetSession(): void {
    this.sessionId = generateUUID();
  }
}
