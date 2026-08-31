/**
 * Global type definitions for Proso
 * References WXT auto-generated types
 */

/// <reference path=".wxt/wxt.d.ts" />

/**
 * Chrome extension APIs not fully typed by WXT.
 * Used for Chrome-specific features like offscreen documents.
 */
declare namespace chrome {
  namespace offscreen {
    type Reason = string;
    function createDocument(options: {
      url: string;
      reasons: Reason[];
      justification: string;
    }): Promise<void>;
    function closeDocument(): Promise<void>;
  }

  namespace runtime {
    type ContextType = string;
    const lastError: { message?: string } | undefined;
    function getContexts(filter: {
      contextTypes: ContextType[];
    }): Promise<Array<{ contextType: string; documentUrl: string }>>;
    function sendMessage(
      message: Record<string, unknown>,
      callback: (response: unknown) => void,
    ): void;
    const onMessage: {
      addListener(
        callback: (message: unknown, sender: unknown, sendResponse: unknown) => void,
      ): void;
    };
  }
}

/**
 * Build-time constants injected by Vite define in wxt.config.ts.
 * Seeded into browser.storage.local at install time by runtime.onInstalled handler.
 */
