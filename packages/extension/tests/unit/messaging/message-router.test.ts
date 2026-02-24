// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.

/**
 * Unit tests for message router behavior
 * Tests unknown message handling, error responses, and routing patterns
 *
 * @module tests/unit/messaging/message-router
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  unknownMessageResponse,
  handlerErrorResponse,
  invalidParamsResponse,
  notInitializedResponse,
  timeoutResponse,
  internalErrorResponse,
  isErrorResponse,
  type MessageErrorResponse,
} from '../../../src/utils/messaging/error-response';

/**
 * Simulates the message routing logic from background.ts
 * This is a simplified version for testing
 */
interface MessageHandler {
  type: string;
  handler: (data: unknown) => Promise<unknown>;
}

class MockMessageRouter {
  private handlers: Map<string, MessageHandler> = new Map();
  private migrationFlags: Map<string, boolean> = new Map();

  registerHandler(type: string, handler: (data: unknown) => Promise<unknown>): void {
    this.handlers.set(type, { type, handler });
  }

  setMigrationFlag(type: string, useLegacy: boolean): void {
    this.migrationFlags.set(type, useLegacy);
  }

  shouldUseLegacy(type: string): boolean {
    return this.migrationFlags.get(type) ?? false;
  }

  async dispatch(message: { type?: string; action?: string; [key: string]: unknown }): Promise<unknown> {
    const messageType = message.type ?? message.action;
    
    if (!messageType) {
      return undefined; // Ignore messages without type/action
    }

    // Check if handler exists
    const handler = this.handlers.get(messageType);
    if (!handler) {
      console.warn(`[Router] Unknown message type: ${messageType}`);
      return unknownMessageResponse(messageType, this.getAvailableHandlers());
    }

    // Execute handler with error catching
    try {
      const result = await handler.handler(message);
      return result;
    } catch (error) {
      console.error(`[Router] Handler error for ${messageType}:`, error);
      return handlerErrorResponse(messageType, error);
    }
  }

  getAvailableHandlers(): string[] {
    return Array.from(this.handlers.keys());
  }
}

describe('message-router', () => {
  let router: MockMessageRouter;

  beforeEach(() => {
    router = new MockMessageRouter();
  });

  describe('unknown message handling', () => {
    it('should return structured error for unknown message type', async () => {
      const result = await router.dispatch({ type: 'unknown.action' });

      expect(isErrorResponse(result)).toBe(true);
      const errorResult = result as MessageErrorResponse;
      expect(errorResult.success).toBe(false);
      expect(errorResult.error.type).toBe('unknown_message');
      expect(errorResult.error.message).toContain('unknown.action');
    });

    it('should return structured error for unknown legacy action', async () => {
      const result = await router.dispatch({ action: 'legacyUnknown' });

      expect(isErrorResponse(result)).toBe(true);
      const errorResult = result as MessageErrorResponse;
      expect(errorResult.success).toBe(false);
      expect(errorResult.error.type).toBe('unknown_message');
    });

    it('should include available handlers in error details', async () => {
      router.registerHandler('known.handler', async () => ({ success: true }));
      router.registerHandler('another.handler', async () => ({ success: true }));

      const result = await router.dispatch({ type: 'unknown.action' });

      expect(isErrorResponse(result)).toBe(true);
      const errorResult = result as MessageErrorResponse;
      expect(errorResult.error.details).toBeDefined();
      const details = errorResult.error.details as { availableHandlers?: string[] };
      expect(details.availableHandlers).toContain('known.handler');
      expect(details.availableHandlers).toContain('another.handler');
    });

    it('should return undefined for messages without type or action', async () => {
      const result = await router.dispatch({ data: 'some data' });

      expect(result).toBeUndefined();
    });
  });

  describe('handler error catching', () => {
    it('should catch and return structured error when handler throws', async () => {
      router.registerHandler('failing.action', async () => {
        throw new Error('Something went wrong');
      });

      const result = await router.dispatch({ type: 'failing.action' });

      expect(isErrorResponse(result)).toBe(true);
      const errorResult = result as MessageErrorResponse;
      expect(errorResult.success).toBe(false);
      expect(errorResult.error.type).toBe('handler_error');
      expect(errorResult.error.message).toContain('Something went wrong');
      expect(errorResult.error.handler).toBe('failing.action');
    });

    it('should include error stack in details for Error objects', async () => {
      router.registerHandler('failing.action', async () => {
        throw new Error('Stack trace test');
      });

      const result = await router.dispatch({ type: 'failing.action' });

      expect(isErrorResponse(result)).toBe(true);
      const errorResult = result as MessageErrorResponse;
      const details = errorResult.error.details as { stack?: string };
      expect(details.stack).toBeDefined();
    });

    it('should handle non-Error throws gracefully', async () => {
      router.registerHandler('string.throw', async () => {
        throw 'Just a string';
      });

      const result = await router.dispatch({ type: 'string.throw' });

      expect(isErrorResponse(result)).toBe(true);
      const errorResult = result as MessageErrorResponse;
      expect(errorResult.error.message).toContain('Just a string');
    });
  });

  describe('successful message handling', () => {
    it('should return handler result for known message types', async () => {
      router.registerHandler('test.action', async () => ({
        success: true,
        data: 'test result',
      }));

      const result = await router.dispatch({ type: 'test.action' });

      expect(result).toEqual({
        success: true,
        data: 'test result',
      });
    });

    it('should pass message data to handler', async () => {
      const receivedData = jest.fn();
      router.registerHandler('data.action', async (data) => {
        receivedData(data);
        return { success: true };
      });

      await router.dispatch({ type: 'data.action', foo: 'bar', count: 42 });

      expect(receivedData).toHaveBeenCalledWith(
        expect.objectContaining({
          foo: 'bar',
          count: 42,
        }),
      );
    });
  });

  describe('legacy vs hexagonal routing', () => {
    it('should track migration flags for message types', () => {
      router.setMigrationFlag('legacy.action', true);
      router.setMigrationFlag('hex.action', false);

      expect(router.shouldUseLegacy('legacy.action')).toBe(true);
      expect(router.shouldUseLegacy('hex.action')).toBe(false);
      expect(router.shouldUseLegacy('unknown.action')).toBe(false); // Default to hex
    });
  });

  describe('error response utilities', () => {
    it('invalidParamsResponse should create proper structure', () => {
      const response = invalidParamsResponse('test.handler', 'missing required field');

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('invalid_params');
      expect(response.error.handler).toBe('test.handler');
      expect(response.error.message).toContain('missing required field');
    });

    it('notInitializedResponse should create proper structure', () => {
      const response = notInitializedResponse('AudioEngine');

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('not_initialized');
      expect(response.error.message).toContain('AudioEngine');
    });

    it('timeoutResponse should create proper structure', () => {
      const response = timeoutResponse('slow.handler', 30000);

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('timeout');
      expect(response.error.handler).toBe('slow.handler');
      expect(response.error.message).toContain('30000ms');
    });

    it('internalErrorResponse should create proper structure', () => {
      const response = internalErrorResponse('Database connection failed', { code: 'ECONNREFUSED' });

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('internal_error');
      expect(response.error.message).toBe('Database connection failed');
      expect(response.error.details).toEqual({ code: 'ECONNREFUSED' });
    });
  });

  describe('no unhandled exceptions', () => {
    it('should never throw when dispatching unknown messages', async () => {
      // This should not throw
      await expect(router.dispatch({ type: 'completely.unknown' })).resolves.not.toThrow();
    });

    it('should never throw when dispatching malformed messages', async () => {
      // These should not throw
      await expect(router.dispatch({} as never)).resolves.not.toThrow();
      await expect(router.dispatch({ random: 'data' })).resolves.not.toThrow();
    });

    it('should never throw when handler errors occur', async () => {
      router.registerHandler('error.handler', async () => {
        throw new TypeError('Cannot read property of undefined');
      });

      // This should not throw, but return an error response
      await expect(router.dispatch({ type: 'error.handler' })).resolves.not.toThrow();
    });
  });
});
