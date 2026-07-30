/**
 * Debug Message Handlers
 *
 * Handlers for debugging and telemetry in the hexagonal architecture.
 * These handlers expose internal statistics for migration tracking.
 *
 * @module handlers/debug
 */

import { isContentExtractionServiceAvailable, isPlaybackServiceAvailable } from '../composition';
import { getContainerStatus } from '../composition/status';
import type { Result } from '../core/shared/result';
import { Ok } from '../core/shared/result';
import type { DispatchStats, DispatchSummary } from '../utils/telemetry';
import {
  getDispatchStats,
  getDispatchSummary,
  getUnknownMessageStats,
  resetDispatchStats,
} from '../utils/telemetry';
import type { HandlerRegistry } from './registry';

/**
 * Debug handler error type.
 */
export type DebugHandlerError = { type: 'operation_failed'; message: string };

/**
 * Hexagonal status response.
 */
export interface HexagonalStatusResponse {
  initialized: boolean;
  adapters: string[];
  services: string[];
  handlers: string[];
  playbackServiceAvailable: boolean;
  contentExtractionServiceAvailable: boolean;
}

/**
 * Register debug message handlers on the registry.
 *
 * @param registry - Handler registry to register on
 */
export function registerDebugHandlers(registry: HandlerRegistry): void {
  /**
   * Get hexagonal architecture status.
   */
  registry.register<void, Result<HexagonalStatusResponse, DebugHandlerError>>(
    'hexagonal.getStatus',
    async () => {
      const status = getContainerStatus(registry.getHandlerNames());
      return Ok({
        ...status,
        playbackServiceAvailable: isPlaybackServiceAvailable(),
        contentExtractionServiceAvailable: isContentExtractionServiceAvailable(),
      });
    },
    'Get hexagonal architecture status',
  );

  /**
   * Get dispatch statistics.
   */
  registry.register<void, Result<DispatchStats, DebugHandlerError>>(
    'hexagonal.getDispatchStats',
    async () => {
      return Ok(getDispatchStats());
    },
    'Get dispatch telemetry statistics',
  );

  /**
   * Get dispatch summary with migration analysis.
   */
  registry.register<{ legacyHandlers?: string[] }, Result<DispatchSummary, DebugHandlerError>>(
    'hexagonal.getDispatchSummary',
    async (params) => {
      return Ok(getDispatchSummary(registry.getHandlerNames(), params?.legacyHandlers ?? []));
    },
    'Get dispatch summary with migration analysis',
  );

  /**
   * Reset dispatch statistics.
   */
  registry.register<void, Result<{ success: boolean }, DebugHandlerError>>(
    'hexagonal.resetStats',
    async () => {
      resetDispatchStats();
      return Ok({ success: true });
    },
    'Reset dispatch statistics',
  );

  /**
   * Get unknown message statistics (T1.3).
   * Returns count and details of unhandled message types.
   */
  registry.register<
    void,
    Result<
      { total: number; types: Record<string, { count: number; lastSeen: number }> },
      DebugHandlerError
    >
  >(
    'hexagonal.getUnknownMessages',
    async () => {
      return Ok(getUnknownMessageStats());
    },
    'Get unknown message statistics',
  );
}
