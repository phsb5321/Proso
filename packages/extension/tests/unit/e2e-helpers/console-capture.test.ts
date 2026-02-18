/**
 * Tests for E2E Console Capture Helper
 * Contract: specs/056-production-readiness-sprint/contracts/debug-infrastructure.yaml
 *
 * Test cases:
 * 1. Console capture collects extension log output
 * 2. Console capture is included in test failure reports
 * 3. Console capture filters by extension origin
 */

import { describe, it, expect, jest } from '@jest/globals';
import { resolve } from 'node:path';

const {
  isExtensionUrl,
  startConsoleCapture,
  getConsoleLogs,
  stopConsoleCapture,
  formatConsoleLogs,
  attachConsoleLogs,
} = await import(resolve('tests/e2e/helpers/console-capture'));

import type { CapturedLog, CaptureState } from '../../../tests/e2e/helpers/console-capture';

/**
 * Create a mock Playwright Page with controllable console events.
 */
function createMockPage() {
  const listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    emit(event: string, ...args: unknown[]) {
      for (const handler of listeners.get(event) || []) {
        handler(...args);
      }
    },
  };
}

/**
 * Create a mock Playwright ConsoleMessage.
 */
function createMockConsoleMessage(opts: {
  type?: string;
  text?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
}) {
  return {
    type: () => opts.type ?? 'log',
    text: () => opts.text ?? '',
    location: () => ({
      url: opts.url ?? '',
      lineNumber: opts.lineNumber ?? 0,
      columnNumber: opts.columnNumber ?? 0,
    }),
  };
}

/**
 * Create a mock Playwright TestInfo.
 */
function createMockTestInfo(status: string) {
  return {
    status,
    attach: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe('E2E Console Capture Helper', () => {
  // Test: isExtensionUrl
  describe('isExtensionUrl', () => {
    it('returns true for moz-extension:// URLs', () => {
      expect(isExtensionUrl('moz-extension://abc-123/background.js')).toBe(true);
    });

    it('returns true for chrome-extension:// URLs', () => {
      expect(isExtensionUrl('chrome-extension://abc123/popup.js')).toBe(true);
    });

    it('returns false for http:// URLs', () => {
      expect(isExtensionUrl('http://example.com/script.js')).toBe(false);
    });

    it('returns false for https:// URLs', () => {
      expect(isExtensionUrl('https://example.com/app.js')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isExtensionUrl('')).toBe(false);
    });
  });

  // Test 1: Console capture collects extension log output
  describe('captures extension log output', () => {
    it('captures console messages from extension contexts', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any);

      // Simulate an extension console message
      page.emit(
        'console',
        createMockConsoleMessage({
          type: 'log',
          text: 'Extension loaded',
          url: 'moz-extension://abc-123/background.js',
          lineNumber: 42,
        }),
      );

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(1);
      expect(logs[0].text).toBe('Extension loaded');
      expect(logs[0].type).toBe('log');
      expect(logs[0].url).toBe('moz-extension://abc-123/background.js');
      expect(logs[0].lineNumber).toBe(42);
    });

    it('captures multiple messages', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any);

      page.emit(
        'console',
        createMockConsoleMessage({ text: 'msg 1', url: 'moz-extension://id/bg.js' }),
      );
      page.emit(
        'console',
        createMockConsoleMessage({
          type: 'error',
          text: 'msg 2',
          url: 'moz-extension://id/bg.js',
        }),
      );

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(2);
      expect(logs[0].text).toBe('msg 1');
      expect(logs[1].text).toBe('msg 2');
      expect(logs[1].type).toBe('error');
    });

    it('stops capturing after stopConsoleCapture is called', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any);

      page.emit(
        'console',
        createMockConsoleMessage({ text: 'before stop', url: 'moz-extension://id/bg.js' }),
      );
      stopConsoleCapture(state);
      page.emit(
        'console',
        createMockConsoleMessage({ text: 'after stop', url: 'moz-extension://id/bg.js' }),
      );

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(1);
      expect(logs[0].text).toBe('before stop');
    });

    it('enforces maxEntries limit', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any, { maxEntries: 3 });

      for (let i = 0; i < 5; i++) {
        page.emit(
          'console',
          createMockConsoleMessage({
            text: `msg ${i}`,
            url: 'moz-extension://id/bg.js',
          }),
        );
      }

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(3);
      // Should have the most recent 3
      expect(logs[0].text).toBe('msg 2');
      expect(logs[1].text).toBe('msg 3');
      expect(logs[2].text).toBe('msg 4');
    });

    it('captures all message types (log, info, warn, error, debug)', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any);

      const types = ['log', 'info', 'warn', 'error', 'debug'];
      for (const type of types) {
        page.emit(
          'console',
          createMockConsoleMessage({ type, text: `${type} message`, url: 'moz-extension://id/bg.js' }),
        );
      }

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(5);
      expect(logs.map((l: CapturedLog) => l.type)).toEqual(types);
    });
  });

  // Test 3: Console capture filters by extension origin
  describe('filters by extension origin', () => {
    it('excludes non-extension URLs when extensionOnly is true (default)', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any);

      page.emit(
        'console',
        createMockConsoleMessage({ text: 'from extension', url: 'moz-extension://id/bg.js' }),
      );
      page.emit(
        'console',
        createMockConsoleMessage({ text: 'from web', url: 'https://example.com/app.js' }),
      );

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(1);
      expect(logs[0].text).toBe('from extension');
    });

    it('includes all URLs when extensionOnly is false', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any, { extensionOnly: false });

      page.emit(
        'console',
        createMockConsoleMessage({ text: 'from extension', url: 'moz-extension://id/bg.js' }),
      );
      page.emit(
        'console',
        createMockConsoleMessage({ text: 'from web', url: 'https://example.com/app.js' }),
      );

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(2);
    });

    it('captures chrome-extension:// URLs', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any);

      page.emit(
        'console',
        createMockConsoleMessage({
          text: 'chrome ext msg',
          url: 'chrome-extension://abcdef/popup.js',
        }),
      );

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(1);
      expect(logs[0].text).toBe('chrome ext msg');
    });

    it('can exclude debug messages with includeDebug: false', () => {
      const page = createMockPage();
      const state = startConsoleCapture(page as any, { includeDebug: false });

      page.emit(
        'console',
        createMockConsoleMessage({
          type: 'debug',
          text: 'debug msg',
          url: 'moz-extension://id/bg.js',
        }),
      );
      page.emit(
        'console',
        createMockConsoleMessage({
          type: 'info',
          text: 'info msg',
          url: 'moz-extension://id/bg.js',
        }),
      );

      const logs = getConsoleLogs(state);
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe('info');
    });
  });

  // Test 2: Console capture is included in test failure reports
  describe('test failure report integration', () => {
    it('attaches formatted logs on test failure', async () => {
      const state: CaptureState = {
        active: true,
        logs: [
          {
            timestamp: 1700000000000,
            type: 'error',
            text: 'Something failed',
            url: 'moz-extension://id/bg.js',
            lineNumber: 10,
            columnNumber: 5,
          },
        ],
      };

      const testInfo = createMockTestInfo('failed');
      await attachConsoleLogs(state, testInfo as any);

      expect(testInfo.attach).toHaveBeenCalledTimes(1);
      expect(testInfo.attach).toHaveBeenCalledWith('extension-console', {
        body: expect.stringContaining('Something failed'),
        contentType: 'text/plain',
      });
    });

    it('does NOT attach logs when test passes (default)', async () => {
      const state: CaptureState = {
        active: true,
        logs: [
          {
            timestamp: 1700000000000,
            type: 'info',
            text: 'All good',
            url: 'moz-extension://id/bg.js',
            lineNumber: 1,
            columnNumber: 0,
          },
        ],
      };

      const testInfo = createMockTestInfo('passed');
      await attachConsoleLogs(state, testInfo as any);

      expect(testInfo.attach).not.toHaveBeenCalled();
    });

    it('attaches on pass when attachOnPass is true', async () => {
      const state: CaptureState = {
        active: true,
        logs: [
          {
            timestamp: 1700000000000,
            type: 'info',
            text: 'Logged info',
            url: 'moz-extension://id/bg.js',
            lineNumber: 1,
            columnNumber: 0,
          },
        ],
      };

      const testInfo = createMockTestInfo('passed');
      await attachConsoleLogs(state, testInfo as any, { attachOnPass: true });

      expect(testInfo.attach).toHaveBeenCalledTimes(1);
    });

    it('does not attach when there are no logs', async () => {
      const state: CaptureState = { active: true, logs: [] };
      const testInfo = createMockTestInfo('failed');
      await attachConsoleLogs(state, testInfo as any);

      expect(testInfo.attach).not.toHaveBeenCalled();
    });
  });

  // formatConsoleLogs tests
  describe('formatConsoleLogs', () => {
    it('returns placeholder for empty logs', () => {
      expect(formatConsoleLogs([])).toBe('(no console output captured)');
    });

    it('formats logs with timestamp, level, source, and text', () => {
      const logs: CapturedLog[] = [
        {
          timestamp: 1700000000000,
          type: 'error',
          text: 'Test error',
          url: 'moz-extension://id/bg.js',
          lineNumber: 42,
          columnNumber: 5,
        },
      ];

      const formatted = formatConsoleLogs(logs);
      expect(formatted).toContain('ERROR');
      expect(formatted).toContain('Test error');
      expect(formatted).toContain('moz-extension://id/bg.js:42');
    });

    it('formats multiple logs with newlines', () => {
      const logs: CapturedLog[] = [
        {
          timestamp: 1700000000000,
          type: 'info',
          text: 'First',
          url: 'moz-extension://id/bg.js',
          lineNumber: 1,
          columnNumber: 0,
        },
        {
          timestamp: 1700000001000,
          type: 'warn',
          text: 'Second',
          url: 'moz-extension://id/bg.js',
          lineNumber: 2,
          columnNumber: 0,
        },
      ];

      const formatted = formatConsoleLogs(logs);
      const lines = formatted.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('First');
      expect(lines[1]).toContain('Second');
    });
  });

  // getConsoleLogs returns a copy
  describe('getConsoleLogs', () => {
    it('returns a copy of the logs array', () => {
      const state: CaptureState = {
        active: true,
        logs: [
          {
            timestamp: 1700000000000,
            type: 'log',
            text: 'test',
            url: '',
            lineNumber: 0,
            columnNumber: 0,
          },
        ],
      };

      const logs1 = getConsoleLogs(state);
      const logs2 = getConsoleLogs(state);
      expect(logs1).not.toBe(logs2); // Different array references
      expect(logs1).toEqual(logs2); // Same content
    });
  });
});
