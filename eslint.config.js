/**
 * ESLint Flat Configuration for VoxPage
 * Validates ES module imports/exports to catch mismatches at lint time.
 *
 * @module eslint.config
 */

import importPlugin from 'eslint-plugin-import-x';

export default [
  {
    files: ['**/*.js'],
    ignores: [
      'node_modules/**',
      'coverage/**',
      'tests/**',
      'playwright-report/**',
      'test-results/**',
      '*.config.js',
      'jest.config.js',
      'playwright.config.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // WebExtension API
        browser: 'readonly',
        // DOM globals
        document: 'readonly',
        window: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        NodeList: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        // Console
        console: 'readonly',
        // Timers
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        // Web APIs
        fetch: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        // Audio/Visual APIs
        Audio: 'readonly',
        AudioContext: 'readonly',
        OfflineAudioContext: 'readonly',
        GainNode: 'readonly',
        AnalyserNode: 'readonly',
        // Canvas
        CanvasRenderingContext2D: 'readonly',
        // CSS Custom Highlight API
        CSS: 'readonly',
        Highlight: 'readonly',
        Range: 'readonly',
        // Events
        Event: 'readonly',
        CustomEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        // Storage
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        // Other
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        performance: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly'
      }
    },
    plugins: {
      'import-x': importPlugin
    },
    rules: {
      // Import/Export validation rules
      'import-x/named': 'error',
      'import-x/namespace': 'error',
      'import-x/default': 'error',
      'import-x/export': 'error',
      'import-x/no-unresolved': ['error', {
        ignore: ['^browser$']
      }]
    },
    settings: {
      'import-x/resolver': {
        node: {
          extensions: ['.js']
        }
      }
    }
  }
];
