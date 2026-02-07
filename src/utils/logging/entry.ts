// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 VoxPage Contributors. All rights reserved.
// Commercial licensing: https://voxpage.com/commercial

/**
 * VoxPage Log Entry Model
 * Represents a single log event for remote logging
 *
 * @module utils/logging/entry
 */

import { z } from 'zod';

/**
 * Log levels enum
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Log components enum
 */
export const COMPONENTS = [
  'background',
  'content',
  'popup',
  'options',
  'handler',
  'adapter',
  'service',
] as const;
export type Component = (typeof COMPONENTS)[number];

/**
 * Logging constants
 */
export const loggingConstants = {
  maxMessageBytes: 8192, // 8KB max message size
  maxMetadataBytes: 4096, // 4KB max metadata size
  maxBufferBytes: 1048576, // 1MB max buffer size
} as const;

/**
 * Log entry schema
 */
export const logEntrySchema = z.object({
  timestamp: z.string().length(19), // Nanosecond timestamp as 19-digit string
  level: z.enum(LOG_LEVELS),
  message: z.string().min(1).max(loggingConstants.maxMessageBytes),
  component: z.enum(COMPONENTS),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

/**
 * Parameters for creating a log entry
 */
export interface CreateLogEntryParams {
  level: LogLevel;
  message: string;
  component: Component;
  metadata?: Record<string, any> | null;
}

/**
 * Generate Loki-compatible nanosecond timestamp
 * Loki requires timestamps as 19-digit nanosecond strings
 */
export function generateTimestamp(): string {
  // Date.now() returns milliseconds, multiply by 1e6 for nanoseconds
  const ns = BigInt(Date.now()) * BigInt(1000000);
  return ns.toString();
}

/**
 * Create a validated LogEntry object
 * @param params - Log entry parameters
 * @returns Validated LogEntry or null if invalid
 */
export function createLogEntry(params: CreateLogEntryParams): LogEntry | null {
  // Validate level
  if (!LOG_LEVELS.includes(params.level)) {
    console.warn(
      `LogEntry: Invalid level "${params.level}", must be one of: ${LOG_LEVELS.join(', ')}`,
    );
    return null;
  }

  // Validate component
  if (!COMPONENTS.includes(params.component)) {
    console.warn(
      `LogEntry: Invalid component "${params.component}", must be one of: ${COMPONENTS.join(', ')}`,
    );
    return null;
  }

  // Validate message
  if (typeof params.message !== 'string' || params.message.length === 0) {
    console.warn('LogEntry: Message must be a non-empty string');
    return null;
  }

  // Truncate message if too long
  let truncatedMessage = params.message;
  if (params.message.length > loggingConstants.maxMessageBytes) {
    truncatedMessage = params.message.substring(0, loggingConstants.maxMessageBytes - 3) + '...';
  }

  // Validate and sanitize metadata
  let sanitizedMetadata: Record<string, any> | null = null;
  if (
    params.metadata !== null &&
    params.metadata !== undefined &&
    typeof params.metadata === 'object'
  ) {
    try {
      const metadataStr = JSON.stringify(params.metadata);
      if (metadataStr.length <= loggingConstants.maxMetadataBytes) {
        sanitizedMetadata = params.metadata;
      } else {
        console.warn('LogEntry: Metadata exceeds size limit, omitting');
      }
    } catch {
      console.warn('LogEntry: Metadata not serializable, omitting');
    }
  }

  return {
    timestamp: generateTimestamp(),
    level: params.level,
    message: truncatedMessage,
    component: params.component,
    metadata: sanitizedMetadata,
  };
}

/**
 * Validate an existing LogEntry object
 * @param entry - LogEntry to validate
 */
export function validateLogEntry(entry: any): entry is LogEntry {
  try {
    logEntrySchema.parse(entry);
    return true;
  } catch {
    return false;
  }
}

/**
 * Calculate approximate byte size of a LogEntry
 * Used for buffer size tracking
 */
export function getEntrySize(entry: LogEntry): number {
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
 */
export function serializeForLoki(
  entry: LogEntry,
): [string, string] | [string, string, Record<string, any>] {
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    return [entry.timestamp, entry.message, entry.metadata];
  }
  return [entry.timestamp, entry.message];
}
