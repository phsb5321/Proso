/**
 * Console Capture Module
 *
 * Intercepts console.log, console.warn, console.error, and console.debug calls
 * and forwards them to the usage tracker for remote logging to Loki.
 *
 * @module utils/telemetry/usage/console-capture
 */

import { sanitizeEventData } from './redaction';
import type { UsageTracker } from './tracker';
import type { LogLevel } from './types';

/**
 * Options for console capture installation.
 */
export interface ConsoleCaptureOptions {
  /**
   * Capture console.log calls.
   * @default true
   */
  captureLog?: boolean;

  /**
   * Capture console.debug calls.
   * @default false (too verbose for production)
   */
  captureDebug?: boolean;

  /**
   * Capture console.info calls.
   * @default true
   */
  captureInfo?: boolean;

  /**
   * Capture console.warn calls.
   * @default true
   */
  captureWarn?: boolean;

  /**
   * Capture console.error calls.
   * @default true
   */
  captureError?: boolean;

  /**
   * Patterns to ignore (messages matching these won't be tracked).
   * Useful for filtering out noisy or irrelevant logs.
   */
  ignorePatterns?: RegExp[];

  /**
   * Maximum message length before truncation.
   * @default 2000
   */
  maxMessageLength?: number;

  /**
   * Maximum number of console messages to track per window.
   * Prevents runaway logging from overwhelming the buffer.
   * @default 100
   */
  maxMessagesPerWindow?: number;

  /**
   * Window duration in ms for rate limiting.
   * @default 60000 (1 minute)
   */
  rateLimitWindowMs?: number;

  /**
   * Prefix to identify VoxPage's own logs (these are not re-captured).
   * @default '[VoxPage]'
   */
  selfLogPrefix?: string;

  /**
   * Also pass through to original console methods.
   * @default true
   */
  passthrough?: boolean;
}

/**
 * Default options for console capture.
 */
const DEFAULT_OPTIONS: Required<ConsoleCaptureOptions> = {
  captureLog: true,
  captureDebug: false,
  captureInfo: true,
  captureWarn: true,
  captureError: true,
  ignorePatterns: [
    // Ignore VoxPage internal logs to prevent infinite loops
    /^\[VoxPage/,
    /^\[UsageTracker/,
    /^\[UsageShipper/,
    /^\[UsageBuffer/,
    // Ignore common browser noise
    /^Download the React DevTools/,
    /^%c/,
    // Ignore extension framework logs
    /^\[wxt\]/i,
  ],
  maxMessageLength: 2000,
  maxMessagesPerWindow: 100,
  rateLimitWindowMs: 60000,
  selfLogPrefix: '[VoxPage]',
  passthrough: true,
};

/**
 * Console method types we can intercept.
 */
type ConsoleMethod = 'log' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Maps console methods to log levels.
 */
const CONSOLE_TO_LOG_LEVEL: Record<ConsoleMethod, LogLevel> = {
  log: 'info',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/**
 * Maps console methods to event types.
 */
const CONSOLE_TO_EVENT: Record<ConsoleMethod, string> = {
  log: 'console.log',
  debug: 'console.debug',
  info: 'console.info',
  warn: 'console.warn',
  error: 'console.error',
};

/**
 * Format console arguments into a string message.
 */
function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}`;
      }
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

/**
 * Extract structured data from console arguments.
 */
function extractConsoleData(args: unknown[]): Record<string, unknown> | undefined {
  // If there's only one arg and it's an object, use it as data
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
    if (!(args[0] instanceof Error)) {
      return sanitizeEventData(args[0] as Record<string, unknown>);
    }
  }

  // If there are multiple args and the last one is an object, treat it as data
  if (args.length > 1) {
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'object' && lastArg !== null && !(lastArg instanceof Error)) {
      return sanitizeEventData(lastArg as Record<string, unknown>);
    }
  }

  return undefined;
}

/**
 * Install console capture for a tracker.
 * Returns a cleanup function to restore original console methods.
 */
export function installConsoleCapture(
  tracker: UsageTracker,
  options: ConsoleCaptureOptions = {},
): () => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Store original console methods
  const originalConsole: Partial<Record<ConsoleMethod, typeof console.log>> = {};

  // Rate limiting state
  let messageCount = 0;
  let windowStart = Date.now();

  /**
   * Check if message should be ignored.
   */
  function shouldIgnore(message: string): boolean {
    return opts.ignorePatterns.some((pattern) => pattern.test(message));
  }

  /**
   * Check if we're rate limited.
   */
  function isRateLimited(): boolean {
    const now = Date.now();

    // Reset window if expired
    if (now - windowStart > opts.rateLimitWindowMs) {
      messageCount = 0;
      windowStart = now;
    }

    return messageCount >= opts.maxMessagesPerWindow;
  }

  /**
   * Create an interceptor for a console method.
   */
  function createInterceptor(method: ConsoleMethod): typeof console.log {
    const original = console[method].bind(console);
    originalConsole[method] = original;

    return (...args: unknown[]) => {
      // Always passthrough if enabled
      if (opts.passthrough) {
        original(...args);
      }

      // Skip if tracker not enabled
      if (!tracker.isEnabled()) {
        return;
      }

      try {
        // Format the message
        const message = formatConsoleArgs(args);

        // Skip if message should be ignored
        if (shouldIgnore(message)) {
          return;
        }

        // Skip if rate limited
        if (isRateLimited()) {
          return;
        }

        messageCount++;

        // Truncate if too long
        const truncatedMessage =
          message.length > opts.maxMessageLength
            ? message.slice(0, opts.maxMessageLength) + '...[truncated]'
            : message;

        // Extract structured data if present
        const data = extractConsoleData(args);

        // Track the console event
        tracker.track(
          CONSOLE_TO_EVENT[method],
          {
            message: truncatedMessage,
            argCount: args.length,
            ...data,
          },
          CONSOLE_TO_LOG_LEVEL[method],
          { skipFlush: method !== 'error' }, // Only immediate flush for errors
        );
      } catch {
        // Don't let console capture cause more errors
        // Use original to log the failure if passthrough is disabled
        if (!opts.passthrough) {
          original(...args);
        }
      }
    };
  }

  // Install interceptors for enabled methods
  if (opts.captureLog) {
    console.log = createInterceptor('log');
  }
  if (opts.captureDebug) {
    console.debug = createInterceptor('debug');
  }
  if (opts.captureInfo) {
    console.info = createInterceptor('info');
  }
  if (opts.captureWarn) {
    console.warn = createInterceptor('warn');
  }
  if (opts.captureError) {
    console.error = createInterceptor('error');
  }

  // Return cleanup function
  return () => {
    // Restore original console methods
    for (const [method, original] of Object.entries(originalConsole)) {
      if (original) {
        (console as unknown as Record<string, typeof console.log>)[method] = original;
      }
    }
  };
}

/**
 * Create a prefixed logger that doesn't get re-captured.
 * Useful for internal VoxPage logging that should appear locally but not be shipped.
 */
export function createInternalLogger(prefix = '[VoxPage]') {
  return {
    log: (...args: unknown[]) => console.log(prefix, ...args),
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}
