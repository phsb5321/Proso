/**
 * IHighlightSynchronizer Contract Tests
 *
 * These tests define the contract that all highlight synchronizer adapters must satisfy.
 * Run against each adapter implementation to verify interchangeability.
 *
 * @module tests/contract/highlight-sync
 */

import type { IHighlightSynchronizer, FooterState } from '../../src/ports/highlight-sync.port';
import { isOk, isErr } from '../../src/core/shared/result';
import { MockHighlightSync } from '../mocks';
import { NoOpHighlightSyncAdapter } from '../../src/adapters/messaging/noop-highlight-sync.adapter';

/**
 * Contract test suite for IHighlightSynchronizer implementations.
 *
 * Usage:
 * ```typescript
 * runHighlightSyncContractTests('HighlightSyncAdapter', () => new HighlightSyncAdapter());
 * ```
 */
export function runHighlightSyncContractTests(
  adapterName: string,
  createAdapter: () => IHighlightSynchronizer
) {
  describe(`${adapterName} implements IHighlightSynchronizer contract`, () => {
    let adapter: IHighlightSynchronizer;
    const validTabId = 1;

    beforeEach(() => {
      adapter = createAdapter();
      // If it's a mock, configure it to accept the test tab ID
      if (adapter instanceof MockHighlightSync) {
        adapter.addValidTabId(validTabId);
      }
    });

    describe('highlightParagraph()', () => {
      it('should return a Result type', async () => {
        const result = await adapter.highlightParagraph(validTabId, 0, false);

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }

        if (isErr(result)) {
          expect(result.error.type).toBeDefined();
          expect(['tab_not_found', 'content_script_not_loaded', 'message_failed']).toContain(
            result.error.type
          );
        }
      });

      it('should accept paragraph index 0', async () => {
        const result = await adapter.highlightParagraph(validTabId, 0, false);
        // Should not throw, result can be Ok or Err depending on adapter
        expect(typeof result.ok).toBe('boolean');
      });

      it('should accept scroll boolean', async () => {
        const resultNoScroll = await adapter.highlightParagraph(validTabId, 0, false);
        const resultWithScroll = await adapter.highlightParagraph(validTabId, 0, true);

        expect(typeof resultNoScroll.ok).toBe('boolean');
        expect(typeof resultWithScroll.ok).toBe('boolean');
      });
    });

    describe('highlightWord()', () => {
      it('should return a Result type', async () => {
        const result = await adapter.highlightWord(validTabId, 0, 0);

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }

        if (isErr(result)) {
          expect(result.error.type).toBeDefined();
          expect(['tab_not_found', 'content_script_not_loaded', 'message_failed']).toContain(
            result.error.type
          );
        }
      });

      it('should accept paragraph and word indices', async () => {
        const result = await adapter.highlightWord(validTabId, 5, 10);
        expect(typeof result.ok).toBe('boolean');
      });
    });

    describe('clearHighlights()', () => {
      it('should return a Result type', async () => {
        const result = await adapter.clearHighlights(validTabId);

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }

        if (isErr(result)) {
          expect(result.error.type).toBeDefined();
        }
      });
    });

    describe('showFooter()', () => {
      it('should return a Result type', async () => {
        const result = await adapter.showFooter(validTabId);

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }

        if (isErr(result)) {
          expect(result.error.type).toBeDefined();
        }
      });
    });

    describe('hideFooter()', () => {
      it('should return a Result type', async () => {
        const result = await adapter.hideFooter(validTabId);

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }

        if (isErr(result)) {
          expect(result.error.type).toBeDefined();
        }
      });
    });

    describe('updateFooterState()', () => {
      it('should return a Result type', async () => {
        const state: FooterState = {
          status: 'playing',
          currentIndex: 0,
          totalParagraphs: 10,
          progress: 0.5,
          currentText: 'Test paragraph',
          speed: 1.0,
        };

        const result = await adapter.updateFooterState(validTabId, state);

        expect(typeof result.ok).toBe('boolean');

        if (isOk(result)) {
          expect(result.value).toBeUndefined();
        }

        if (isErr(result)) {
          expect(result.error.type).toBeDefined();
        }
      });

      it('should accept all valid playback statuses', async () => {
        const statuses = ['idle', 'loading', 'playing', 'paused', 'stopped', 'error'] as const;

        for (const status of statuses) {
          const state: FooterState = {
            status,
            currentIndex: 0,
            totalParagraphs: 10,
            progress: 0.5,
            currentText: 'Test',
            speed: 1.0,
          };

          const result = await adapter.updateFooterState(validTabId, state);
          expect(typeof result.ok).toBe('boolean');
        }
      });
    });
  });
}

// Run contract tests against MockHighlightSync
runHighlightSyncContractTests('MockHighlightSync', () => new MockHighlightSync());

// Run contract tests against NoOpHighlightSyncAdapter
runHighlightSyncContractTests('NoOpHighlightSyncAdapter', () => new NoOpHighlightSyncAdapter());
