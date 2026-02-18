/**
 * Logging Message Handlers
 *
 * Hexagonal handlers for remote logging operations.
 * Integrates with the LogBuffer and UsageShipper for structured
 * remote logging with buffering and circuit breaker pattern.
 *
 * @module handlers/logging
 */

import type { HandlerRegistry } from './registry';
import { loggingLogRemoteParamsSchema } from './schemas/misc.schemas';

// ============================================
// Types
// ============================================

/**
 * Log level type.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logging handler error type.
 */
export type LoggingHandlerError =
  | { type: 'invalid_params'; message: string }
  | { type: 'operation_failed'; message: string };

/**
 * Response for logging.logRemote handler.
 */
export interface LogRemoteResponse {
  success: boolean;
  buffered: boolean;
}

/**
 * Response for logging.flushBuffer handler.
 */
export interface FlushBufferResponse {
  success: boolean;
  flushedCount: number;
}

/**
 * Response for logging.getState handler.
 */
export interface LoggingStateResponse {
  enabled: boolean;
  bufferSize: number;
  lastFlushAttempt: number;
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
}

// ============================================
// Handler Parameters
// ============================================

// ============================================
// Dependencies (injectable for testing)
// ============================================

export interface LoggingDependencies {
  addToBuffer: (entry: {
    level: LogLevel;
    message: string;
    component: string;
    metadata?: Record<string, unknown>;
    timestamp: number;
  }) => void;
  flushBuffer: () => Promise<number>;
  getBufferSize: () => number;
  isEnabled: () => boolean;
  getLastFlushAttempt: () => number;
  getConsecutiveFailures: () => number;
  isCircuitBreakerOpen: () => boolean;
}

let dependencies: LoggingDependencies | null = null;

/**
 * Set logging dependencies.
 */
export function setLoggingDependencies(deps: LoggingDependencies): void {
  dependencies = deps;
}

function getDependencies(): LoggingDependencies | null {
  return dependencies;
}

// ============================================
// Handlers
// ============================================

/**
 * Log a message to the remote buffer.
 */
async function handleLoggingLogRemote(params: unknown): Promise<LogRemoteResponse> {
  const parsed = loggingLogRemoteParamsSchema.safeParse(params);
  if (!parsed.success) {
    return { success: false, buffered: false };
  }

  const deps = getDependencies();
  if (!deps || !deps.isEnabled()) {
    // Logging not enabled, silently accept but don't buffer
    return { success: true, buffered: false };
  }

  try {
    deps.addToBuffer({
      level: parsed.data.level,
      message: parsed.data.message.substring(0, 10000), // Max message length
      component: parsed.data.component ?? 'unknown',
      metadata: parsed.data.metadata,
      timestamp: Date.now(),
    });

    return { success: true, buffered: true };
  } catch {
    return { success: false, buffered: false };
  }
}

/**
 * Flush the log buffer.
 */
async function handleLoggingFlushBuffer(): Promise<FlushBufferResponse> {
  const deps = getDependencies();
  if (!deps) {
    return { success: true, flushedCount: 0 };
  }

  try {
    const flushedCount = await deps.flushBuffer();
    return { success: true, flushedCount };
  } catch {
    return { success: false, flushedCount: 0 };
  }
}

/**
 * Get the current logging state.
 */
async function handleLoggingGetState(): Promise<LoggingStateResponse> {
  const deps = getDependencies();
  if (!deps) {
    return {
      enabled: false,
      bufferSize: 0,
      lastFlushAttempt: 0,
      consecutiveFailures: 0,
      circuitBreakerOpen: false,
    };
  }

  return {
    enabled: deps.isEnabled(),
    bufferSize: deps.getBufferSize(),
    lastFlushAttempt: deps.getLastFlushAttempt(),
    consecutiveFailures: deps.getConsecutiveFailures(),
    circuitBreakerOpen: deps.isCircuitBreakerOpen(),
  };
}

// ============================================
// Registration
// ============================================

/**
 * Register all logging handlers on the given registry.
 */
export function registerLoggingHandlers(registry: HandlerRegistry): void {
  registry.register('logging.logRemote', handleLoggingLogRemote, 'Log message to remote buffer');
  registry.register('logging.flushBuffer', handleLoggingFlushBuffer, 'Flush log buffer');
  registry.register('logging.getState', handleLoggingGetState, 'Get logging state');
}
