/**
 * Prefetch Message Handlers
 *
 * Handlers for prefetch-related messages in the hexagonal architecture.
 * These handlers manage audio prefetching for upcoming paragraphs.
 *
 * @module handlers/prefetch
 */

import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';
import { playbackQueue, prefetchService } from '../utils/playback';
import type { HandlerRegistry } from './registry';

/**
 * Prefetch handler error type.
 */
export type PrefetchHandlerError =
  | { type: 'not_configured'; message: string }
  | { type: 'invalid_params'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * Response for prefetch.start handler.
 */
export interface PrefetchStartResponse {
  success: boolean;
  queuedCount: number;
  error?: string;
}

/**
 * Response for prefetch.stop handler.
 */
export interface PrefetchStopResponse {
  success: boolean;
}

/**
 * Response for prefetch.getStatus handler.
 */
export interface PrefetchStatusResponse {
  isActive: boolean;
  bufferSize: number;
  bufferedIndices: number[];
  pendingTasks: number;
  inProgressTasks: number;
}

/**
 * Response for prefetch.clearBuffer handler.
 */
export interface PrefetchClearBufferResponse {
  success: boolean;
  clearedCount: number;
}

/**
 * Parameters for prefetch.start handler.
 */
export interface PrefetchStartParams {
  currentIndex?: number;
}

/**
 * Parameters for prefetch.clearBuffer handler.
 */
export interface PrefetchClearBufferParams {
  keepIndices?: number[];
}

/**
 * Register prefetch message handlers on the registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerPrefetchHandlers(registry: HandlerRegistry): void {
  /**
   * Start prefetching from current position.
   *
   * Configures and starts the prefetch service to fetch audio for upcoming paragraphs.
   */
  registry.register<
    PrefetchStartParams | undefined,
    Result<PrefetchStartResponse, PrefetchHandlerError>
  >(
    'prefetch.start',
    async (params) => {
      try {
        const currentIndex = params?.currentIndex ?? 0;

        // Check if queue has paragraphs
        const queueState = playbackQueue.getState();
        if (queueState.totalItems === 0) {
          return Ok({
            success: false,
            queuedCount: 0,
            error: 'No paragraphs loaded',
          });
        }

        // Jump to the specified index and start prefetching
        playbackQueue.jumpTo(currentIndex);
        prefetchService.start();

        const status = prefetchService.getStatus();
        return Ok({
          success: true,
          queuedCount: status.pendingTasks,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Start audio prefetching from position',
  );

  /**
   * Stop prefetching.
   *
   * Stops the prefetch service and clears pending tasks.
   */
  registry.register<void, Result<PrefetchStopResponse, PrefetchHandlerError>>(
    'prefetch.stop',
    async () => {
      try {
        prefetchService.stop();
        prefetchService.clearBuffer();
        return Ok({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Stop audio prefetching',
  );

  /**
   * Get prefetch status.
   *
   * Returns current status of the prefetch service including buffer state.
   */
  registry.register<void, Result<PrefetchStatusResponse, PrefetchHandlerError>>(
    'prefetch.getStatus',
    async () => {
      try {
        const status = prefetchService.getStatus();
        return Ok({
          isActive: status.isActive,
          bufferSize: status.bufferSize,
          bufferedIndices: status.bufferedIndices,
          pendingTasks: status.pendingTasks,
          inProgressTasks: status.inProgressTasks,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Get prefetch service status',
  );

  /**
   * Clear prefetch buffer.
   *
   * Clears the prefetch buffer, optionally keeping specific indices.
   */
  registry.register<
    PrefetchClearBufferParams | undefined,
    Result<PrefetchClearBufferResponse, PrefetchHandlerError>
  >(
    'prefetch.clearBuffer',
    async (params) => {
      try {
        const keepIndices = params?.keepIndices;
        const previousSize = prefetchService.getStatus().bufferSize;

        prefetchService.clearBuffer(keepIndices);

        const newSize = prefetchService.getStatus().bufferSize;
        return Ok({
          success: true,
          clearedCount: previousSize - newSize,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err({ type: 'operation_failed', message });
      }
    },
    'Clear prefetch buffer',
  );
}
