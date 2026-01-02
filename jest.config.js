/**
 * Jest Configuration for VoxPage
 * ES Modules support with WebExtension mocking
 */
export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: [
    'jest-webextension-mock',
    '<rootDir>/tests/setup.js'
  ],
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/contract/**/*.test.js',
    '**/tests/regression/**/*.test.js'
  ],
  collectCoverageFrom: [
    'popup/components/**/*.js',
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
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
  verbose: true
};
