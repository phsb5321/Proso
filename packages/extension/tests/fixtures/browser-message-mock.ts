/**
 * Browser Runtime Message Mock Utilities
 *
 * Extends jest-webextension-mock with additional utilities for testing
 * message passing between background and content scripts.
 *
 * @module tests/fixtures/browser-message-mock
 */

import { jest } from '@jest/globals';

/**
 * MessageSender type (local definition to avoid browser namespace issues in tests)
 */
export interface MessageSender {
  id?: string;
  tab?: { id?: number; url?: string };
  frameId?: number;
  url?: string;
}

/**
 * Message listener type
 */
export type MessageListener = (
  message: unknown,
  sender: MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | Promise<unknown> | undefined;

/**
 * Captured message for testing
 */
export interface CapturedMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  tabId?: number;
}

/**
 * Mock browser runtime for testing message passing
 */
export function createBrowserRuntimeMock() {
  const listeners: MessageListener[] = [];
  const capturedMessages: CapturedMessage[] = [];
  const messageResponses = new Map<string, unknown>();

  const mock = {
    /**
     * Mock sendMessage implementation
     */
    sendMessage: jest.fn(async (message: { type: string; [key: string]: unknown }) => {
      capturedMessages.push({
        type: message.type,
        payload: message,
        timestamp: Date.now(),
      });

      // Check for configured response
      const response = messageResponses.get(message.type);
      if (response !== undefined) {
        return response;
      }

      // Notify listeners
      for (const listener of listeners) {
        const result = listener(message, { id: 'test-extension' }, () => {});
        if (result !== undefined && result !== false) {
          return result;
        }
      }

      return { success: true };
    }),

    /**
     * Mock onMessage listener
     */
    onMessage: {
      addListener: jest.fn((listener: MessageListener) => {
        listeners.push(listener);
      }),
      removeListener: jest.fn((listener: MessageListener) => {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }),
      hasListener: jest.fn((listener: MessageListener) => {
        return listeners.includes(listener);
      }),
    },

    /**
     * Mock getURL for extension resources
     */
    getURL: jest.fn((path: string) => `moz-extension://test-id/${path}`),

    /**
     * Mock connect for ports
     */
    connect: jest.fn(() => ({
      name: 'test-port',
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      postMessage: jest.fn(),
      disconnect: jest.fn(),
    })),
  };

  return {
    mock,

    /**
     * Get all captured messages
     */
    getCapturedMessages(): CapturedMessage[] {
      return [...capturedMessages];
    },

    /**
     * Get messages of a specific type
     */
    getMessagesOfType(type: string): CapturedMessage[] {
      return capturedMessages.filter((m) => m.type === type);
    },

    /**
     * Get the last message of a specific type
     */
    getLastMessageOfType(type: string): CapturedMessage | undefined {
      return this.getMessagesOfType(type).pop();
    },

    /**
     * Configure a response for a specific message type
     */
    setMessageResponse(type: string, response: unknown): void {
      messageResponses.set(type, response);
    },

    /**
     * Clear configured response for a message type
     */
    clearMessageResponse(type: string): void {
      messageResponses.delete(type);
    },

    /**
     * Simulate receiving a message from the background
     */
    simulateMessage(message: unknown, sender?: Partial<MessageSender>): void {
      const fullSender: MessageSender = {
        id: 'test-extension',
        ...sender,
      };
      for (const listener of listeners) {
        listener(message, fullSender, () => {});
      }
    },

    /**
     * Reset all state
     */
    reset(): void {
      capturedMessages.length = 0;
      listeners.length = 0;
      messageResponses.clear();
      mock.sendMessage.mockClear();
      mock.onMessage.addListener.mockClear();
      mock.onMessage.removeListener.mockClear();
    },
  };
}

/**
 * Mock browser tabs API for testing tab-specific messages
 */
export function createBrowserTabsMock() {
  const activeTab = { id: 1, url: 'https://example.com', active: true };

  return {
    mock: {
      query: jest.fn(async () => [activeTab]),
      sendMessage: jest.fn(async (tabId: number, message: unknown) => {
        return { success: true, tabId, message };
      }),
      get: jest.fn(async (tabId: number) => ({ id: tabId, url: 'https://example.com' })),
      update: jest.fn(async (tabId: number, updateProps: Record<string, unknown>) => ({
        id: tabId,
        ...updateProps,
      })),
    },

    setActiveTab(tab: { id: number; url: string; active?: boolean }): void {
      Object.assign(activeTab, tab);
    },
  };
}

/**
 * FOOTER_STATE_UPDATE message type constant
 */
export const FOOTER_STATE_UPDATE = 'FOOTER_STATE_UPDATE';

/**
 * PARAGRAPH_CLICKED message type constant
 */
export const PARAGRAPH_CLICKED = 'PARAGRAPH_CLICKED';

/**
 * HIGHLIGHT_UPDATE message type constant
 */
export const HIGHLIGHT_UPDATE = 'HIGHLIGHT_UPDATE';

/**
 * Setup global browser mock for testing
 */
export function setupBrowserMock() {
  const runtimeMock = createBrowserRuntimeMock();
  const tabsMock = createBrowserTabsMock();

  // @ts-expect-error - Setting global for tests
  globalThis.browser = {
    runtime: runtimeMock.mock,
    tabs: tabsMock.mock,
    storage: {
      local: {
        get: jest.fn(async () => ({})),
        set: jest.fn(async () => {}),
        remove: jest.fn(async () => {}),
      },
    },
  };

  return {
    runtime: runtimeMock,
    tabs: tabsMock,
    cleanup() {
      // @ts-expect-error - Cleaning global for tests
      delete globalThis.browser;
    },
  };
}
