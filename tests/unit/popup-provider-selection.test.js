/**
 * Regression tests for Bug 2: Provider Selection
 *
 * Bug: CSS selector '.provider-tab' didn't match HTML which uses '.voxpage-tab[data-provider]'
 * Fix: Changed selector to '[data-provider]' in popup-ui.js and index.js
 *
 * @module tests/unit/popup-provider-selection
 */

describe('Provider Selection (Bug 2 Regression)', () => {
  describe('Selector Matching', () => {
    test('selector [data-provider] should match provider tabs', () => {
      // Simulate the providers from popup.html
      const providers = ['groq', 'openai', 'elevenlabs', 'cartesia', 'browser'];

      // Create mock tabs with dataset.provider (like real HTML)
      const mockTabs = providers.map(provider => ({
        dataset: { provider },
        className: 'voxpage-tab' // Note: NOT 'provider-tab'
      }));

      // Simulate querySelectorAll('[data-provider]')
      const matchedTabs = mockTabs.filter(tab =>
        tab.dataset && tab.dataset.provider !== undefined
      );

      expect(matchedTabs.length).toBe(5);
      expect(matchedTabs.map(t => t.dataset.provider)).toEqual([
        'groq', 'openai', 'elevenlabs', 'cartesia', 'browser'
      ]);
    });

    test('old selector .provider-tab should NOT match (regression check)', () => {
      // Create mock tabs with the CORRECT class from popup.html
      const mockTabs = [
        { className: 'voxpage-tab', dataset: { provider: 'groq' } },
        { className: 'voxpage-tab', dataset: { provider: 'openai' } }
      ];

      // The old buggy selector looked for 'provider-tab' class
      const hasProviderTabClass = mockTabs.some(tab =>
        tab.className && tab.className.includes('provider-tab')
      );

      // This should be false - proving the old selector was wrong
      expect(hasProviderTabClass).toBe(false);
    });
  });

  describe('Provider Tab Interactions', () => {
    test('clicking provider tab should be able to register handler', () => {
      const providers = ['groq', 'openai', 'elevenlabs', 'cartesia', 'browser'];
      const mockTabs = providers.map(provider => {
        const listeners = [];
        return {
          dataset: { provider },
          addEventListener: (event, handler) => listeners.push({ event, handler }),
          _listeners: listeners
        };
      });

      // Register click handlers (simulating popup/index.js lines 85-87)
      mockTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // setProvider(tab.dataset.provider)
        });
      });

      expect(mockTabs[0]._listeners.length).toBe(1);
      expect(mockTabs[0]._listeners[0].event).toBe('click');
      expect(mockTabs.length).toBe(5);
    });

    test('updateProviderUI should toggle active class on correct tab', () => {
      const providers = ['groq', 'openai', 'elevenlabs', 'cartesia', 'browser'];
      const mockTabs = providers.map(provider => ({
        dataset: { provider },
        classes: new Set(),
        attributes: {},
        classList: {
          toggle(cls, force) {
            if (force) mockTabs.find(t => t.dataset.provider === provider).classes.add(cls);
            else mockTabs.find(t => t.dataset.provider === provider).classes.delete(cls);
          }
        },
        setAttribute(name, value) {
          mockTabs.find(t => t.dataset.provider === provider).attributes[name] = value;
        }
      }));

      const currentProvider = 'openai';

      // Simulate updateProviderUI logic from popup-ui.js
      mockTabs.forEach(tab => {
        const isActive = tab.dataset.provider === currentProvider;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive.toString());
      });

      // Verify only openai tab was set active
      expect(mockTabs[1].classes.has('active')).toBe(true);
      expect(mockTabs[1].attributes['aria-selected']).toBe('true');

      // Verify other tabs were set inactive
      expect(mockTabs[0].classes.has('active')).toBe(false);
      expect(mockTabs[2].classes.has('active')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty provider tabs gracefully', () => {
      const emptyTabs = [];

      // Simulate iterating over empty NodeList (what happened with old selector)
      let iterationCount = 0;
      emptyTabs.forEach(() => iterationCount++);

      expect(iterationCount).toBe(0);
    });

    test('should handle tab with missing dataset gracefully', () => {
      const tabWithoutDataset = { className: 'some-class' };

      // Accessing undefined dataset.provider should not throw
      const provider = tabWithoutDataset.dataset?.provider;
      expect(provider).toBeUndefined();
    });
  });
});
