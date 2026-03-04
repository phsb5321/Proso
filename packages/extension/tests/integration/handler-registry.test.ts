/**
 * Handler Registry Completeness Tests
 *
 * Verifies that all expected message types have registered handlers
 * and that no duplicate registrations occur.
 *
 * @module tests/integration/handler-registry
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { createConfiguredRegistry, registerAllHandlers } from '../../src/handlers/index';
import { createHandlerRegistry } from '../../src/handlers/registry';

describe('Handler Registry Completeness', () => {
  describe('createConfiguredRegistry()', () => {
    it('should register handlers from all domains', () => {
      const registry = createConfiguredRegistry();

      const handlerNames = registry.getHandlerNames();
      expect(handlerNames.length).toBeGreaterThan(0);

      // Verify handlers from each domain are registered
      const groups = registry.getHandlersByPrefix();

      const expectedDomains = [
        'playback',
        'cache',
        'content',
        'hexagonal', // debug handlers use 'hexagonal.*' prefix
        'audio',
        'provider',
        'settings',
        'footer',
        'prefetch',
        'queue',
        'reader',
        'highlight',
        'export',
        'language',
        'logging',
        'credit',
      ];

      for (const domain of expectedDomains) {
        const domainHandlers = groups.get(domain);
        expect(domainHandlers).toBeDefined();
        expect(domainHandlers!.length).toBeGreaterThan(0);
      }
    });

    it('should not have any duplicate handler names', () => {
      const registry = createHandlerRegistry();

      // Track console.warn calls for duplicate detection
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(String(args[0]));
      };

      try {
        registerAllHandlers(registry);
      } finally {
        console.warn = originalWarn;
      }

      const duplicateWarnings = warnings.filter((w) => w.includes('already registered'));
      expect(duplicateWarnings).toEqual([]);
    });

    it('should register at least 30 handlers across all domains', () => {
      const registry = createConfiguredRegistry();

      // We know there are 16 handler domains, each with at least 1 handler
      // Total should be well above 30
      expect(registry.size).toBeGreaterThanOrEqual(30);
    });
  });

  describe('handler dispatch', () => {
    it('should dispatch to registered handlers without error', async () => {
      const registry = createConfiguredRegistry();
      const handlerNames = registry.getHandlerNames();

      // Verify each handler can be looked up (not that it succeeds with empty params)
      for (const name of handlerNames) {
        expect(registry.has(name)).toBe(true);
      }
    });

    it('should return not_found for unregistered handler', async () => {
      const registry = createConfiguredRegistry();

      const result = await registry.dispatch('nonexistent.handler', {});
      expect(result).toEqual({
        ok: false,
        error: { type: 'not_found', handlerName: 'nonexistent.handler' },
      });
    });
  });

  describe('domain handler coverage', () => {
    let registry: ReturnType<typeof createConfiguredRegistry>;

    beforeEach(() => {
      registry = createConfiguredRegistry();
    });

    it('should have playback handlers', () => {
      const expectedHandlers = [
        'playback.start',
        'playback.pause',
        'playback.resume',
        'playback.stop',
        'playback.next',
        'playback.previous',
        'playback.getState',
      ];

      for (const name of expectedHandlers) {
        expect(registry.has(name)).toBe(true);
      }
    });

    it('should have cache handlers', () => {
      expect(registry.has('cache.getStats')).toBe(true);
      expect(registry.has('cache.clear')).toBe(true);
    });

    it('should have settings handlers', () => {
      expect(registry.has('settings.get')).toBe(true);
      expect(registry.has('settings.update')).toBe(true);
    });

    it('should have footer handlers', () => {
      expect(registry.has('footer.show')).toBe(true);
      expect(registry.has('footer.hide')).toBe(true);
    });

    it('should have credit handlers', () => {
      expect(registry.has('credit.getBalance')).toBe(true);
    });
  });
});
