/**
 * Global type definitions for VoxPage
 * References WXT auto-generated types
 */

/// <reference path=".wxt/wxt.d.ts" />

/**
 * Chrome extension APIs not fully typed by WXT.
 * Used for Chrome-specific features like offscreen documents.
 */
declare const chrome: {
  offscreen?: {
    createDocument(options: {
      url: string;
      reasons: string[];
      justification: string;
    }): Promise<void>;
    closeDocument(): Promise<void>;
  };
  runtime: {
    getContexts(filter: {
      contextTypes: string[];
    }): Promise<Array<{ contextType: string; documentUrl: string }>>;
  };
};
