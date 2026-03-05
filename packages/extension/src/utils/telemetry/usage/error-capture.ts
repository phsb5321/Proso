/**
 * Error Capture Module
 *
 * Automatically captures uncaught errors and unhandled promise rejections.
 * Provides error fingerprinting for deduplication.
 *
 * @module utils/telemetry/usage/error-capture
 */

import { redactError } from './redaction';
import type { UsageTracker } from './tracker';

/**
 * Options for error capture installation.
 */
export interface ErrorCaptureOptions {
  /** Debounce duplicate errors within this window (ms). Default: 1000 */
  dedupeWindowMs?: number;

  /** Maximum errors to track per window. Default: 10 */
  maxErrorsPerWindow?: number;

  /** Skip errors matching these patterns */
  ignorePatterns?: RegExp[];
}

/**
 * Default options.
 */
const DEFAULT_OPTIONS: Required<ErrorCaptureOptions> = {
  dedupeWindowMs: 1000,
  maxErrorsPerWindow: 10,
  ignorePatterns: [
    // Ignore extension context invalidated errors (common during development)
    /Extension context invalidated/i,
    // Ignore network errors that are expected
    /Failed to fetch/i,
    /NetworkError/i,
  ],
};

/**
 * Recent error fingerprints for deduplication.
 */
interface RecentError {
  fingerprint: string;
  timestamp: number;
  count: number;
}

/**
 * Generate a fingerprint for an error for deduplication.
 */
export function generateErrorFingerprint(error: Error): string {
  const parts: string[] = [error.name, error.message];

  // Extract first meaningful stack frame
  if (error.stack) {
    const lines = error.stack.split('\n');
    for (const line of lines) {
      // Skip the error message line and find first stack frame
      if (line.includes('at ')) {
        // Normalize the line (remove line/column numbers)
        const normalized = line.replace(/:\d+:\d+\)?$/, '').trim();
        parts.push(normalized);
        break;
      }
    }
  }

  // Simple hash of the parts
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Install global error capture for a tracker.
 * Returns a cleanup function to remove the listeners.
 */
export function installErrorCapture(
  tracker: UsageTracker,
  options: ErrorCaptureOptions = {},
): () => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const recentErrors: Map<string, RecentError> = new Map();
  let errorCount = 0;

  /**
   * Check if error should be ignored.
   */
  function shouldIgnore(error: Error): boolean {
    const message = error.message || '';
    return opts.ignorePatterns.some((pattern) => pattern.test(message));
  }

  /**
   * Check if error is a duplicate within the window.
   */
  function isDuplicate(fingerprint: string): boolean {
    const now = Date.now();
    const recent = recentErrors.get(fingerprint);

    if (recent && now - recent.timestamp < opts.dedupeWindowMs) {
      recent.count++;
      return true;
    }

    // Clean up old entries
    for (const [fp, entry] of recentErrors.entries()) {
      if (now - entry.timestamp > opts.dedupeWindowMs) {
        recentErrors.delete(fp);
      }
    }

    return false;
  }

  /**
   * Record an error occurrence.
   */
  function recordError(fingerprint: string): void {
    recentErrors.set(fingerprint, {
      fingerprint,
      timestamp: Date.now(),
      count: 1,
    });
    errorCount++;

    // Reset count after window
    setTimeout(() => {
      errorCount = Math.max(0, errorCount - 1);
    }, opts.dedupeWindowMs);
  }

  /**
   * Check if we've exceeded the error limit.
   */
  function isRateLimited(): boolean {
    return errorCount >= opts.maxErrorsPerWindow;
  }

  /**
   * Handle uncaught errors.
   */
  function handleError(event: ErrorEvent): void {
    try {
      const error =
        event.error instanceof Error ? event.error : new Error(event.message || 'Unknown error');

      if (shouldIgnore(error)) {
        return;
      }

      const fingerprint = generateErrorFingerprint(error);

      if (isDuplicate(fingerprint)) {
        return;
      }

      if (isRateLimited()) {
        return;
      }

      recordError(fingerprint);

      const redacted = redactError(error);

      tracker.track(
        'error.uncaught_exception',
        {
          name: redacted.name,
          message: redacted.message,
          stack: redacted.stack,
          fingerprint,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
        'error',
      );
    } catch {
      // Don't let error tracking cause more errors
    }
  }

  /**
   * Handle unhandled promise rejections.
   */
  function handleRejection(event: PromiseRejectionEvent): void {
    try {
      const reason = event.reason;
      const error =
        reason instanceof Error
          ? reason
          : new Error(String(reason) || 'Unhandled promise rejection');

      if (shouldIgnore(error)) {
        return;
      }

      const fingerprint = generateErrorFingerprint(error);

      if (isDuplicate(fingerprint)) {
        return;
      }

      if (isRateLimited()) {
        return;
      }

      recordError(fingerprint);

      const redacted = redactError(error);

      tracker.track(
        'error.unhandled_rejection',
        {
          name: redacted.name,
          message: redacted.message,
          stack: redacted.stack,
          fingerprint,
          reason: typeof reason === 'string' ? reason : undefined,
        },
        'error',
      );
    } catch {
      // Don't let error tracking cause more errors
    }
  }

  // Install listeners
  if (typeof window !== 'undefined') {
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
  }

  // Return cleanup function
  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    }
    recentErrors.clear();
  };
}

/**
 * Create a wrapper for async functions that captures errors.
 */
export function withErrorCapture<T extends (...args: unknown[]) => Promise<unknown>>(
  tracker: UsageTracker,
  fn: T,
  context?: string,
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof Error) {
        const redacted = redactError(error);
        tracker.track(
          'error.handler_exception',
          {
            name: redacted.name,
            message: redacted.message,
            stack: redacted.stack,
            context,
          },
          'error',
        );
      }
      throw error;
    }
  }) as T;
}

/**
 * Track an error manually.
 */
export function trackError(
  tracker: UsageTracker,
  eventType: string,
  error: Error,
  additionalData?: Record<string, unknown>,
): void {
  const redacted = redactError(error);
  const fingerprint = generateErrorFingerprint(error);

  tracker.track(
    eventType,
    {
      name: redacted.name,
      message: redacted.message,
      stack: redacted.stack,
      fingerprint,
      ...additionalData,
    },
    'error',
  );
}
