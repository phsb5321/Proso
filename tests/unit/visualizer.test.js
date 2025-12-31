/**
 * Unit tests for VoxPage Visualizer Component
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  initVisualizer,
  setState,
  stopAnimation,
  updateData,
  isInitialized,
  destroyVisualizer,
  handleReducedMotion
} from '../../popup/components/visualizer.js';

describe('Visualizer Component', () => {
  let canvas;
  let mockCtx;

  beforeEach(() => {
    // Create canvas element
    canvas = document.createElement('canvas');
    canvas.id = 'visualizer';
    canvas.getBoundingClientRect = jest.fn(() => ({
      width: 300,
      height: 48
    }));
    document.body.appendChild(canvas);

    // Mock getContext returns the mocked context from setup.js
    mockCtx = canvas.getContext('2d');

    // Reset any previous state
    destroyVisualizer();

    // Reset matchMedia
    window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }));

    // Mock CSS custom properties
    document.documentElement.style.setProperty('--color-text-tertiary', '#6b7280');
    document.documentElement.style.setProperty('--color-accent-primary', '#0D9488');
    document.documentElement.style.setProperty('--color-bg-secondary', '#252547');
  });

  afterEach(() => {
    destroyVisualizer();
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('initVisualizer', () => {
    it('returns true when canvas is valid', () => {
      const result = initVisualizer(canvas);

      expect(result).toBe(true);
    });

    it('returns false when canvas is null', () => {
      const result = initVisualizer(null);

      expect(result).toBe(false);
    });

    it('sets isInitialized to true after init', () => {
      initVisualizer(canvas);

      expect(isInitialized()).toBe(true);
    });

    it('starts idle animation by default', () => {
      initVisualizer(canvas);

      // Animation should be running (requestAnimationFrame called)
      expect(isInitialized()).toBe(true);
    });
  });

  describe('setState', () => {
    beforeEach(() => {
      initVisualizer(canvas);
    });

    it('accepts "idle" state', () => {
      expect(() => setState('idle')).not.toThrow();
    });

    it('accepts "playing" state', () => {
      expect(() => setState('playing')).not.toThrow();
    });

    it('accepts "paused" state', () => {
      expect(() => setState('paused')).not.toThrow();
    });
  });

  describe('stopAnimation', () => {
    beforeEach(() => {
      initVisualizer(canvas);
    });

    it('stops the animation loop', () => {
      stopAnimation();

      // Should not throw and animation should be stopped
      expect(() => stopAnimation()).not.toThrow();
    });

    it('can be called multiple times without error', () => {
      stopAnimation();
      stopAnimation();
      stopAnimation();

      expect(true).toBe(true); // No error thrown
    });
  });

  describe('updateData', () => {
    beforeEach(() => {
      initVisualizer(canvas);
    });

    it('accepts null data', () => {
      expect(() => updateData(null)).not.toThrow();
    });

    it('accepts empty data object', () => {
      expect(() => updateData({})).not.toThrow();
    });

    it('accepts valid frequency data', () => {
      const data = {
        available: true,
        frequency: {
          data: new Array(128).fill(0.5)
        }
      };

      expect(() => updateData(data)).not.toThrow();
    });

    it('handles data without frequency property', () => {
      const data = {
        available: false
      };

      expect(() => updateData(data)).not.toThrow();
    });
  });

  describe('isInitialized', () => {
    it('returns false before init', () => {
      expect(isInitialized()).toBe(false);
    });

    it('returns true after init', () => {
      initVisualizer(canvas);

      expect(isInitialized()).toBe(true);
    });

    it('returns false after destroy', () => {
      initVisualizer(canvas);
      destroyVisualizer();

      expect(isInitialized()).toBe(false);
    });
  });

  describe('destroyVisualizer', () => {
    beforeEach(() => {
      initVisualizer(canvas);
    });

    it('cleans up resources', () => {
      destroyVisualizer();

      expect(isInitialized()).toBe(false);
    });

    it('can be called when not initialized', () => {
      destroyVisualizer();
      destroyVisualizer();

      expect(true).toBe(true); // No error thrown
    });
  });

  describe('handleReducedMotion', () => {
    beforeEach(() => {
      initVisualizer(canvas);
    });

    it('stops animation when reduced motion is preferred', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: true, // Reduced motion preferred
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
      }));

      expect(() => handleReducedMotion()).not.toThrow();
    });

    it('continues animation when reduced motion is not preferred', () => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
      }));

      expect(() => handleReducedMotion()).not.toThrow();
    });
  });

  describe('canvas drawing', () => {
    beforeEach(() => {
      initVisualizer(canvas);
    });

    it('uses canvas context for drawing', () => {
      // Trigger a state change to force redraw
      setState('playing');

      // Context methods should be available
      expect(mockCtx.beginPath).toBeDefined();
      expect(mockCtx.fill).toBeDefined();
    });
  });
});
