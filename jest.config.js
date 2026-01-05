/**
 * Jest Configuration for VoxPage
 * ES Modules support with WebExtension mocking and TypeScript
 */
export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: [
    'jest-webextension-mock',
    '<rootDir>/tests/setup.js'
  ],
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/unit/**/*.test.ts',
    '**/tests/contract/**/*.test.js',
    '**/tests/contract/**/*.test.ts',
    '**/tests/regression/**/*.test.js'
  ],
  collectCoverageFrom: [
    'popup/components/**/*.js',
    'utils/**/*.ts',
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
  verbose: true
};
