/**
 * Background ↔ Content Script Messaging Integration Tests
 *
 * Tests the message passing between background service worker and content scripts.
 * Uses mock implementations to verify the messaging protocol works correctly.
 *
 * @module tests/integration/messaging/background-content
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  HandlerRegistry,
  createHandlerRegistry,
} from '../../../src/handlers/registry';
import type { Result } from '../../../src/core/shared/result';
import { Ok, Err } from '../../../src/core/shared/result';

/**
 * Mock content script state
 */
interface ContentScriptState {
  isInjected: boolean;
  currentParagraphIndex: number;
  paragraphs: string[];
  isHighlighting: boolean;
}

/**
 * Mock background state
 */
interface BackgroundState {
  isPlaying: boolean;
  currentProvider: string;
  currentTabId: number | null;
}

describe('Background ↔ Content Messaging Integration', () => {
  let registry: HandlerRegistry;
  let contentState: ContentScriptState;
  let backgroundState: BackgroundState;

  beforeEach(() => {
    registry = createHandlerRegistry();

    // Initialize mock states
    contentState = {
      isInjected: false,
      currentParagraphIndex: -1,
      paragraphs: [],
      isHighlighting: false,
    };

    backgroundState = {
      isPlaying: false,
      currentProvider: 'browser',
      currentTabId: null,
    };

    // Register mock handlers simulating background script
    registry.register<{ tabId: number }, Result<{ injected: boolean }, { type: string; message: string }>>(
      'content.checkInjection',
      async ({ tabId }) => {
        backgroundState.currentTabId = tabId;
        return Ok({ injected: contentState.isInjected });
      },
      'Check if content script is injected',
    );

    registry.register<{ tabId: number }, Result<void, { type: string; message: string }>>(
      'content.inject',
      async ({ tabId }) => {
        backgroundState.currentTabId = tabId;
        contentState.isInjected = true;
        return Ok(undefined);
      },
      'Inject content script',
    );

    registry.register<
      { tabId: number; paragraphs: string[] },
      Result<{ count: number }, { type: string; message: string }>
    >(
      'content.setParagraphs',
      async ({ tabId, paragraphs }) => {
        if (!contentState.isInjected) {
          return Err({ type: 'not_injected', message: 'Content script not injected' });
        }
        contentState.paragraphs = paragraphs;
        return Ok({ count: paragraphs.length });
      },
      'Set paragraphs for playback',
    );

    registry.register<
      { tabId: number; index: number },
      Result<{ text: string }, { type: string; message: string }>
    >(
      'content.highlightParagraph',
      async ({ tabId, index }) => {
        if (!contentState.isInjected) {
          return Err({ type: 'not_injected', message: 'Content script not injected' });
        }
        if (index < 0 || index >= contentState.paragraphs.length) {
          return Err({ type: 'invalid_index', message: `Index ${index} out of bounds` });
        }
        contentState.currentParagraphIndex = index;
        contentState.isHighlighting = true;
        return Ok({ text: contentState.paragraphs[index] });
      },
      'Highlight a specific paragraph',
    );

    registry.register<{ tabId: number }, Result<void, { type: string; message: string }>>(
      'content.clearHighlight',
      async ({ tabId }) => {
        contentState.isHighlighting = false;
        contentState.currentParagraphIndex = -1;
        return Ok(undefined);
      },
      'Clear all highlights',
    );
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Content Script Injection Flow', () => {
    it('should check if content script is injected', async () => {
      const result = await registry.dispatch<
        { tabId: number },
        Result<{ injected: boolean }, { type: string; message: string }>
      >('content.checkInjection', { tabId: 1 });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.injected).toBe(false);
      }
    });

    it('should inject content script when not present', async () => {
      // Check initial state
      const checkResult = await registry.dispatch<
        { tabId: number },
        Result<{ injected: boolean }, { type: string; message: string }>
      >('content.checkInjection', { tabId: 1 });
      expect(checkResult.ok && checkResult.value.ok && checkResult.value.value.injected).toBe(false);

      // Inject
      const injectResult = await registry.dispatch('content.inject', { tabId: 1 });
      expect(injectResult.ok).toBe(true);

      // Verify injection
      const verifyResult = await registry.dispatch<
        { tabId: number },
        Result<{ injected: boolean }, { type: string; message: string }>
      >('content.checkInjection', { tabId: 1 });
      expect(verifyResult.ok && verifyResult.value.ok && verifyResult.value.value.injected).toBe(true);
    });

    it('should track tab ID correctly', async () => {
      await registry.dispatch('content.inject', { tabId: 42 });
      expect(backgroundState.currentTabId).toBe(42);
    });
  });

  describe('Paragraph Management Flow', () => {
    beforeEach(async () => {
      // Ensure content script is injected
      await registry.dispatch('content.inject', { tabId: 1 });
    });

    it('should set paragraphs for playback', async () => {
      const paragraphs = ['First paragraph.', 'Second paragraph.', 'Third paragraph.'];
      const result = await registry.dispatch<
        { tabId: number; paragraphs: string[] },
        Result<{ count: number }, { type: string; message: string }>
      >('content.setParagraphs', {
        tabId: 1,
        paragraphs,
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.count).toBe(3);
      }
      expect(contentState.paragraphs).toEqual(paragraphs);
    });

    it('should fail to set paragraphs when not injected', async () => {
      // Reset injection state
      contentState.isInjected = false;

      const result = await registry.dispatch<
        { tabId: number; paragraphs: string[] },
        Result<{ count: number }, { type: string; message: string }>
      >('content.setParagraphs', {
        tabId: 1,
        paragraphs: ['Test'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
        if (!result.value.ok) {
          expect(result.value.error.type).toBe('not_injected');
        }
      }
    });
  });

  describe('Highlight Flow', () => {
    beforeEach(async () => {
      await registry.dispatch('content.inject', { tabId: 1 });
      await registry.dispatch('content.setParagraphs', {
        tabId: 1,
        paragraphs: ['Para 1', 'Para 2', 'Para 3'],
      });
    });

    it('should highlight a specific paragraph', async () => {
      const result = await registry.dispatch<
        { tabId: number; index: number },
        Result<{ text: string }, { type: string; message: string }>
      >('content.highlightParagraph', {
        tabId: 1,
        index: 1,
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.ok) {
        expect(result.value.value.text).toBe('Para 2');
      }
      expect(contentState.currentParagraphIndex).toBe(1);
      expect(contentState.isHighlighting).toBe(true);
    });

    it('should reject invalid paragraph index', async () => {
      const result = await registry.dispatch<
        { tabId: number; index: number },
        Result<{ text: string }, { type: string; message: string }>
      >('content.highlightParagraph', {
        tabId: 1,
        index: 99,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.ok).toBe(false);
      }
    });

    it('should clear highlights', async () => {
      // First highlight
      await registry.dispatch('content.highlightParagraph', { tabId: 1, index: 0 });
      expect(contentState.isHighlighting).toBe(true);

      // Then clear
      const result = await registry.dispatch('content.clearHighlight', { tabId: 1 });
      expect(result.ok).toBe(true);
      expect(contentState.isHighlighting).toBe(false);
      expect(contentState.currentParagraphIndex).toBe(-1);
    });

    it('should move highlight sequentially', async () => {
      for (let i = 0; i < 3; i++) {
        await registry.dispatch('content.highlightParagraph', { tabId: 1, index: i });
        expect(contentState.currentParagraphIndex).toBe(i);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return error for unregistered handler', async () => {
      const result = await registry.dispatch('nonexistent.handler', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
      }
    });

    it('should handle handler errors gracefully', async () => {
      // Register a handler that throws
      registry.register('error.throwing', async () => {
        throw new Error('Intentional test error');
      });

      const result = await registry.dispatch('error.throwing', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('execution_failed');
        if (result.error.type === 'execution_failed') {
          expect(result.error.message).toContain('Intentional test error');
        }
      }
    });
  });

  describe('Handler Registry Operations', () => {
    it('should list all registered handlers', () => {
      const handlers = registry.getHandlerNames();

      expect(handlers).toContain('content.checkInjection');
      expect(handlers).toContain('content.inject');
      expect(handlers).toContain('content.setParagraphs');
      expect(handlers).toContain('content.highlightParagraph');
      expect(handlers).toContain('content.clearHighlight');
    });

    it('should group handlers by prefix', () => {
      const groups = registry.getHandlersByPrefix();

      expect(groups.get('content')).toBeDefined();
      expect(groups.get('content')?.length).toBeGreaterThanOrEqual(5);
    });

    it('should check handler existence', () => {
      expect(registry.has('content.inject')).toBe(true);
      expect(registry.has('nonexistent')).toBe(false);
    });

    it('should unregister handlers', () => {
      expect(registry.has('content.inject')).toBe(true);

      const removed = registry.unregister('content.inject');
      expect(removed).toBe(true);
      expect(registry.has('content.inject')).toBe(false);
    });
  });
});
