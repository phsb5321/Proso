/**
 * Telemetry Module
 *
 * Exports for dispatch telemetry tracking.
 *
 * @module utils/telemetry
 */

export {
  getDispatchStats,
  getDispatchSummary,
  getMessageStats,
  getTrackedMessageTypes,
  isFullyMigrated,
  getPendingMigrations,
  logDispatch,
  resetDispatchStats,
} from './dispatch-logger';

export type {
  DispatchEvent,
  DispatchStats,
  DispatchSummary,
  MessageStats,
} from './types';
