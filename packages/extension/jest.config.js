/**
 * Jest Configuration for Proso
 * ES Modules support with WebExtension mocking and TypeScript
 *
 * Test types:
 * - unit: Fast, isolated tests (<5ms each)
 * - contract: Port interface compliance tests
 * - integration: Cross-module flow tests
 * - security: CSP compliance and build artifact tests
 * - regression: Regression tests
 */

// Shared configuration for all projects
const sharedConfig = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['jest-webextension-mock', '<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.ts$': '$1',
    // Vite/UnoCSS virtual modules exist only at build time; entrypoint tests
    // import the module under test, not its styling.
    '^virtual:.*\\.css$': '<rootDir>/tests/mocks/virtual-css.js',
    '^@/(.*)$': '<rootDir>/src/utils/$1',
    '^@proso/shared$': '<rootDir>/../shared/src/index.ts',
    '^@proso/shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.json',
        diagnostics: false,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: ['/node_modules/(?!(lamejs|tesseract-wasm)/)'],
};

export default {
  // Use projects for selective test running
  projects: [
    {
      ...sharedConfig,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js', '<rootDir>/tests/unit/**/*.test.ts'],
    },
    {
      ...sharedConfig,
      displayName: 'contract',
      testMatch: ['<rootDir>/tests/contract/**/*.test.js', '<rootDir>/tests/contract/**/*.test.ts'],
    },
    {
      ...sharedConfig,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
    },
    {
      ...sharedConfig,
      displayName: 'security',
      testMatch: ['<rootDir>/tests/security/**/*.test.ts'],
    },
    {
      ...sharedConfig,
      displayName: 'regression',
      testMatch: ['<rootDir>/tests/regression/**/*.test.js'],
    },
  ],

  // Coverage configuration
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!**/node_modules/**'],
  // Thresholds are a regression ratchet pinned just below current measured full-suite
  // coverage (~36% stmts / 31% branches / 43% funcs / 37% lines). Large glue surfaces are
  // intentionally not unit-covered: src/entrypoints (UI, 0% — covered by visual/e2e) and
  // src/background (init wiring, 0%). Raising toward 60% is tracked coverage debt; these
  // floors prevent regression without gating CI on an unmet target.
  coverageThreshold: {
    global: {
      statements: 35,
      branches: 30,
      functions: 41,
      lines: 35,
    },
  },
  verbose: true,
};
