/**
 * Dispatch Logger
 *
 * Tracks message dispatch statistics for the hexagonal architecture migration.
 * Provides insight into how many messages use hex vs legacy handlers.
 *
 * @module utils/telemetry/dispatch-logger
 */

import { createLogger } from '../logging/logger';
import type { DispatchEvent, DispatchStats, DispatchSummary, MessageStats } from './types';

const log = createLogger('service');

/**
 * In-memory dispatch statistics storage.
 * Reset when service worker restarts.
 */
let stats: DispatchStats = createEmptyStats();

/**
 * Create empty stats object.
 */
function createEmptyStats(): DispatchStats {
  const now = Date.now();
  return {
    hexTotal: 0,
    legacyTotal: 0,
    unknownTotal: 0,
    hexPercentage: 0,
    byType: {},
    unknownTypes: {},
    startTime: now,
    lastReset: now,
  };
}

/**
 * Update percentage calculation.
 */
function updatePercentage(): void {
  const total = stats.hexTotal + stats.legacyTotal;
  stats.hexPercentage = total > 0 ? Math.round((stats.hexTotal / total) * 100) : 0;
}

/**
 * Log a dispatch event.
 *
 * @param event - The dispatch event to log
 */
export function logDispatch(event: DispatchEvent): void {
  const { type, path, timestamp } = event;

  // Handle unknown messages separately
  if (path === 'unknown') {
    stats.unknownTotal++;
    if (!stats.unknownTypes[type]) {
      stats.unknownTypes[type] = { count: 0, lastSeen: 0 };
    }
    stats.unknownTypes[type].count++;
    stats.unknownTypes[type].lastSeen = timestamp;

    // Log unknown messages in dev mode
    if (process.env.NODE_ENV === 'development') {
      log.debug(`\x1b[31m✗ [Dispatch] ${type} → unknown (${event.durationMs}ms)\x1b[0m`);
    }
    return;
  }

  // Initialize stats for this message type if needed
  if (!stats.byType[type]) {
    stats.byType[type] = {
      type,
      hexCount: 0,
      legacyCount: 0,
      lastDispatch: 0,
    };
  }

  // Update counts
  if (path === 'hex') {
    stats.hexTotal++;
    stats.byType[type].hexCount++;
  } else {
    stats.legacyTotal++;
    stats.byType[type].legacyCount++;
  }

  stats.byType[type].lastDispatch = timestamp;
  updatePercentage();

  // Log in dev mode for debugging
  if (process.env.NODE_ENV === 'development') {
    const symbol = path === 'hex' ? '⬡' : '▢';
    const color = path === 'hex' ? '\x1b[32m' : '\x1b[33m';
    log.debug(
      `${color}${symbol} [Dispatch] ${type} → ${path} (${event.durationMs}ms)${event.success ? '' : ' FAILED'}\x1b[0m`,
    );
  }
}

/**
 * Get current dispatch statistics.
 *
 * @returns Current dispatch stats
 */
export function getDispatchStats(): DispatchStats {
  return { ...stats };
}

/**
 * Get dispatch summary with handler analysis.
 *
 * @param hexHandlerNames - List of registered hex handler names
 * @param legacyHandlerNames - List of legacy handler names
 * @returns Dispatch summary
 */
export function getDispatchSummary(
  hexHandlerNames: string[],
  legacyHandlerNames: string[],
): DispatchSummary {
  const hexSet = new Set(hexHandlerNames);
  const _legacySet = new Set(legacyHandlerNames);

  const migratedHandlers: string[] = [];
  const legacyOnlyHandlers: string[] = [];

  for (const legacy of legacyHandlerNames) {
    // Check if there's a hex equivalent (either exact match or mapped)
    if (hexSet.has(legacy)) {
      migratedHandlers.push(legacy);
    } else {
      legacyOnlyHandlers.push(legacy);
    }
  }

  return {
    stats: getDispatchStats(),
    hexHandlers: hexHandlerNames,
    legacyOnlyHandlers,
    migratedHandlers,
  };
}

/**
 * Reset dispatch statistics.
 */
export function resetDispatchStats(): void {
  stats = createEmptyStats();
}

/**
 * Get stats for a specific message type.
 *
 * @param type - Message type to get stats for
 * @returns Message stats or undefined if not found
 */
export function getMessageStats(type: string): MessageStats | undefined {
  return stats.byType[type] ? { ...stats.byType[type] } : undefined;
}

/**
 * Get all message types that have been dispatched.
 *
 * @returns List of message types
 */
export function getTrackedMessageTypes(): string[] {
  return Object.keys(stats.byType);
}

/**
 * Check if a message type is using hex path exclusively.
 *
 * @param type - Message type to check
 * @returns True if all dispatches used hex path
 */
export function isFullyMigrated(type: string): boolean {
  const typeStats = stats.byType[type];
  if (!typeStats) return false;
  return typeStats.legacyCount === 0 && typeStats.hexCount > 0;
}

/**
 * Get list of message types that need migration.
 *
 * @returns Message types still using legacy path
 */
export function getPendingMigrations(): string[] {
  return Object.entries(stats.byType)
    .filter(([, s]) => s.legacyCount > 0)
    .map(([type]) => type);
}

/**
 * Log an unknown message type.
 * Convenience function for tracking messages with no handler.
 *
 * @param type - The unknown message type
 */
export function logUnknownMessage(type: string): void {
  logDispatch({
    type,
    path: 'unknown',
    durationMs: 0,
    success: false,
    error: 'No handler found',
    timestamp: Date.now(),
  });
}

/**
 * Get unknown message statistics.
 *
 * @returns Unknown message stats including count and types
 */
export function getUnknownMessageStats(): {
  total: number;
  types: Record<string, { count: number; lastSeen: number }>;
} {
  return {
    total: stats.unknownTotal,
    types: { ...stats.unknownTypes },
  };
}

/**
 * Export for testing and debugging.
 */
export const _internal = {
  createEmptyStats,
  updatePercentage,
};
