/**
 * VoxPage Log Entry Model
 * Represents a single log event for remote logging
 *
 * @module background/log-entry
 * @description LogEntry model with validation for Loki ingestion (014-loki-remote-logging)
 */

import { LOG_LEVELS, COMPONENTS, loggingConstants } from '../shared/config/logging-defaults.js';

/**
 * Create a validated LogEntry object
 *
 * @param {Object} params - Log entry parameters
 * @param {string} params.level - Log level: 'debug' | 'info' | 'warn' | 'error'
 * @param {string} params.message - Log message content
 * @param {string} params.component - Source component: 'background' | 'content' | 'popup' | 'options'
 * @param {Object} [params.metadata] - Optional structured metadata
 * @returns {Object|null} Validated LogEntry or null if invalid
 */
export function createLogEntry({ level, message, component, metadata = null }) {
  // Validate level
  if (!LOG_LEVELS.includes(level)) {
    console.warn(`LogEntry: Invalid level "${level}", must be one of: ${LOG_LEVELS.join(', ')}`);
    return null;
  }

  // Validate component
  if (!COMPONENTS.includes(component)) {
    console.warn(`LogEntry: Invalid component "${component}", must be one of: ${COMPONENTS.join(', ')}`);
    return null;
  }

  // Validate message
  if (typeof message !== 'string' || message.length === 0) {
    console.warn('LogEntry: Message must be a non-empty string');
    return null;
  }

  // Truncate message if too long
  let truncatedMessage = message;
  if (message.length > loggingConstants.maxMessageBytes) {
    truncatedMessage = message.substring(0, loggingConstants.maxMessageBytes - 3) + '...';
  }

  // Validate and sanitize metadata
  let sanitizedMetadata = null;
  if (metadata !== null && typeof metadata === 'object') {
    try {
      const metadataStr = JSON.stringify(metadata);
      if (metadataStr.length <= loggingConstants.maxMetadataBytes) {
        sanitizedMetadata = metadata;
      } else {
        console.warn('LogEntry: Metadata exceeds size limit, omitting');
      }
    } catch {
      console.warn('LogEntry: Metadata not serializable, omitting');
    }
  }

  return {
    timestamp: generateTimestamp(),
    level,
    message: truncatedMessage,
    component,
    metadata: sanitizedMetadata,
  };
}

/**
 * Generate Loki-compatible nanosecond timestamp
 * Loki requires timestamps as 19-digit nanosecond strings
 *
 * @returns {string} 19-digit nanosecond timestamp as string
 */
export function generateTimestamp() {
  // Date.now() returns milliseconds, multiply by 1e6 for nanoseconds
  const ns = BigInt(Date.now()) * BigInt(1000000);
  return ns.toString();
}

/**
 * Validate an existing LogEntry object
 *
 * @param {Object} entry - LogEntry to validate
 * @returns {boolean} True if valid
 */
export function validateLogEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  // Required fields
  if (typeof entry.timestamp !== 'string' || entry.timestamp.length !== 19) {
    return false;
  }

  if (!LOG_LEVELS.includes(entry.level)) {
    return false;
  }

  if (typeof entry.message !== 'string' || entry.message.length === 0) {
    return false;
  }

  if (!COMPONENTS.includes(entry.component)) {
    return false;
  }

  // Optional metadata must be object or null
  if (entry.metadata !== null && typeof entry.metadata !== 'object') {
    return false;
  }

  return true;
}

/**
 * Calculate approximate byte size of a LogEntry
 * Used for buffer size tracking
 *
 * @param {Object} entry - LogEntry to measure
 * @returns {number} Approximate size in bytes
 */
export function getEntrySize(entry) {
  if (!entry) return 0;

  // Base size: timestamp (19) + level (~5) + component (~10) + overhead (~20)
  let size = 54;

  // Message size (UTF-8 can be up to 4 bytes per char, estimate 1.5 average)
  size += Math.ceil(entry.message.length * 1.5);

  // Metadata size
  if (entry.metadata) {
    try {
      size += JSON.stringify(entry.metadata).length;
    } catch {
      // Ignore serialization errors
    }
  }

  return size;
}

/**
 * Serialize LogEntry for Loki values array
 * Returns [timestamp, message] or [timestamp, message, metadata]
 *
 * @param {Object} entry - LogEntry to serialize
 * @returns {Array} Loki values tuple
 */
export function serializeForLoki(entry) {
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    return [entry.timestamp, entry.message, entry.metadata];
  }
  return [entry.timestamp, entry.message];
}

export default {
  createLogEntry,
  generateTimestamp,
  validateLogEntry,
  getEntrySize,
  serializeForLoki,
};
