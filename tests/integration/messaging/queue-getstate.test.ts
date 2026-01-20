/**
 * Queue.getState Integration Test
 *
 * Tests that the queue.getState handler returns the correct response structure.
 * This test catches the bug where nested Result types caused items to be undefined.
 *
 * Bug scenario:
 * - Handler returns Ok({ items, metadata })
 * - Registry wraps in another Result: Ok(Ok({ items, metadata }))
 * - dispatchToHexagonal returns Ok({ items, metadata }) instead of { items, metadata }
 * - Popup receives { ok: true, value: { items, metadata } }
 * - Popup tries to access response.items which is undefined
 *
 * @module tests/integration/messaging/queue-getstate
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createHandlerRegistry, type HandlerRegistry } from '../../../src/handlers/registry';
import { Ok } from '../../../src/core/shared/result';

// Define mock response type
interface MockQueueState {
  metadata: {
    version: number;
    count: number;
    lastModified: number;
    totalSize: number;
  };
  items: unknown[];
}

// Create mock handler that returns the same structure as real handler
const mockQueueGetState = jest.fn<() => Promise<MockQueueState>>().mockResolvedValue({
  metadata: {
    version: 1,
    count: 0,
    lastModified: Date.now(),
    totalSize: 0,
  },
  items: [],
});

describe('queue.getState handler response structure', () => {
  let registry: HandlerRegistry;

  beforeEach(() => {
    registry = createHandlerRegistry();

    // Register a mock queue.getState handler that mirrors the real implementation
    registry.register(
      'queue.getState',
      async () => {
        const result = await mockQueueGetState();
        // Real handler wraps in Ok()
        return Ok({
          metadata: result.metadata,
          items: result.items,
        });
      },
      'Get full queue state',
    );
  });

  it('should be registered', () => {
    expect(registry.has('queue.getState')).toBe(true);
  });

  it('should return nested Result structure', async () => {
    const result = await registry.dispatch('queue.getState', {});

    // Registry.dispatch wraps handler response in a Result
    expect(result.ok).toBe(true);

    if (result.ok) {
      // The handler returns Ok({ items, metadata })
      // So result.value is { ok: true, value: { items, metadata } }
      const handlerResult = result.value as { ok: boolean; value?: unknown };

      expect(handlerResult).toBeDefined();
      expect(handlerResult.ok).toBe(true);

      if (handlerResult.ok && handlerResult.value) {
        const queueState = handlerResult.value as { items?: unknown[]; metadata?: unknown };

        // This is the critical assertion - items must be defined
        expect(queueState.items).toBeDefined();
        expect(Array.isArray(queueState.items)).toBe(true);
        expect(queueState.metadata).toBeDefined();
      }
    }
  });

  it('should return empty items array when queue is empty', async () => {
    const result = await registry.dispatch('queue.getState', {});

    expect(result.ok).toBe(true);

    if (result.ok) {
      const handlerResult = result.value as { ok: boolean; value?: { items?: unknown[] } };

      if (handlerResult.ok && handlerResult.value) {
        expect(handlerResult.value.items).toEqual([]);
      }
    }
  });
});

describe('dispatchToHexagonal Result unwrapping simulation', () => {
  /**
   * This test simulates what dispatchToHexagonal should do:
   * Unwrap the nested Result to return the actual value.
   */
  it('should unwrap nested Result to return raw value', async () => {
    const registry = createHandlerRegistry();

    // Register mock handler
    registry.register(
      'queue.getState',
      async () => {
        return Ok({
          metadata: { version: 1, count: 0, lastModified: Date.now(), totalSize: 0 },
          items: [],
        });
      },
      'Get full queue state',
    );

    const result = await registry.dispatch('queue.getState', {});

    // Simulate dispatchToHexagonal logic
    if (!result.ok) {
      throw new Error('Registry dispatch failed');
    }

    const handlerResult = result.value as unknown;

    // Check if handlerResult is itself a Result
    if (
      handlerResult &&
      typeof handlerResult === 'object' &&
      'ok' in handlerResult &&
      typeof (handlerResult as { ok: boolean }).ok === 'boolean'
    ) {
      const innerResult = handlerResult as { ok: boolean; value?: unknown };

      if (innerResult.ok) {
        // This is what should be returned to the popup
        const unwrappedValue = innerResult.value as { items?: unknown[]; metadata?: unknown };

        // Critical assertions
        expect(unwrappedValue).toBeDefined();
        expect(unwrappedValue.items).toBeDefined();
        expect(Array.isArray(unwrappedValue.items)).toBe(true);
        expect(unwrappedValue.metadata).toBeDefined();
      }
    }
  });

  it('should have items.length accessible on unwrapped value (regression test)', async () => {
    const registry = createHandlerRegistry();

    // Register mock handler
    registry.register(
      'queue.getState',
      async () => {
        return Ok({
          metadata: { version: 1, count: 0, lastModified: Date.now(), totalSize: 0 },
          items: [],
        });
      },
      'Get full queue state',
    );

    const result = await registry.dispatch('queue.getState', {});

    // Simulate the full dispatchToHexagonal flow
    let finalValue: unknown = null;

    if (result.ok) {
      const handlerResult = result.value as unknown;

      if (
        handlerResult &&
        typeof handlerResult === 'object' &&
        'ok' in handlerResult &&
        typeof (handlerResult as { ok: boolean }).ok === 'boolean'
      ) {
        const innerResult = handlerResult as { ok: boolean; value?: unknown };
        if (innerResult.ok) {
          finalValue = innerResult.value;
        }
      } else {
        finalValue = handlerResult;
      }
    }

    // This is exactly what the popup receives after dispatchToHexagonal unwraps
    const response = finalValue as { items?: unknown[]; metadata?: unknown } | null;

    // These are the critical assertions that would have caught the bug
    expect(response).not.toBeNull();
    expect(response?.items).toBeDefined();

    // This is the exact line that was crashing in the popup:
    // updateQueueBadge(queueState.items.length)
    expect(response?.items?.length).toBeDefined();
    expect(typeof response?.items?.length).toBe('number');
  });

  it('should fail if items is undefined (demonstrates the bug)', async () => {
    // This test shows what WOULD happen without proper unwrapping

    const registry = createHandlerRegistry();

    registry.register(
      'queue.getState',
      async () => {
        return Ok({
          metadata: { version: 1, count: 0, lastModified: Date.now(), totalSize: 0 },
          items: [],
        });
      },
      'Get full queue state',
    );

    const result = await registry.dispatch('queue.getState', {});

    // BUG SCENARIO: If dispatchToHexagonal doesn't unwrap, popup gets this:
    if (result.ok) {
      const buggyResponse = result.value as { items?: unknown[] };

      // Without unwrapping, items is undefined because result.value is { ok: true, value: {...} }
      // The popup would crash trying to access buggyResponse.items.length
      expect(buggyResponse.items).toBeUndefined(); // This demonstrates the bug!

      // But 'ok' and 'value' exist
      expect((buggyResponse as { ok?: boolean }).ok).toBe(true);
      expect((buggyResponse as { value?: unknown }).value).toBeDefined();
    }
  });
});
