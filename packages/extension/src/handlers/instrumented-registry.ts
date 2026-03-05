/**
 * Instrumented Handler Registry
 *
 * Wraps HandlerRegistry with telemetry instrumentation for timing
 * and error tracking. All handler dispatches are automatically tracked.
 *
 * @module handlers/instrumented-registry
 */

import type { Result } from '../core/shared/result';
import { usageTracker } from '../utils/telemetry/usage';
import type { Handler, HandlerError } from './registry';
import { HandlerRegistry } from './registry';

/**
 * Generate a short unique ID for action correlation.
 * Uses crypto.randomUUID if available, falls back to timestamp + random.
 */
function generateActionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Map handler prefix to event type prefix.
 */
function getEventPrefix(handlerName: string): string {
  const prefix = handlerName.split('.')[0];

  // Map handler prefixes to telemetry event prefixes
  const prefixMap: Record<string, string> = {
    playback: 'playback',
    cache: 'cache',
    settings: 'settings',
    content: 'content',
    audio: 'audio',
    provider: 'provider',
    footer: 'highlight', // Footer relates to highlight sync
    prefetch: 'cache', // Prefetch is cache-related
    queue: 'playback', // Queue is playback-related
    debug: 'system',
  };

  return prefixMap[prefix] || 'system';
}

/**
 * InstrumentedRegistry
 *
 * Extends HandlerRegistry with automatic telemetry for all dispatched handlers.
 * Tracks:
 * - Handler start/completion with timing
 * - Errors with actionId correlation
 * - Success/failure status
 */
export class InstrumentedRegistry extends HandlerRegistry {
  private instrumentationEnabled = true;

  /**
   * Enable or disable instrumentation.
   * Useful for testing or when telemetry is disabled.
   */
  setInstrumentationEnabled(enabled: boolean): void {
    this.instrumentationEnabled = enabled;
  }

  /**
   * Check if instrumentation is enabled.
   */
  isInstrumentationEnabled(): boolean {
    return this.instrumentationEnabled;
  }

  /**
   * Dispatch a message to the appropriate handler with telemetry instrumentation.
   *
   * @param name - Handler name
   * @param params - Handler parameters
   * @returns Result with handler response or error
   */
  override async dispatch<TParams = unknown, TResponse = unknown>(
    name: string,
    params: TParams,
  ): Promise<Result<TResponse, HandlerError>> {
    // Skip instrumentation if disabled or tracker not initialized
    if (!this.instrumentationEnabled || !usageTracker.isEnabled()) {
      return super.dispatch<TParams, TResponse>(name, params);
    }

    const actionId = generateActionId();
    const startTime = performance.now();
    const eventPrefix = getEventPrefix(name);

    // Track handler start (debug level, won't trigger flush)
    usageTracker.track(
      `${eventPrefix}.handler_started`,
      {
        handler: name,
        hasParams: params !== undefined && params !== null,
      },
      'debug',
      { actionId },
    );

    try {
      const result = await super.dispatch<TParams, TResponse>(name, params);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      if (result.ok) {
        // Track successful completion
        usageTracker.track(
          `${eventPrefix}.handler_completed`,
          {
            handler: name,
            durationMs,
            success: true,
          },
          'info',
          { actionId },
        );
      } else {
        // Track handler-level error (not found or execution failed)
        usageTracker.track(
          'error.handler_exception',
          {
            handler: name,
            durationMs,
            errorType: result.error.type,
            errorMessage: 'message' in result.error ? result.error.message : undefined,
          },
          'error',
          { actionId },
        );
      }

      return result;
    } catch (error) {
      // Track unexpected exceptions
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      usageTracker.track(
        'error.handler_exception',
        {
          handler: name,
          durationMs,
          errorMessage,
          errorStack,
        },
        'error',
        { actionId },
      );

      // Re-throw to preserve existing behavior
      throw error;
    }
  }
}

/**
 * Create a new instrumented handler registry.
 */
export function createInstrumentedRegistry(): InstrumentedRegistry {
  return new InstrumentedRegistry();
}

/**
 * Global instrumented registry instance (singleton pattern).
 */
let globalInstrumentedRegistry: InstrumentedRegistry | null = null;

/**
 * Get the global instrumented handler registry.
 * Creates one if it doesn't exist.
 */
export function getGlobalInstrumentedRegistry(): InstrumentedRegistry {
  if (!globalInstrumentedRegistry) {
    globalInstrumentedRegistry = new InstrumentedRegistry();
  }
  return globalInstrumentedRegistry;
}

/**
 * Reset the global instrumented handler registry (for testing).
 */
export function resetGlobalInstrumentedRegistry(): void {
  globalInstrumentedRegistry = null;
}

/**
 * Wrap an existing registry with instrumentation.
 * Useful when you need to add instrumentation to an existing registry.
 *
 * @param registry - Existing registry to wrap
 * @returns New instrumented registry with all handlers from original
 */
export function wrapWithInstrumentation(registry: HandlerRegistry): InstrumentedRegistry {
  const instrumented = new InstrumentedRegistry();

  // Copy all handlers from original registry
  for (const name of registry.getHandlerNames()) {
    const entry = registry.get(name);
    if (entry) {
      instrumented.register(name, entry.handler as Handler<unknown, unknown>, entry.description);
    }
  }

  return instrumented;
}
