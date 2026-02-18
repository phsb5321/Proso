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
  getUnknownMessageStats,
  isFullyMigrated,
  getPendingMigrations,
  logDispatch,
  logUnknownMessage,
  resetDispatchStats,
} from './dispatch-logger';

export type {
  DispatchEvent,
  DispatchStats,
  DispatchSummary,
  MessageStats,
} from './types';
