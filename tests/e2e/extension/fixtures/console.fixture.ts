/**
 * Console Error Capture Fixture for Playwright E2E Tests
 *
 * Captures console errors, warnings, uncaught exceptions, and CSP violations
 * during test execution. Supports allowlist filtering for known benign errors.
 *
 * @see https://playwright.dev/docs/api/class-consolemessage
 * @see specs/038-browser-e2e-hardening/research.md
 *
 * FR-001: Capture console.error, console.warn, and pageerror events
 * FR-003: Fail tests when CSP violations are detected
 * FR-004: Support allowlist mechanism for known third-party errors
 * SC-002: 100% of CSP violations and uncaught exceptions cause test failure
 */

import { test as base, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to console error allowlist
const ALLOWLIST_PATH = path.join(__dirname, '../../console-allowlist.json');

/**
 * Represents a captured console error
 */
export interface CapturedError {
  type: 'error' | 'warning' | 'pageerror' | 'csp';
  message: string;
  source: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  stack: string | null;
  timestamp: number;
}

/**
 * Represents an allowlist entry
 */
export interface AllowlistEntry {
  id: string;
  pattern: string;
  source?: string | null;
  reason: string;
  issueUrl?: string | null;
  addedDate: string;
  addedBy?: string | null;
  expiresDate?: string | null;
}

/**
 * Allowlist configuration file format
 */
interface AllowlistConfig {
  version: string;
  description?: string;
  entries: AllowlistEntry[];
}

/**
 * Console fixture state
 */
export interface ConsoleFixture {
  /** All captured errors (before filtering) */
  capturedErrors: CapturedError[];
  /** Captured warnings (non-failing) */
  capturedWarnings: CapturedError[];
  /** CSP violations */
  cspViolations: CapturedError[];
  /** Errors that matched allowlist */
  allowlistedErrors: Array<{ error: CapturedError; matchedEntry: AllowlistEntry }>;
  /** Errors that did not match allowlist (will cause failure) */
  unexpectedErrors: CapturedError[];
  /** Whether we're in teardown phase */
  inTeardown: boolean;
}

/**
 * Load and compile allowlist patterns
 */
function loadAllowlist(): AllowlistEntry[] {
  try {
    if (!fs.existsSync(ALLOWLIST_PATH)) {
      console.log(`[Console Fixture] Allowlist not found at ${ALLOWLIST_PATH}, using empty allowlist`);
      return [];
    }
    const content = fs.readFileSync(ALLOWLIST_PATH, 'utf-8');
    const config: AllowlistConfig = JSON.parse(content);

    // Validate and filter expired entries
    const now = new Date().toISOString().split('T')[0];
    return config.entries.filter(entry => {
      if (entry.expiresDate && entry.expiresDate < now) {
        console.log(`[Console Fixture] Allowlist entry "${entry.id}" expired on ${entry.expiresDate}`);
        return false;
      }
      return true;
    });
  } catch (error) {
    console.error(`[Console Fixture] Failed to load allowlist: ${error}`);
    return [];
  }
}

/**
 * Check if an error matches an allowlist entry
 */
function matchesAllowlist(
  error: CapturedError,
  allowlist: AllowlistEntry[]
): AllowlistEntry | null {
  for (const entry of allowlist) {
    try {
      const patternRegex = new RegExp(entry.pattern, 'i');
      const messageMatches = patternRegex.test(error.message);

      // If pattern matches, check source filter if specified
      if (messageMatches) {
        if (entry.source) {
          const sourceRegex = new RegExp(entry.source, 'i');
          if (error.source && sourceRegex.test(error.source)) {
            return entry;
          }
        } else {
          return entry;
        }
      }
    } catch (regexError) {
      console.error(`[Console Fixture] Invalid regex in allowlist entry "${entry.id}": ${regexError}`);
    }
  }
  return null;
}

/**
 * Format error for actionable output when test fails
 */
function formatErrorForOutput(error: CapturedError): string {
  const location = error.source ? `[${error.source}:${error.lineNumber || '?'}]` : '[unknown source]';
  return `${location} ${error.message}`;
}

/**
 * Generate guidance message for new errors
 */
function generateGuidanceMessage(errors: CapturedError[]): string {
  const lines = [
    '',
    '=== Console Error Test Failed ===',
    '',
    'The following unexpected console errors were detected:',
    '',
  ];

  for (const error of errors) {
    lines.push(`  - [${error.type.toUpperCase()}] ${formatErrorForOutput(error)}`);
  }

  lines.push('');
  lines.push('To fix: Resolve the underlying error in your code.');
  lines.push('');
  lines.push('To allowlist (if this is a known third-party error):');
  lines.push('Add an entry to tests/e2e/console-allowlist.json:');
  lines.push('');
  lines.push('{');
  lines.push(`  "id": "example-error-${Date.now()}",`);
  lines.push(`  "pattern": "${errors[0]?.message.slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}",`);
  lines.push('  "reason": "Explain why this error is acceptable",');
  lines.push(`  "addedDate": "${new Date().toISOString().split('T')[0]}"`);
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Set up console error capture on a page
 */
export async function setupConsoleCapture(
  page: Page,
  state: ConsoleFixture,
  allowlist: AllowlistEntry[]
): Promise<void> {
  // Capture console messages
  page.on('console', (msg) => {
    const type = msg.type();
    const location = msg.location();

    if (type === 'error') {
      const error: CapturedError = {
        type: 'error',
        message: msg.text(),
        source: location.url || null,
        lineNumber: location.lineNumber ?? null,
        columnNumber: location.columnNumber ?? null,
        stack: null,
        timestamp: Date.now(),
      };

      state.capturedErrors.push(error);

      // Check allowlist
      const matchedEntry = matchesAllowlist(error, allowlist);
      if (matchedEntry) {
        state.allowlistedErrors.push({ error, matchedEntry });
        console.log(`[Console Fixture] Allowlisted error matched: "${matchedEntry.id}"`);
      } else if (!state.inTeardown) {
        // Only add to unexpected if not in teardown (Edge Case 3)
        state.unexpectedErrors.push(error);
      } else {
        console.log(`[Console Fixture] Teardown error ignored: ${error.message.slice(0, 100)}`);
      }
    } else if (type === 'warning') {
      // FR-001: Warnings are logged but don't fail tests
      const warning: CapturedError = {
        type: 'warning',
        message: msg.text(),
        source: location.url || null,
        lineNumber: location.lineNumber ?? null,
        columnNumber: location.columnNumber ?? null,
        stack: null,
        timestamp: Date.now(),
      };
      state.capturedWarnings.push(warning);
    }
  });

  // Capture uncaught exceptions (pageerror)
  page.on('pageerror', (error) => {
    const capturedError: CapturedError = {
      type: 'pageerror',
      message: error.message,
      source: null,
      lineNumber: null,
      columnNumber: null,
      stack: error.stack || null,
      timestamp: Date.now(),
    };

    state.capturedErrors.push(capturedError);

    // Check allowlist
    const matchedEntry = matchesAllowlist(capturedError, allowlist);
    if (matchedEntry) {
      state.allowlistedErrors.push({ error: capturedError, matchedEntry });
      console.log(`[Console Fixture] Allowlisted pageerror matched: "${matchedEntry.id}"`);
    } else if (!state.inTeardown) {
      state.unexpectedErrors.push(capturedError);
    } else {
      console.log(`[Console Fixture] Teardown pageerror ignored: ${capturedError.message.slice(0, 100)}`);
    }
  });

  // Inject CSP violation listener (FR-003)
  await page.addInitScript(() => {
    (window as any).__voxpageCspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as any).__voxpageCspViolations.push({
        blockedURI: e.blockedURI,
        directive: e.violatedDirective,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
        columnNumber: e.columnNumber,
        message: `CSP violation: ${e.violatedDirective} blocked ${e.blockedURI}`,
      });
    });
  });
}

/**
 * Retrieve CSP violations from page
 */
export async function getCspViolations(page: Page): Promise<CapturedError[]> {
  try {
    const violations = await page.evaluate(() => {
      return (window as any).__voxpageCspViolations || [];
    });

    return violations.map((v: any) => ({
      type: 'csp' as const,
      message: v.message,
      source: v.sourceFile || null,
      lineNumber: v.lineNumber || null,
      columnNumber: v.columnNumber || null,
      stack: null,
      timestamp: Date.now(),
    }));
  } catch {
    // Page may have navigated or closed
    return [];
  }
}

/**
 * Assert no unexpected errors occurred
 * Call this after page actions complete
 */
export async function assertNoConsoleErrors(
  page: Page,
  state: ConsoleFixture,
  options: { waitForNetworkIdle?: boolean; bufferMs?: number } = {}
): Promise<void> {
  const { waitForNetworkIdle = true, bufferMs = 100 } = options;

  // Wait for network idle to catch async errors
  if (waitForNetworkIdle) {
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      // Continue even if network doesn't idle
    }
  }

  // Small buffer for late-arriving async errors
  if (bufferMs > 0) {
    await page.waitForTimeout(bufferMs);
  }

  // Get CSP violations
  const cspViolations = await getCspViolations(page);
  state.cspViolations = cspViolations;

  // Add CSP violations to unexpected errors (always fail on CSP)
  for (const violation of cspViolations) {
    state.unexpectedErrors.push(violation);
  }

  // Log warnings (informational only)
  if (state.capturedWarnings.length > 0) {
    console.log(`\n[Console Fixture] ${state.capturedWarnings.length} warning(s) captured (non-failing):`);
    for (const warning of state.capturedWarnings) {
      console.log(`  - ${formatErrorForOutput(warning)}`);
    }
  }

  // Log allowlisted errors for transparency
  if (state.allowlistedErrors.length > 0) {
    console.log(`\n[Console Fixture] ${state.allowlistedErrors.length} error(s) matched allowlist:`);
    for (const { error, matchedEntry } of state.allowlistedErrors) {
      console.log(`  - "${matchedEntry.id}": ${error.message.slice(0, 80)}`);
    }
  }

  // Fail if unexpected errors exist
  if (state.unexpectedErrors.length > 0) {
    const guidance = generateGuidanceMessage(state.unexpectedErrors);
    console.error(guidance);

    expect(
      state.unexpectedErrors,
      `${state.unexpectedErrors.length} unexpected console error(s) detected. ${guidance}`
    ).toHaveLength(0);
  }
}

/**
 * Extended test with console error capture
 */
export const testWithConsole = base.extend<{
  consoleState: ConsoleFixture;
  allowlist: AllowlistEntry[];
}>({
  allowlist: async ({}, use) => {
    const allowlist = loadAllowlist();
    await use(allowlist);
  },

  consoleState: async ({ page, allowlist }, use) => {
    const state: ConsoleFixture = {
      capturedErrors: [],
      capturedWarnings: [],
      cspViolations: [],
      allowlistedErrors: [],
      unexpectedErrors: [],
      inTeardown: false,
    };

    await setupConsoleCapture(page, state, allowlist);
    await use(state);

    // Mark as teardown phase (Edge Case 3)
    state.inTeardown = true;
  },
});

// Re-export for convenience
export { expect } from '@playwright/test';
