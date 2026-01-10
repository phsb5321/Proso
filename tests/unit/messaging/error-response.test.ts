/**
 * Error Response Utilities Unit Tests
 *
 * Tests for structured error response utilities.
 *
 * @module tests/unit/messaging/error-response
 */

import { describe, it, expect } from '@jest/globals';
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

describe('Error Response Utilities', () => {
  describe('unknownMessageResponse', () => {
    it('should create a structured error for unknown message type', () => {
      const response = unknownMessageResponse('unknown.action');

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('unknown_message');
      expect(response.error.message).toContain('unknown.action');
    });

    it('should include available handlers when provided', () => {
      const handlers = ['playback.start', 'cache.get', 'settings.update'];
      const response = unknownMessageResponse('bad.action', handlers);

      expect(response.error.details).toBeDefined();
      expect((response.error.details as { availableHandlers: string[] }).availableHandlers).toEqual(
        handlers,
      );
    });

    it('should truncate available handlers list to 20 items', () => {
      const manyHandlers = Array.from({ length: 30 }, (_, i) => `handler.${i}`);
      const response = unknownMessageResponse('bad.action', manyHandlers);

      const details = response.error.details as { availableHandlers: string[] };
      expect(details.availableHandlers).toHaveLength(20);
    });
  });

  describe('handlerErrorResponse', () => {
    it('should create a structured error for handler failures', () => {
      const error = new Error('Something went wrong');
      const response = handlerErrorResponse('playback.start', error);

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('handler_error');
      expect(response.error.handler).toBe('playback.start');
      expect(response.error.message).toContain('Something went wrong');
    });

    it('should include stack trace for Error objects', () => {
      const error = new Error('Test error');
      const response = handlerErrorResponse('cache.get', error);

      const details = response.error.details as { name: string; stack: string };
      expect(details.name).toBe('Error');
      expect(details.stack).toBeDefined();
    });

    it('should handle non-Error objects', () => {
      const response = handlerErrorResponse('cache.get', 'string error');

      expect(response.error.message).toContain('string error');
      expect(response.error.details).toBeUndefined();
    });
  });

  describe('invalidParamsResponse', () => {
    it('should create a structured error for invalid parameters', () => {
      const response = invalidParamsResponse('audio.generate', 'text is required');

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('invalid_params');
      expect(response.error.handler).toBe('audio.generate');
      expect(response.error.message).toContain('text is required');
    });
  });

  describe('notInitializedResponse', () => {
    it('should create a structured error for uninitialized components', () => {
      const response = notInitializedResponse('PlaybackService');

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('not_initialized');
      expect(response.error.message).toContain('PlaybackService');
      expect(response.error.message).toContain('not initialized');
    });
  });

  describe('timeoutResponse', () => {
    it('should create a structured error for timeouts', () => {
      const response = timeoutResponse('audio.generate', 30000);

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('timeout');
      expect(response.error.handler).toBe('audio.generate');
      expect(response.error.message).toContain('30000ms');
    });
  });

  describe('internalErrorResponse', () => {
    it('should create a structured error for internal errors', () => {
      const response = internalErrorResponse('Unexpected state');

      expect(response.success).toBe(false);
      expect(response.error.type).toBe('internal_error');
      expect(response.error.message).toBe('Unexpected state');
    });

    it('should include details when provided', () => {
      const details = { code: 'ERR_001', context: 'startup' };
      const response = internalErrorResponse('Init failed', details);

      expect(response.error.details).toEqual(details);
    });
  });

  describe('isErrorResponse', () => {
    it('should return true for valid error responses', () => {
      const response = unknownMessageResponse('test');
      expect(isErrorResponse(response)).toBe(true);
    });

    it('should return false for success responses', () => {
      const response = { success: true, data: {} };
      expect(isErrorResponse(response)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isErrorResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isErrorResponse(undefined)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isErrorResponse('string')).toBe(false);
      expect(isErrorResponse(123)).toBe(false);
      expect(isErrorResponse(true)).toBe(false);
    });

    it('should return false for objects without success field', () => {
      expect(isErrorResponse({ error: 'test' })).toBe(false);
    });

    it('should return false for objects with success: true but error field', () => {
      expect(isErrorResponse({ success: true, error: { type: 'test' } })).toBe(false);
    });
  });

  describe('Response structure', () => {
    it('all error responses should have consistent structure', () => {
      const responses: MessageErrorResponse[] = [
        unknownMessageResponse('test'),
        handlerErrorResponse('test', new Error('test')),
        invalidParamsResponse('test', 'reason'),
        notInitializedResponse('test'),
        timeoutResponse('test', 1000),
        internalErrorResponse('test'),
      ];

      for (const response of responses) {
        expect(response).toHaveProperty('success', false);
        expect(response).toHaveProperty('error');
        expect(response.error).toHaveProperty('type');
        expect(response.error).toHaveProperty('message');
        expect(typeof response.error.type).toBe('string');
        expect(typeof response.error.message).toBe('string');
      }
    });
  });
});
