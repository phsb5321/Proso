/** @type {import('jest').Config} */
module.exports = {
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
    '^@voxpage/shared$': '<rootDir>/../shared/src',
    '^@voxpage/shared/(.*)$': '<rootDir>/../shared/src/$1',
    // Strip .js extensions from imports (shared package uses ESM-style .js extensions)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
