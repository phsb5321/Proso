/**
 * Queue Message Handlers
 *
 * Handlers for reading queue messages in the hexagonal architecture.
 * These handlers wrap existing queue handlers with Result<T,E> error handling.
 *
 * @module handlers/queue
 */

import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import {
  handleQueueAdd,
  handleQueueRemove,
  handleQueueReorder,
  handleQueueUpdateStatus,
  handleQueueUpdateProgress,
  handleQueueClear,
  handleQueueGetState,
  handleQueueGetItem,
  handleQueuePlay,
  handleQueuePlayNext,
  handleQueuePlayPrevious,
} from '../utils/messaging/handlers/queue';
import type { HandlerRegistry } from './registry';

/**
 * Queue handler error type.
 */
export type QueueHandlerError =
  | { type: 'invalid_params'; message: string }
  | { type: 'not_found'; message: string }
  | { type: 'operation_failed'; message: string };

// ============================================================================
// Parameter Types
// ============================================================================

/**
 * Queue add parameters.
 */
export interface QueueAddParams {
  url: string;
  title: string;
  excerpt?: string;
  author?: string;
  faviconUrl?: string;
  language?: string;
  estimatedReadTime?: number;
}

/**
 * Queue remove parameters.
 */
export interface QueueRemoveParams {
  id: string;
}

/**
 * Queue reorder parameters.
 */
export interface QueueReorderParams {
  id: string;
  newPosition: number;
}

/**
 * Queue update status parameters.
 */
export interface QueueUpdateStatusParams {
  id: string;
  status: 'pending' | 'reading' | 'completed' | 'archived';
}

/**
 * Queue update progress parameters.
 */
export interface QueueUpdateProgressParams {
  id: string;
  progress: number;
  lastParagraphIndex?: number;
}

/**
 * Queue clear parameters.
 */
export interface QueueClearParams {
  filter?: 'all' | 'completed' | 'archived';
}

/**
 * Queue get item parameters.
 */
export interface QueueGetItemParams {
  id: string;
}

/**
 * Queue play parameters.
 */
export interface QueuePlayParams {
  startFromId?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Queue add response.
 */
export interface QueueAddResponse {
  id: string;
  position: number;
}

/**
 * Queue reorder response.
 */
export interface QueueReorderResponse {
  items: Array<{ id: string; position: number }>;
}

/**
 * Queue clear response.
 */
export interface QueueClearResponse {
  removedCount: number;
}

/**
 * Queue item info.
 */
export interface QueueItemInfo {
  id: string;
  url: string;
  title: string;
  domain: string;
  excerpt?: string;
  author?: string;
  faviconUrl?: string;
  language?: string;
  estimatedReadTime?: number;
  position: number;
  status: 'pending' | 'reading' | 'completed' | 'archived';
  progress: number;
  lastParagraphIndex?: number;
  addedAt: number;
}

/**
 * Queue state response.
 */
export interface QueueStateResponse {
  metadata: {
    version: number;
    count: number;
    lastModified: number;
    totalSize: number;
  };
  items: QueueItemInfo[];
}

/**
 * Queue get item response.
 */
export interface QueueGetItemResponse {
  item: QueueItemInfo;
}

/**
 * Queue play response.
 */
export interface QueuePlayResponse {
  currentItem?: {
    id: string;
    url: string;
    title: string;
  };
}

/**
 * Queue play next response.
 */
export interface QueuePlayNextResponse {
  currentItem?: {
    id: string;
    url: string;
    title: string;
  };
  hasMore: boolean;
}

/**
 * Queue play previous response.
 */
export interface QueuePlayPreviousResponse {
  currentItem?: {
    id: string;
    url: string;
    title: string;
  };
}

/**
 * Register queue message handlers on the registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerQueueHandlers(registry: HandlerRegistry): void {
  /**
   * Add an article to the reading queue.
   */
  registry.register<QueueAddParams, Result<QueueAddResponse, QueueHandlerError>>(
    'queue.add',
    async (params) => {
      if (!params?.url || !params?.title) {
        return Err({
          type: 'invalid_params',
          message: 'url and title are required',
        });
      }

      try {
        const result = await handleQueueAdd({
          url: params.url,
          title: params.title,
          excerpt: params.excerpt,
          author: params.author,
          faviconUrl: params.faviconUrl,
          language: params.language,
          estimatedReadTime: params.estimatedReadTime,
        });

        if (!result.success) {
          return Err({
            type: 'operation_failed',
            message: result.error || 'Failed to add to queue',
          });
        }

        return Ok({
          id: result.id,
          position: result.position,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Add article to reading queue',
  );

  /**
   * Remove an article from the queue.
   */
  registry.register<QueueRemoveParams, Result<{ success: boolean }, QueueHandlerError>>(
    'queue.remove',
    async (params) => {
      if (!params?.id) {
        return Err({
          type: 'invalid_params',
          message: 'id is required',
        });
      }

      try {
        const result = await handleQueueRemove({ id: params.id });

        if (!result.success) {
          return Err({
            type: 'not_found',
            message: result.error || 'Item not found',
          });
        }

        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Remove article from queue',
  );

  /**
   * Reorder an article in the queue.
   */
  registry.register<QueueReorderParams, Result<QueueReorderResponse, QueueHandlerError>>(
    'queue.reorder',
    async (params) => {
      if (!params?.id || typeof params?.newPosition !== 'number') {
        return Err({
          type: 'invalid_params',
          message: 'id and newPosition are required',
        });
      }

      try {
        const result = await handleQueueReorder({
          id: params.id,
          newPosition: params.newPosition,
        });

        if (!result.success) {
          return Err({
            type: 'operation_failed',
            message: result.error || 'Failed to reorder',
          });
        }

        return Ok({
          items: result.items,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Reorder article in queue',
  );

  /**
   * Update the status of a queue item.
   */
  registry.register<QueueUpdateStatusParams, Result<{ success: boolean }, QueueHandlerError>>(
    'queue.updateStatus',
    async (params) => {
      if (!params?.id || !params?.status) {
        return Err({
          type: 'invalid_params',
          message: 'id and status are required',
        });
      }

      try {
        const result = await handleQueueUpdateStatus({
          id: params.id,
          status: params.status,
        });

        if (!result.success) {
          return Err({
            type: 'operation_failed',
            message: result.error || 'Failed to update status',
          });
        }

        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Update queue item status',
  );

  /**
   * Update the reading progress of a queue item.
   */
  registry.register<QueueUpdateProgressParams, Result<{ success: boolean }, QueueHandlerError>>(
    'queue.updateProgress',
    async (params) => {
      if (!params?.id || typeof params?.progress !== 'number') {
        return Err({
          type: 'invalid_params',
          message: 'id and progress are required',
        });
      }

      try {
        const result = await handleQueueUpdateProgress({
          id: params.id,
          progress: params.progress,
          lastParagraphIndex: params.lastParagraphIndex,
        });

        if (!result.success) {
          return Err({
            type: 'operation_failed',
            message: result.error || 'Failed to update progress',
          });
        }

        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Update queue item progress',
  );

  /**
   * Clear queue items by filter.
   */
  registry.register<QueueClearParams, Result<QueueClearResponse, QueueHandlerError>>(
    'queue.clear',
    async (params) => {
      try {
        const result = await handleQueueClear({
          filter: params?.filter,
        });

        if (!result.success) {
          return Err({
            type: 'operation_failed',
            message: result.error || 'Failed to clear queue',
          });
        }

        return Ok({
          removedCount: result.removedCount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Clear queue items',
  );

  /**
   * Get the full queue state.
   */
  registry.register<Record<string, never>, Result<QueueStateResponse, QueueHandlerError>>(
    'queue.getState',
    async () => {
      try {
        const result = await handleQueueGetState(undefined as unknown as void);

        return Ok({
          metadata: result.metadata,
          items: result.items as QueueItemInfo[],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get full queue state',
  );

  /**
   * Get a single queue item by ID.
   */
  registry.register<QueueGetItemParams, Result<QueueGetItemResponse, QueueHandlerError>>(
    'queue.getItem',
    async (params) => {
      if (!params?.id) {
        return Err({
          type: 'invalid_params',
          message: 'id is required',
        });
      }

      try {
        const result = await handleQueueGetItem({ id: params.id });

        if (!result.success || !result.item) {
          return Err({
            type: 'not_found',
            message: result.error || 'Item not found',
          });
        }

        return Ok({
          item: result.item as QueueItemInfo,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get queue item by ID',
  );

  /**
   * Start playing the queue.
   */
  registry.register<QueuePlayParams, Result<QueuePlayResponse, QueueHandlerError>>(
    'queue.play',
    async (params) => {
      try {
        const result = await handleQueuePlay({
          startFromId: params?.startFromId,
        });

        if (!result.success) {
          return Err({
            type: 'operation_failed',
            message: result.error || 'No items to play',
          });
        }

        return Ok({
          currentItem: result.currentItem,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Start playing queue',
  );

  /**
   * Skip to the next item in the queue.
   */
  registry.register<Record<string, never>, Result<QueuePlayNextResponse, QueueHandlerError>>(
    'queue.playNext',
    async () => {
      try {
        const result = await handleQueuePlayNext(undefined as unknown as void);

        if (!result.success) {
          return Err({
            type: 'operation_failed',
            message: result.error || 'Failed to play next',
          });
        }

        return Ok({
          currentItem: result.currentItem,
          hasMore: result.hasMore,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Play next item in queue',
  );

  /**
   * Go back to the previous item in the queue.
   */
  registry.register<Record<string, never>, Result<QueuePlayPreviousResponse, QueueHandlerError>>(
    'queue.playPrevious',
    async () => {
      try {
        const result = await handleQueuePlayPrevious(undefined as unknown as void);

        if (!result.success) {
          return Err({
            type: 'operation_failed',
            message: result.error || 'Failed to play previous',
          });
        }

        return Ok({
          currentItem: result.currentItem,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Play previous item in queue',
  );
}
