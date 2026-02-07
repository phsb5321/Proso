/**
 * Queue Handler Unit Tests
 *
 * Tests for queue message handlers registered via registerQueueHandlers.
 * Verifies parameter validation, delegation to legacy handlers, and
 * Result<T,E> wrapping for all 11 queue operations.
 *
 * @module tests/unit/handlers/queue.handlers
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '../../../src');

// ---------------------------------------------------------------------------
// Mocks - must come before dynamic imports
// ---------------------------------------------------------------------------

const mockHandleQueueAdd = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueueRemove = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueueReorder = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueueUpdateStatus = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueueUpdateProgress = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueueClear = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueueGetState = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueueGetItem = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueuePlay = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueuePlayNext = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockHandleQueuePlayPrevious = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule(
  resolve(srcDir, 'utils/messaging/handlers/queue'),
  () => ({
    handleQueueAdd: mockHandleQueueAdd,
    handleQueueRemove: mockHandleQueueRemove,
    handleQueueReorder: mockHandleQueueReorder,
    handleQueueUpdateStatus: mockHandleQueueUpdateStatus,
    handleQueueUpdateProgress: mockHandleQueueUpdateProgress,
    handleQueueClear: mockHandleQueueClear,
    handleQueueGetState: mockHandleQueueGetState,
    handleQueueGetItem: mockHandleQueueGetItem,
    handleQueuePlay: mockHandleQueuePlay,
    handleQueuePlayNext: mockHandleQueuePlayNext,
    handleQueuePlayPrevious: mockHandleQueuePlayPrevious,
  }),
);

// ---------------------------------------------------------------------------
// Dynamic imports (after mocks are wired)
// ---------------------------------------------------------------------------

const { registerQueueHandlers } = await import('../../../src/handlers/queue.handlers');
const { HandlerRegistry } = await import('../../../src/handlers/registry');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dispatch through the registry and unwrap the outer Result from dispatch(). */
async function dispatch(registry: InstanceType<typeof HandlerRegistry>, name: string, params: unknown = {}) {
  const outer = await registry.dispatch(name, params);
  // dispatch() wraps the handler response in Ok – unwrap it
  if (!outer.ok) {
    throw new Error(`dispatch failed: ${JSON.stringify(outer.error)}`);
  }
  return outer.value as { ok: boolean; value?: unknown; error?: unknown };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Queue Handlers', () => {
  let registry: InstanceType<typeof HandlerRegistry>;

  beforeEach(() => {
    registry = new HandlerRegistry();
    registerQueueHandlers(registry);

    // Reset all mocks between tests
    mockHandleQueueAdd.mockReset();
    mockHandleQueueRemove.mockReset();
    mockHandleQueueReorder.mockReset();
    mockHandleQueueUpdateStatus.mockReset();
    mockHandleQueueUpdateProgress.mockReset();
    mockHandleQueueClear.mockReset();
    mockHandleQueueGetState.mockReset();
    mockHandleQueueGetItem.mockReset();
    mockHandleQueuePlay.mockReset();
    mockHandleQueuePlayNext.mockReset();
    mockHandleQueuePlayPrevious.mockReset();
  });

  // ========================================================================
  // Registration
  // ========================================================================

  describe('registration', () => {
    it('registers all 11 queue handlers', () => {
      const expected = [
        'queue.add',
        'queue.remove',
        'queue.reorder',
        'queue.updateStatus',
        'queue.updateProgress',
        'queue.clear',
        'queue.getState',
        'queue.getItem',
        'queue.play',
        'queue.playNext',
        'queue.playPrevious',
      ];

      for (const name of expected) {
        expect(registry.has(name)).toBe(true);
      }
      expect(registry.getHandlerNames()).toEqual(expect.arrayContaining(expected));
    });

    it('dispatches to an unregistered handler with not_found error', async () => {
      const result = await registry.dispatch('queue.nonexistent', {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('not_found');
      }
    });
  });

  // ========================================================================
  // queue.add
  // ========================================================================

  describe('queue.add', () => {
    it('returns Ok with id and position on success', async () => {
      mockHandleQueueAdd.mockResolvedValue({
        success: true,
        id: 'item-1',
        position: 0,
      });

      const result = await dispatch(registry, 'queue.add', {
        url: 'https://example.com',
        title: 'Test Article',
      });

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ id: 'item-1', position: 0 });
      expect(mockHandleQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com', title: 'Test Article' }),
      );
    });

    it('passes optional fields to legacy handler', async () => {
      mockHandleQueueAdd.mockResolvedValue({ success: true, id: 'item-2', position: 1 });

      await dispatch(registry, 'queue.add', {
        url: 'https://example.com',
        title: 'Test',
        excerpt: 'Summary',
        author: 'Author',
        faviconUrl: 'https://example.com/favicon.ico',
        language: 'en',
        estimatedReadTime: 5,
      });

      expect(mockHandleQueueAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          excerpt: 'Summary',
          author: 'Author',
          faviconUrl: 'https://example.com/favicon.ico',
          language: 'en',
          estimatedReadTime: 5,
        }),
      );
    });

    it('returns invalid_params when url is missing', async () => {
      const result = await dispatch(registry, 'queue.add', { title: 'Test' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'url and title are required',
      });
      expect(mockHandleQueueAdd).not.toHaveBeenCalled();
    });

    it('returns invalid_params when title is missing', async () => {
      const result = await dispatch(registry, 'queue.add', { url: 'https://example.com' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'url and title are required',
      });
    });

    it('returns invalid_params when params is null', async () => {
      const result = await dispatch(registry, 'queue.add', null);

      expect(result.ok).toBe(false);
      expect(result.error).toEqual(
        expect.objectContaining({ type: 'invalid_params' }),
      );
    });

    it('returns operation_failed when legacy handler reports failure', async () => {
      mockHandleQueueAdd.mockResolvedValue({
        success: false,
        id: '',
        position: -1,
        error: 'Duplicate URL',
      });

      const result = await dispatch(registry, 'queue.add', {
        url: 'https://example.com',
        title: 'Test',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Duplicate URL',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueueAdd.mockRejectedValue(new Error('Storage full'));

      const result = await dispatch(registry, 'queue.add', {
        url: 'https://example.com',
        title: 'Test',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Storage full',
      });
    });

    it('converts non-Error throws to string message', async () => {
      mockHandleQueueAdd.mockRejectedValue('string error');

      const result = await dispatch(registry, 'queue.add', {
        url: 'https://example.com',
        title: 'Test',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'string error',
      });
    });
  });

  // ========================================================================
  // queue.remove
  // ========================================================================

  describe('queue.remove', () => {
    it('returns Ok with success: true on removal', async () => {
      mockHandleQueueRemove.mockResolvedValue({ success: true });

      const result = await dispatch(registry, 'queue.remove', { id: 'item-1' });

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ success: true });
      expect(mockHandleQueueRemove).toHaveBeenCalledWith({ id: 'item-1' });
    });

    it('returns invalid_params when id is missing', async () => {
      const result = await dispatch(registry, 'queue.remove', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'id is required',
      });
      expect(mockHandleQueueRemove).not.toHaveBeenCalled();
    });

    it('returns not_found when legacy handler reports failure', async () => {
      mockHandleQueueRemove.mockResolvedValue({
        success: false,
        error: 'No such item',
      });

      const result = await dispatch(registry, 'queue.remove', { id: 'missing-id' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'not_found',
        message: 'No such item',
      });
    });

    it('uses default message when legacy handler error is empty', async () => {
      mockHandleQueueRemove.mockResolvedValue({ success: false });

      const result = await dispatch(registry, 'queue.remove', { id: 'x' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'not_found',
        message: 'Item not found',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueueRemove.mockRejectedValue(new Error('DB error'));

      const result = await dispatch(registry, 'queue.remove', { id: 'item-1' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'DB error',
      });
    });
  });

  // ========================================================================
  // queue.reorder
  // ========================================================================

  describe('queue.reorder', () => {
    it('returns Ok with reordered items on success', async () => {
      const reorderedItems = [
        { id: 'item-2', position: 0 },
        { id: 'item-1', position: 1 },
      ];
      mockHandleQueueReorder.mockResolvedValue({ success: true, items: reorderedItems });

      const result = await dispatch(registry, 'queue.reorder', {
        id: 'item-1',
        newPosition: 1,
      });

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ items: reorderedItems });
      expect(mockHandleQueueReorder).toHaveBeenCalledWith({ id: 'item-1', newPosition: 1 });
    });

    it('returns invalid_params when id is missing', async () => {
      const result = await dispatch(registry, 'queue.reorder', { newPosition: 0 });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'id and newPosition are required',
      });
      expect(mockHandleQueueReorder).not.toHaveBeenCalled();
    });

    it('returns invalid_params when newPosition is missing', async () => {
      const result = await dispatch(registry, 'queue.reorder', { id: 'item-1' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'id and newPosition are required',
      });
    });

    it('returns invalid_params when newPosition is not a number', async () => {
      const result = await dispatch(registry, 'queue.reorder', {
        id: 'item-1',
        newPosition: 'first',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual(
        expect.objectContaining({ type: 'invalid_params' }),
      );
    });

    it('accepts newPosition of 0', async () => {
      mockHandleQueueReorder.mockResolvedValue({
        success: true,
        items: [{ id: 'item-1', position: 0 }],
      });

      const result = await dispatch(registry, 'queue.reorder', {
        id: 'item-1',
        newPosition: 0,
      });

      expect(result.ok).toBe(true);
    });

    it('returns operation_failed when legacy handler reports failure', async () => {
      mockHandleQueueReorder.mockResolvedValue({
        success: false,
        items: [],
        error: 'Position out of range',
      });

      const result = await dispatch(registry, 'queue.reorder', {
        id: 'item-1',
        newPosition: 99,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Position out of range',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueueReorder.mockRejectedValue(new Error('Concurrent modification'));

      const result = await dispatch(registry, 'queue.reorder', {
        id: 'item-1',
        newPosition: 1,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Concurrent modification',
      });
    });
  });

  // ========================================================================
  // queue.updateStatus
  // ========================================================================

  describe('queue.updateStatus', () => {
    it('returns Ok with success: true on status update', async () => {
      mockHandleQueueUpdateStatus.mockResolvedValue({ success: true });

      const result = await dispatch(registry, 'queue.updateStatus', {
        id: 'item-1',
        status: 'reading',
      });

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ success: true });
      expect(mockHandleQueueUpdateStatus).toHaveBeenCalledWith({
        id: 'item-1',
        status: 'reading',
      });
    });

    it('returns invalid_params when id is missing', async () => {
      const result = await dispatch(registry, 'queue.updateStatus', { status: 'reading' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'id and status are required',
      });
      expect(mockHandleQueueUpdateStatus).not.toHaveBeenCalled();
    });

    it('returns invalid_params when status is missing', async () => {
      const result = await dispatch(registry, 'queue.updateStatus', { id: 'item-1' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'id and status are required',
      });
    });

    it('returns operation_failed when legacy handler reports failure', async () => {
      mockHandleQueueUpdateStatus.mockResolvedValue({
        success: false,
        error: 'Invalid status transition',
      });

      const result = await dispatch(registry, 'queue.updateStatus', {
        id: 'item-1',
        status: 'completed',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Invalid status transition',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueueUpdateStatus.mockRejectedValue(new Error('Lock timeout'));

      const result = await dispatch(registry, 'queue.updateStatus', {
        id: 'item-1',
        status: 'archived',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Lock timeout',
      });
    });
  });

  // ========================================================================
  // queue.updateProgress
  // ========================================================================

  describe('queue.updateProgress', () => {
    it('returns Ok with success: true on progress update', async () => {
      mockHandleQueueUpdateProgress.mockResolvedValue({ success: true });

      const result = await dispatch(registry, 'queue.updateProgress', {
        id: 'item-1',
        progress: 0.5,
        lastParagraphIndex: 3,
      });

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ success: true });
      expect(mockHandleQueueUpdateProgress).toHaveBeenCalledWith({
        id: 'item-1',
        progress: 0.5,
        lastParagraphIndex: 3,
      });
    });

    it('accepts progress of 0', async () => {
      mockHandleQueueUpdateProgress.mockResolvedValue({ success: true });

      const result = await dispatch(registry, 'queue.updateProgress', {
        id: 'item-1',
        progress: 0,
      });

      expect(result.ok).toBe(true);
    });

    it('returns invalid_params when id is missing', async () => {
      const result = await dispatch(registry, 'queue.updateProgress', { progress: 0.5 });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'id and progress are required',
      });
      expect(mockHandleQueueUpdateProgress).not.toHaveBeenCalled();
    });

    it('returns invalid_params when progress is missing', async () => {
      const result = await dispatch(registry, 'queue.updateProgress', { id: 'item-1' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'id and progress are required',
      });
    });

    it('returns invalid_params when progress is not a number', async () => {
      const result = await dispatch(registry, 'queue.updateProgress', {
        id: 'item-1',
        progress: 'half',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual(
        expect.objectContaining({ type: 'invalid_params' }),
      );
    });

    it('returns operation_failed when legacy handler reports failure', async () => {
      mockHandleQueueUpdateProgress.mockResolvedValue({
        success: false,
        error: 'Item locked',
      });

      const result = await dispatch(registry, 'queue.updateProgress', {
        id: 'item-1',
        progress: 0.75,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Item locked',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueueUpdateProgress.mockRejectedValue(new Error('Write failed'));

      const result = await dispatch(registry, 'queue.updateProgress', {
        id: 'item-1',
        progress: 0.5,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Write failed',
      });
    });
  });

  // ========================================================================
  // queue.clear
  // ========================================================================

  describe('queue.clear', () => {
    it('returns Ok with removedCount on success', async () => {
      mockHandleQueueClear.mockResolvedValue({ success: true, removedCount: 3 });

      const result = await dispatch(registry, 'queue.clear', { filter: 'completed' });

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ removedCount: 3 });
      expect(mockHandleQueueClear).toHaveBeenCalledWith({ filter: 'completed' });
    });

    it('works with no filter (clears all)', async () => {
      mockHandleQueueClear.mockResolvedValue({ success: true, removedCount: 10 });

      const result = await dispatch(registry, 'queue.clear', {});

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ removedCount: 10 });
      expect(mockHandleQueueClear).toHaveBeenCalledWith({ filter: undefined });
    });

    it('returns operation_failed when legacy handler reports failure', async () => {
      mockHandleQueueClear.mockResolvedValue({
        success: false,
        removedCount: 0,
        error: 'Queue is locked',
      });

      const result = await dispatch(registry, 'queue.clear', { filter: 'all' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Queue is locked',
      });
    });

    it('uses default message when legacy handler error is empty', async () => {
      mockHandleQueueClear.mockResolvedValue({ success: false, removedCount: 0 });

      const result = await dispatch(registry, 'queue.clear', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Failed to clear queue',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueueClear.mockRejectedValue(new Error('Transaction aborted'));

      const result = await dispatch(registry, 'queue.clear', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Transaction aborted',
      });
    });
  });

  // ========================================================================
  // queue.getState
  // ========================================================================

  describe('queue.getState', () => {
    const mockState = {
      metadata: { version: 1, count: 2, lastModified: 1700000000, totalSize: 1024 },
      items: [
        {
          id: 'item-1',
          url: 'https://example.com/a',
          title: 'Article A',
          domain: 'example.com',
          position: 0,
          status: 'pending' as const,
          progress: 0,
          addedAt: 1700000000,
        },
        {
          id: 'item-2',
          url: 'https://example.com/b',
          title: 'Article B',
          domain: 'example.com',
          position: 1,
          status: 'reading' as const,
          progress: 0.3,
          addedAt: 1700000001,
        },
      ],
    };

    it('returns Ok with metadata and items on success', async () => {
      mockHandleQueueGetState.mockResolvedValue(mockState);

      const result = await dispatch(registry, 'queue.getState', {});

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        metadata: mockState.metadata,
        items: mockState.items,
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueueGetState.mockRejectedValue(new Error('Storage unavailable'));

      const result = await dispatch(registry, 'queue.getState', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Storage unavailable',
      });
    });
  });

  // ========================================================================
  // queue.getItem
  // ========================================================================

  describe('queue.getItem', () => {
    const mockItem = {
      id: 'item-1',
      url: 'https://example.com/a',
      title: 'Article A',
      domain: 'example.com',
      position: 0,
      status: 'pending' as const,
      progress: 0,
      addedAt: 1700000000,
    };

    it('returns Ok with item on success', async () => {
      mockHandleQueueGetItem.mockResolvedValue({ success: true, item: mockItem });

      const result = await dispatch(registry, 'queue.getItem', { id: 'item-1' });

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ item: mockItem });
      expect(mockHandleQueueGetItem).toHaveBeenCalledWith({ id: 'item-1' });
    });

    it('returns invalid_params when id is missing', async () => {
      const result = await dispatch(registry, 'queue.getItem', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'invalid_params',
        message: 'id is required',
      });
      expect(mockHandleQueueGetItem).not.toHaveBeenCalled();
    });

    it('returns not_found when legacy handler reports item not found', async () => {
      mockHandleQueueGetItem.mockResolvedValue({
        success: false,
        error: 'Item not found',
      });

      const result = await dispatch(registry, 'queue.getItem', { id: 'missing-id' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'not_found',
        message: 'Item not found',
      });
    });

    it('returns not_found when item is null/undefined', async () => {
      mockHandleQueueGetItem.mockResolvedValue({
        success: true,
        item: undefined,
      });

      const result = await dispatch(registry, 'queue.getItem', { id: 'item-1' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'not_found',
        message: 'Item not found',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueueGetItem.mockRejectedValue(new Error('Corrupted data'));

      const result = await dispatch(registry, 'queue.getItem', { id: 'item-1' });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Corrupted data',
      });
    });
  });

  // ========================================================================
  // queue.play
  // ========================================================================

  describe('queue.play', () => {
    it('returns Ok with currentItem on success', async () => {
      mockHandleQueuePlay.mockResolvedValue({
        success: true,
        currentItem: { id: 'item-1', url: 'https://example.com', title: 'Article' },
      });

      const result = await dispatch(registry, 'queue.play', {});

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        currentItem: { id: 'item-1', url: 'https://example.com', title: 'Article' },
      });
    });

    it('passes startFromId to legacy handler', async () => {
      mockHandleQueuePlay.mockResolvedValue({
        success: true,
        currentItem: { id: 'item-3', url: 'https://example.com/3', title: 'Third' },
      });

      await dispatch(registry, 'queue.play', { startFromId: 'item-3' });

      expect(mockHandleQueuePlay).toHaveBeenCalledWith({ startFromId: 'item-3' });
    });

    it('works without startFromId', async () => {
      mockHandleQueuePlay.mockResolvedValue({
        success: true,
        currentItem: { id: 'item-1', url: 'https://example.com', title: 'First' },
      });

      await dispatch(registry, 'queue.play', {});

      expect(mockHandleQueuePlay).toHaveBeenCalledWith({ startFromId: undefined });
    });

    it('returns operation_failed when no items to play', async () => {
      mockHandleQueuePlay.mockResolvedValue({
        success: false,
        error: 'No items to play',
      });

      const result = await dispatch(registry, 'queue.play', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'No items to play',
      });
    });

    it('uses default message when legacy handler error is empty', async () => {
      mockHandleQueuePlay.mockResolvedValue({ success: false });

      const result = await dispatch(registry, 'queue.play', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'No items to play',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueuePlay.mockRejectedValue(new Error('Audio device busy'));

      const result = await dispatch(registry, 'queue.play', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Audio device busy',
      });
    });
  });

  // ========================================================================
  // queue.playNext
  // ========================================================================

  describe('queue.playNext', () => {
    it('returns Ok with currentItem and hasMore on success', async () => {
      mockHandleQueuePlayNext.mockResolvedValue({
        success: true,
        currentItem: { id: 'item-2', url: 'https://example.com/2', title: 'Next' },
        hasMore: true,
      });

      const result = await dispatch(registry, 'queue.playNext', {});

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        currentItem: { id: 'item-2', url: 'https://example.com/2', title: 'Next' },
        hasMore: true,
      });
    });

    it('returns Ok when at end of queue (no more items)', async () => {
      mockHandleQueuePlayNext.mockResolvedValue({
        success: true,
        currentItem: undefined,
        hasMore: false,
      });

      const result = await dispatch(registry, 'queue.playNext', {});

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        currentItem: undefined,
        hasMore: false,
      });
    });

    it('returns operation_failed when legacy handler reports failure', async () => {
      mockHandleQueuePlayNext.mockResolvedValue({
        success: false,
        hasMore: false,
        error: 'Player not initialized',
      });

      const result = await dispatch(registry, 'queue.playNext', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Player not initialized',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueuePlayNext.mockRejectedValue(new Error('Playback error'));

      const result = await dispatch(registry, 'queue.playNext', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Playback error',
      });
    });
  });

  // ========================================================================
  // queue.playPrevious
  // ========================================================================

  describe('queue.playPrevious', () => {
    it('returns Ok with currentItem on success', async () => {
      mockHandleQueuePlayPrevious.mockResolvedValue({
        success: true,
        currentItem: { id: 'item-1', url: 'https://example.com/1', title: 'Previous' },
      });

      const result = await dispatch(registry, 'queue.playPrevious', {});

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({
        currentItem: { id: 'item-1', url: 'https://example.com/1', title: 'Previous' },
      });
    });

    it('returns Ok when at start of queue (no previous)', async () => {
      mockHandleQueuePlayPrevious.mockResolvedValue({
        success: true,
        currentItem: undefined,
      });

      const result = await dispatch(registry, 'queue.playPrevious', {});

      expect(result.ok).toBe(true);
      expect(result.value).toEqual({ currentItem: undefined });
    });

    it('returns operation_failed when legacy handler reports failure', async () => {
      mockHandleQueuePlayPrevious.mockResolvedValue({
        success: false,
        error: 'No previous track',
      });

      const result = await dispatch(registry, 'queue.playPrevious', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'No previous track',
      });
    });

    it('uses default message when legacy handler error is empty', async () => {
      mockHandleQueuePlayPrevious.mockResolvedValue({ success: false });

      const result = await dispatch(registry, 'queue.playPrevious', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'Failed to play previous',
      });
    });

    it('returns operation_failed when legacy handler throws', async () => {
      mockHandleQueuePlayPrevious.mockRejectedValue(new Error('State corruption'));

      const result = await dispatch(registry, 'queue.playPrevious', {});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({
        type: 'operation_failed',
        message: 'State corruption',
      });
    });
  });
});
