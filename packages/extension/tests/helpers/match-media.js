/**
 * Shared `window.matchMedia` mock.
 *
 * jsdom ships no `matchMedia`, so the global setup installs one and the
 * reduced-motion suite swaps in its own. Written out in both places the two
 * stubs are close enough to register as a duplication finding, so they share
 * this one.
 *
 * @param {boolean} [reducedMotion] - whether `(prefers-reduced-motion: reduce)` matches
 * @returns {jest.Mock} a `matchMedia` implementation
 */
import { jest } from '@jest/globals';

export function createMatchMediaMock(reducedMotion = false) {
  return jest.fn().mockImplementation((query) => ({
    matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}
