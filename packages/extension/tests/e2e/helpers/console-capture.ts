/**
 * E2E Console Capture Helper
 *
 * Playwright helper that captures browser console output from the extension.
 * Designed for use in afterEach hooks to attach console logs to failure reports.
 *
 * Key features:
 * - Captures console messages from extension contexts (moz-extension://)
 * - Filters by extension origin to exclude noise from web pages
 * - Attaches captured output to Playwright test failure reports
 * - Formats log entries with timestamps and levels
 *
 * Contract: specs/056-production-readiness-sprint/contracts/debug-infrastructure.yaml
 *
 * @module tests/e2e/helpers/console-capture
 */

import type { Page, TestInfo, ConsoleMessage } from '@playwright/test';

/**
 * A captured console log entry.
 */
export interface CapturedLog {
  /** Timestamp when the message was captured */
  timestamp: number;
  /** Console message type (log, info, warn, error, debug, etc.) */
  type: string;
  /** The text content of the console message */
  text: string;
  /** The source URL where the message originated */
  url: string;
  /** Line number in the source file */
  lineNumber: number;
  /** Column number in the source file */
  columnNumber: number;
}

/**
 * Capture state maintained per page.
 */
export interface CaptureState {
  /** All captured log entries */
  logs: CapturedLog[];
  /** Whether capture is actively running */
  active: boolean;
}

/**
 * Options for console capture.
 */
export interface ConsoleCaptureOptions {
  /** Filter to only capture messages from extension origins (moz-extension:// or chrome-extension://) */
  extensionOnly?: boolean;
  /** Capture debug-level messages (default: true) */
  includeDebug?: boolean;
  /** Maximum number of entries to keep (default: 500) */
  maxEntries?: number;
}

const DEFAULT_OPTIONS: Required<ConsoleCaptureOptions> = {
  extensionOnly: true,
  includeDebug: true,
  maxEntries: 500,
};

/**
 * Check if a URL is from a browser extension context.
 */
export function isExtensionUrl(url: string): boolean {
  return url.startsWith('moz-extension://') || url.startsWith('chrome-extension://');
}

/**
 * Convert a ConsoleMessage to a CapturedLog entry.
 */
function consoleMessageToLog(msg: ConsoleMessage): CapturedLog {
  const location = msg.location();
  return {
    timestamp: Date.now(),
    type: msg.type(),
    text: msg.text(),
    url: location.url,
    lineNumber: location.lineNumber,
    columnNumber: location.columnNumber,
  };
}

/**
 * Start capturing console output from a Playwright page.
 *
 * @param page - Playwright Page instance
 * @param options - Capture configuration
 * @returns CaptureState that accumulates log entries
 *
 * @example
 * ```ts
 * const state = startConsoleCapture(page);
 * // ... run test actions ...
 * const logs = getConsoleLogs(state);
 * ```
 */
export function startConsoleCapture(
  page: Page,
  options?: ConsoleCaptureOptions,
): CaptureState {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const state: CaptureState = { logs: [], active: true };

  page.on('console', (msg: ConsoleMessage) => {
    if (!state.active) return;

    // Optionally skip debug messages
    if (!opts.includeDebug && msg.type() === 'debug') return;

    const log = consoleMessageToLog(msg);

    // Optionally filter by extension origin
    if (opts.extensionOnly && log.url && !isExtensionUrl(log.url)) {
      return;
    }

    // Enforce max entries (evict oldest)
    if (state.logs.length >= opts.maxEntries) {
      state.logs.shift();
    }

    state.logs.push(log);
  });

  return state;
}

/**
 * Get all captured console logs.
 *
 * @param state - Capture state from startConsoleCapture
 * @returns Array of captured log entries
 */
export function getConsoleLogs(state: CaptureState): CapturedLog[] {
  return [...state.logs];
}

/**
 * Stop capturing console output.
 *
 * @param state - Capture state to deactivate
 */
export function stopConsoleCapture(state: CaptureState): void {
  state.active = false;
}

/**
 * Format captured logs into a human-readable string.
 *
 * @param logs - Array of captured log entries
 * @returns Formatted string suitable for test reports
 */
export function formatConsoleLogs(logs: CapturedLog[]): string {
  if (logs.length === 0) {
    return '(no console output captured)';
  }

  return logs
    .map((log) => {
      const time = new Date(log.timestamp).toISOString();
      const level = log.type.toUpperCase().padEnd(7);
      const source = log.url
        ? `[${log.url}:${log.lineNumber}]`
        : '[unknown]';
      return `${time} ${level} ${source} ${log.text}`;
    })
    .join('\n');
}

/**
 * Attach console logs to a Playwright test report on failure.
 *
 * Designed for use in `test.afterEach`:
 * ```ts
 * test.afterEach(async ({ page }, testInfo) => {
 *   await attachConsoleLogs(state, testInfo);
 * });
 * ```
 *
 * @param state - Capture state from startConsoleCapture
 * @param testInfo - Playwright TestInfo from the test hook
 * @param options - Options for attachment
 */
export async function attachConsoleLogs(
  state: CaptureState,
  testInfo: TestInfo,
  options?: { attachOnPass?: boolean },
): Promise<void> {
  const { attachOnPass = false } = options ?? {};

  // Only attach on failure unless explicitly requested
  if (testInfo.status === 'passed' && !attachOnPass) {
    return;
  }

  const logs = getConsoleLogs(state);
  if (logs.length === 0) return;

  const formatted = formatConsoleLogs(logs);
  await testInfo.attach('extension-console', {
    body: formatted,
    contentType: 'text/plain',
  });
}
