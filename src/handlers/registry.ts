/**
 * Handler Registry
 *
 * Central registry for message handlers in the hexagonal architecture.
 * Provides a clean abstraction for registering and dispatching handlers.
 *
 * @module handlers/registry
 */

import type { Result } from '../core/shared/result';
import { Err, Ok } from '../core/shared/result';

/**
 * Handler function signature.
 * Handlers receive params and return a Promise with the response.
 */
export type Handler<TParams = unknown, TResponse = unknown> = (
  params: TParams,
) => Promise<TResponse>;

/**
 * Handler error type.
 */
export type HandlerError =
  | { type: 'not_found'; handlerName: string }
  | { type: 'execution_failed'; handlerName: string; message: string };

/**
 * Handler registration entry.
 */
interface HandlerEntry {
  handler: Handler;
  description?: string;
}

/**
 * HandlerRegistry
 *
 * Manages registration and dispatch of message handlers.
 * Separates handler registration from message routing logic.
 */
export class HandlerRegistry {
  private handlers: Map<string, HandlerEntry> = new Map();

  /**
   * Register a handler for a message type.
   *
   * @param name - Handler name (e.g., 'playback.start', 'cache.get')
   * @param handler - Handler function
   * @param description - Optional description for documentation
   */
  register<TParams = unknown, TResponse = unknown>(
    name: string,
    handler: Handler<TParams, TResponse>,
    description?: string,
  ): void {
    if (this.handlers.has(name)) {
      console.warn(`Handler '${name}' already registered, overwriting`);
    }

    this.handlers.set(name, {
      handler: handler as Handler,
      description,
    });
  }

  /**
   * Unregister a handler.
   *
   * @param name - Handler name
   * @returns True if handler was removed
   */
  unregister(name: string): boolean {
    return this.handlers.delete(name);
  }

  /**
   * Check if a handler is registered.
   *
   * @param name - Handler name
   * @returns True if handler exists
   */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * Get handler by name.
   *
   * @param name - Handler name
   * @returns Handler entry or undefined
   */
  get(name: string): HandlerEntry | undefined {
    return this.handlers.get(name);
  }

  /**
   * Dispatch a message to the appropriate handler.
   *
   * @param name - Handler name
   * @param params - Handler parameters
   * @returns Result with handler response or error
   */
  async dispatch<TParams = unknown, TResponse = unknown>(
    name: string,
    params: TParams,
  ): Promise<Result<TResponse, HandlerError>> {
    const entry = this.handlers.get(name);

    if (!entry) {
      return Err({ type: 'not_found', handlerName: name });
    }

    try {
      const response = await entry.handler(params);
      return Ok(response as TResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Err({ type: 'execution_failed', handlerName: name, message });
    }
  }

  /**
   * Get all registered handler names.
   *
   * @returns Array of handler names
   */
  getHandlerNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handlers grouped by prefix (e.g., 'playback.*', 'cache.*').
   *
   * @returns Map of prefix to handler names
   */
  getHandlersByPrefix(): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const name of this.handlers.keys()) {
      const prefix = name.split('.')[0] || 'other';
      const existing = groups.get(prefix) || [];
      existing.push(name);
      groups.set(prefix, existing);
    }

    return groups;
  }

  /**
   * Get handler count.
   */
  get size(): number {
    return this.handlers.size;
  }

  /**
   * Clear all handlers.
   */
  clear(): void {
    this.handlers.clear();
  }
}

/**
 * Create a new handler registry.
 */
export function createHandlerRegistry(): HandlerRegistry {
  return new HandlerRegistry();
}

/**
 * Global handler registry instance (singleton pattern).
 */
let globalRegistry: HandlerRegistry | null = null;

/**
 * Get the global handler registry.
 * Creates one if it doesn't exist.
 */
export function getGlobalRegistry(): HandlerRegistry {
  if (!globalRegistry) {
    globalRegistry = new HandlerRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global handler registry (for testing).
 */
export function resetGlobalRegistry(): void {
  globalRegistry = null;
}
