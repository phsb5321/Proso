/**
 * Error Response Utilities
 *
 * Provides structured error responses for message handling.
 * Ensures consistent error format across hexagonal and legacy handlers.
 *
 * Firefox-First: These utilities work in both Firefox event pages
 * and Chrome service workers.
 *
 * @module utils/messaging/error-response
 */

/**
 * Standard error response structure.
 * All message handlers should return this format on error.
 */
export interface MessageErrorResponse {
  success: false;
  error: {
    /** Error type for programmatic handling */
    type: MessageErrorType;
    /** Human-readable error message */
    message: string;
    /** Handler name that failed (if applicable) */
    handler?: string;
    /** Original error details (for debugging) */
    details?: unknown;
  };
}

/**
 * Error types for message handling.
 */
export type MessageErrorType =
  | 'unknown_message'
  | 'handler_error'
  | 'invalid_params'
  | 'not_initialized'
  | 'timeout'
  | 'internal_error';

/**
 * Create a response for unknown/unhandled message types.
 *
 * @param messageType - The unknown message type received
 * @param availableHandlers - Optional list of available handlers for debugging
 * @returns Structured error response
 */
export function unknownMessageResponse(
  messageType: string,
  availableHandlers?: string[],
): MessageErrorResponse {
  return {
    success: false,
    error: {
      type: 'unknown_message',
      message: `Unknown message type: ${messageType}`,
      details: availableHandlers
        ? { availableHandlers: availableHandlers.slice(0, 20) }
        : undefined,
    },
  };
}

/**
 * Create a response for handler execution errors.
 *
 * @param handlerName - Name of the handler that failed
 * @param error - The error that occurred
 * @returns Structured error response
 */
export function handlerErrorResponse(handlerName: string, error: unknown): MessageErrorResponse {
  const message = error instanceof Error ? error.message : String(error);

  return {
    success: false,
    error: {
      type: 'handler_error',
      message: `Handler '${handlerName}' failed: ${message}`,
      handler: handlerName,
      details: error instanceof Error ? { name: error.name, stack: error.stack } : undefined,
    },
  };
}

/**
 * Create a response for invalid parameters.
 *
 * @param handlerName - Name of the handler
 * @param reason - Why the parameters are invalid
 * @returns Structured error response
 */
export function invalidParamsResponse(handlerName: string, reason: string): MessageErrorResponse {
  return {
    success: false,
    error: {
      type: 'invalid_params',
      message: `Invalid parameters for '${handlerName}': ${reason}`,
      handler: handlerName,
    },
  };
}

/**
 * Create a response for not initialized state.
 *
 * @param component - Component that is not initialized
 * @returns Structured error response
 */
export function notInitializedResponse(component: string): MessageErrorResponse {
  return {
    success: false,
    error: {
      type: 'not_initialized',
      message: `${component} is not initialized. Please wait for initialization to complete.`,
    },
  };
}

/**
 * Create a response for timeout errors.
 *
 * @param handlerName - Name of the handler that timed out
 * @param timeoutMs - The timeout duration in milliseconds
 * @returns Structured error response
 */
export function timeoutResponse(handlerName: string, timeoutMs: number): MessageErrorResponse {
  return {
    success: false,
    error: {
      type: 'timeout',
      message: `Handler '${handlerName}' timed out after ${timeoutMs}ms`,
      handler: handlerName,
    },
  };
}

/**
 * Create a response for internal errors.
 *
 * @param message - Error message
 * @param details - Optional details
 * @returns Structured error response
 */
export function internalErrorResponse(message: string, details?: unknown): MessageErrorResponse {
  return {
    success: false,
    error: {
      type: 'internal_error',
      message,
      details,
    },
  };
}

/**
 * Check if a response is an error response.
 *
 * @param response - Response to check
 * @returns True if response is an error
 */
export function isErrorResponse(response: unknown): response is MessageErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as { success: unknown }).success === false &&
    'error' in response
  );
}
