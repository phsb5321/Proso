/**
 * Jest Configuration for VoxPage
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
  setupFilesAfterEnv: [
    'jest-webextension-mock',
    '<rootDir>/tests/setup.js'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.ts$': '$1',
    '^@/(.*)$': '<rootDir>/utils/$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.json'
    }]
  },
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(lamejs|tesseract-wasm)/)'
  ],
};

export default {
  // Use projects for selective test running
  projects: [
    {
      ...sharedConfig,
      displayName: 'unit',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.js',
        '<rootDir>/tests/unit/**/*.test.ts',
      ],
    },
    {
      ...sharedConfig,
      displayName: 'contract',
      testMatch: [
        '<rootDir>/tests/contract/**/*.test.js',
        '<rootDir>/tests/contract/**/*.test.ts',
      ],
    },
    {
      ...sharedConfig,
      displayName: 'integration',
      testMatch: [
        '<rootDir>/tests/integration/**/*.test.ts',
      ],
    },
    {
      ...sharedConfig,
      displayName: 'security',
      testMatch: [
        '<rootDir>/tests/security/**/*.test.ts',
      ],
    },
    {
      ...sharedConfig,
      displayName: 'regression',
      testMatch: [
        '<rootDir>/tests/regression/**/*.test.js',
      ],
    },
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70
    }
  },
  verbose: true
};
