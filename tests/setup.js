/**
 * Jest Setup File for VoxPage
 * Additional setup after jest-webextension-mock
 */

import { jest } from '@jest/globals';

// Mock browser.storage.local for testing
if (typeof browser === 'undefined') {
  global.browser = {
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined)
      }
    },
    runtime: {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      }
    }
  };
}

// Mock requestAnimationFrame for canvas tests
global.requestAnimationFrame = (callback) => setTimeout(callback, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock canvas context for visualizer tests
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(() => ({ data: new Array(4).fill(0) })),
  putImageData: jest.fn(),
  createLinearGradient: jest.fn(() => ({
    addColorStop: jest.fn()
  })),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  fill: jest.fn(),
  arc: jest.fn(),
  closePath: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  scale: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
  quadraticCurveTo: jest.fn(),
  bezierCurveTo: jest.fn(),
  drawImage: jest.fn(),
  createPattern: jest.fn(() => ({})),
  createRadialGradient: jest.fn(() => ({
    addColorStop: jest.fn()
  })),
  setTransform: jest.fn(),
  resetTransform: jest.fn(),
  clip: jest.fn(),
  rect: jest.fn(),
  fillText: jest.fn(),
  strokeText: jest.fn(),
  measureText: jest.fn(() => ({ width: 10 })),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  shadowBlur: 0,
  shadowColor: 'rgba(0,0,0,0)',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  canvas: {
    width: 300,
    height: 150
  }
}));

// Mock window.matchMedia for prefers-reduced-motion tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }))
});

// Suppress console errors during tests (optional)
// console.error = jest.fn();
