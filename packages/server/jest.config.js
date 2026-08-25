/** @type {import('jest').Config} */
module.exports = {
  // A single externally-provisioned database (CI `services:` block, handed over
  // as TEST_DATABASE_URL) is SHARED by every contract suite, and those suites
  // truncate tables between tests. Run serially in that mode or they delete
  // each other's rows mid-assertion — measured: 4 of 98 failed in parallel, all
  // 98 pass with one worker. Unset (local dev), each suite gets its own
  // throwaway testcontainer, so parallelism stays safe and is left alone.
  ...(process.env.TEST_DATABASE_URL ? { maxWorkers: 1 } : {}),
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@proso/shared$': '<rootDir>/../shared/src',
    '^@proso/shared/(.*)$': '<rootDir>/../shared/src/$1',
    // Strip .js extensions from imports (shared package uses ESM-style .js extensions)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
