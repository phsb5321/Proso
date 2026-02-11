/**
 * Console Error Detection Tests
 *
 * Validates that the extension loads and operates without unexpected console errors.
 * Tests CSP violations, uncaught exceptions, and allowlist functionality.
 *
 * @see specs/038-browser-e2e-hardening/spec.md - User Story 1
 *
 * FR-001: Capture console.error, console.warn, and pageerror events
 * FR-002: Fail tests when uncaught exceptions occur in extension code
 * FR-003: Fail tests when CSP violations are detected
 * FR-004: Support allowlist mechanism for known third-party errors
 * SC-002: 100% of CSP violations and uncaught exceptions cause test failure
 */

import { test, expect, openExtensionPopup, isBlockedContext, waitForContentScript } from './fixtures/extension.fixture';
import {
  testWithConsole,
  setupConsoleCapture,
  assertNoConsoleErrors,
  getCspViolations,
  type ConsoleFixture,
  type AllowlistEntry,
} from './fixtures/console.fixture';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Merge extension and console fixtures
const extendedTest = test.extend<{
  consoleState: ConsoleFixture;
  allowlist: AllowlistEntry[];
}>({
  allowlist: async ({}, use) => {
    const allowlistPath = path.join(__dirname, '../console-allowlist.json');
    let allowlist: AllowlistEntry[] = [];
    try {
      if (fs.existsSync(allowlistPath)) {
        const content = fs.readFileSync(allowlistPath, 'utf-8');
        const config = JSON.parse(content);
        allowlist = config.entries || [];
      }
    } catch (error) {
      console.log(`[Test] Failed to load allowlist: ${error}`);
    }
    await use(allowlist);
  },

  consoleState: async ({ extensionPage, allowlist }, use) => {
    const state: ConsoleFixture = {
      capturedErrors: [],
      capturedWarnings: [],
      cspViolations: [],
      allowlistedErrors: [],
      unexpectedErrors: [],
      inTeardown: false,
    };

    await setupConsoleCapture(extensionPage, state, allowlist);
    await use(state);
    state.inTeardown = true;
  },
});

extendedTest.describe('Console Error Detection', () => {
  extendedTest('extension loads without console errors', async ({
    extensionPage,
    extensionId,
    consoleState,
  }) => {
    // Navigate to a simple test page
    await extensionPage.goto('https://example.com');

    // Wait for content script injection
    const contentScriptLoaded = await waitForContentScript(extensionPage, 5000);

    // Wait for page to stabilize
    await extensionPage.waitForLoadState('networkidle');

    // Assert no unexpected errors
    await assertNoConsoleErrors(extensionPage, consoleState);

    // Verify extension is functional (basic check)
    expect(extensionId).toBeTruthy();
    expect(extensionId.length).toBeGreaterThan(10);
  });

  extendedTest('popup page loads without console errors', async ({
    context,
    extensionId,
    allowlist,
  }) => {
    // Open popup in a new page
    const popupPage = await openExtensionPopup(context, extensionId);

    // Set up console capture on popup
    const popupState: ConsoleFixture = {
      capturedErrors: [],
      capturedWarnings: [],
      cspViolations: [],
      allowlistedErrors: [],
      unexpectedErrors: [],
      inTeardown: false,
    };
    await setupConsoleCapture(popupPage, popupState, allowlist);

    // Wait for popup to load
    await popupPage.waitForLoadState('domcontentloaded');

    // Give popup time to initialize
    await popupPage.waitForTimeout(1000);

    // Assert no unexpected errors
    await assertNoConsoleErrors(popupPage, popupState);

    await popupPage.close();
  });

  extendedTest('allowlisted errors do not fail tests', async ({
    extensionPage,
    consoleState,
  }) => {
    // Navigate to page that might trigger ResizeObserver warning
    await extensionPage.goto('https://example.com');

    // Inject a ResizeObserver loop warning (simulating the benign browser warning)
    await extensionPage.evaluate(() => {
      console.error('ResizeObserver loop completed with undelivered notifications.');
    });

    // Wait briefly
    await extensionPage.waitForTimeout(100);

    // This should pass because ResizeObserver loop is allowlisted
    await assertNoConsoleErrors(extensionPage, consoleState);

    // Verify the error was allowlisted
    expect(consoleState.allowlistedErrors.length).toBeGreaterThan(0);
    expect(consoleState.allowlistedErrors[0].matchedEntry.id).toBe('resize-observer-loop');
  });

  extendedTest('uncaught exceptions fail tests with stack trace', async ({
    extensionPage,
    consoleState,
  }) => {
    // Navigate to test page
    await extensionPage.goto('https://example.com');

    // Inject an uncaught exception
    await extensionPage.evaluate(() => {
      setTimeout(() => {
        throw new Error('Test uncaught exception for E2E validation');
      }, 50);
    });

    // Wait for the exception to fire
    await extensionPage.waitForTimeout(200);

    // Manually check that we captured the error (test would normally fail here)
    expect(consoleState.unexpectedErrors.length).toBeGreaterThan(0);

    const error = consoleState.unexpectedErrors[0];
    expect(error.type).toBe('pageerror');
    expect(error.message).toContain('Test uncaught exception');
    expect(error.stack).toBeTruthy();

    // Clear unexpected errors to prevent test failure
    // (This test is validating the capture mechanism, not the assertion)
    consoleState.unexpectedErrors = [];
  });

  extendedTest('console.warn is logged but does not fail test', async ({
    extensionPage,
    consoleState,
  }) => {
    // Navigate to test page
    await extensionPage.goto('https://example.com');

    // Inject a warning
    await extensionPage.evaluate(() => {
      console.warn('This is a test warning that should be logged but not fail');
    });

    // Wait briefly
    await extensionPage.waitForTimeout(100);

    // Assert no errors (warnings don't fail)
    await assertNoConsoleErrors(extensionPage, consoleState);

    // Verify warning was captured
    expect(consoleState.capturedWarnings.length).toBeGreaterThan(0);
    expect(consoleState.capturedWarnings[0].message).toContain('test warning');
  });

  extendedTest('CSP violations are detected and cause failure', async ({
    extensionPage,
    consoleState,
  }) => {
    // Navigate to test page
    await extensionPage.goto('https://example.com');

    // Simulate a CSP violation by dispatching the event
    await extensionPage.evaluate(() => {
      // Create and dispatch a mock CSP violation event
      const event = new SecurityPolicyViolationEvent('securitypolicyviolation', {
        blockedURI: 'https://malicious-script.com/evil.js',
        violatedDirective: 'script-src',
        sourceFile: 'https://example.com/page.html',
        lineNumber: 42,
        columnNumber: 10,
      });
      document.dispatchEvent(event);
    });

    // Get CSP violations
    const violations = await getCspViolations(extensionPage);

    // Verify CSP violation was captured
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].type).toBe('csp');
    expect(violations[0].message).toContain('CSP violation');
  });

  extendedTest('blocked contexts are detected and handled gracefully', async ({
    extensionPage,
  }) => {
    // Test blocked context detection utility
    expect(isBlockedContext('chrome://extensions')).toBe(true);
    expect(isBlockedContext('chrome-extension://abc123/popup.html')).toBe(true);
    expect(isBlockedContext('edge://settings')).toBe(true);
    expect(isBlockedContext('about:blank')).toBe(true);
    expect(isBlockedContext('https://example.com')).toBe(false);
    expect(isBlockedContext('http://localhost:3000')).toBe(false);
  });

  extendedTest('multiple pages can be monitored independently', async ({
    context,
    extensionId,
    allowlist,
  }) => {
    // Create two pages
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    // Set up independent console states
    const state1: ConsoleFixture = {
      capturedErrors: [],
      capturedWarnings: [],
      cspViolations: [],
      allowlistedErrors: [],
      unexpectedErrors: [],
      inTeardown: false,
    };
    const state2: ConsoleFixture = {
      capturedErrors: [],
      capturedWarnings: [],
      cspViolations: [],
      allowlistedErrors: [],
      unexpectedErrors: [],
      inTeardown: false,
    };

    await setupConsoleCapture(page1, state1, allowlist);
    await setupConsoleCapture(page2, state2, allowlist);

    // Navigate both pages
    await page1.goto('https://example.com');
    await page2.goto('https://example.org');

    // Wait for pages to settle and any favicon errors to be processed
    await page1.waitForTimeout(500);
    await page2.waitForTimeout(500);

    // Clear any navigation-related errors (favicon 404s, etc.)
    state1.capturedErrors = [];
    state1.unexpectedErrors = [];
    state2.capturedErrors = [];
    state2.unexpectedErrors = [];

    // Wait a bit more to ensure no more background errors
    await page1.waitForTimeout(100);
    
    // Clear again in case any late errors arrived
    state1.capturedErrors = [];
    state2.capturedErrors = [];

    // Inject error only on page1
    await page1.evaluate(() => {
      console.error('Error on page 1 only');
    });

    // Wait briefly for error to be captured
    await page1.waitForTimeout(150);

    // Verify error was captured only on page1
    expect(state1.capturedErrors.length).toBeGreaterThanOrEqual(1);
    expect(state1.capturedErrors.some(e => e.message.includes('Error on page 1 only'))).toBe(true);
    // Page2 should have no errors from page1's console.error
    // (may have favicon errors but those would be filtered by allowlist)
    const page2Errors = state2.capturedErrors.filter(e => e.message.includes('Error on page 1'));
    expect(page2Errors.length).toBe(0);

    await page1.close();
    await page2.close();
  });
});
