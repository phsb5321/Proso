# Quickstart: Running CI Locally

**Feature**: 055-automated-testing-ci
**Date**: 2026-01-26

## Overview

This guide explains how to run the same checks locally that run in GitHub Actions CI. This helps catch issues before pushing and ensures local environment matches CI.

## Prerequisites

- Node.js 20.x
- pnpm 10.x
- Firefox (for visual/E2E tests)
- Chromium (for extension E2E tests)

## Running All CI Checks

To run the complete CI pipeline locally:

```bash
# 1. Fast checks (lint + typecheck)
pnpm run lint
pnpm run format:check
npx tsc --noEmit

# 2. Build
pnpm run build:firefox
pnpm run build:chrome

# 3. Unit tests with coverage
pnpm run test:unit -- --coverage

# 4. Contract tests
pnpm run test:contract

# 5. Integration tests
pnpm run test:integration

# 6. Security tests (requires build)
pnpm run test:security

# 7. Quality checks
pnpm run quality

# 8. E2E tests (requires build + browser)
pnpm run test:e2e
pnpm run test:e2e:ext
```

## Shortcut: Run Everything

```bash
# Runs lint + all Jest tests
pnpm test

# Runs lint + tests + quality + build
pnpm run prerelease
```

## Individual Test Commands

### Unit Tests

```bash
# Run all unit tests
pnpm run test:unit

# Run specific test file
pnpm run test:unit -- tests/unit/cache/eviction.test.ts

# Run tests matching pattern
pnpm run test:unit -- --testNamePattern="eviction"

# Run with coverage
pnpm run test:unit -- --coverage
```

### Contract Tests

```bash
# Run all contract tests
pnpm run test:contract

# Run specific contract test
pnpm run test:contract -- tests/contract/audio-generator.contract.test.ts
```

### Integration Tests

```bash
# Run all integration tests
pnpm run test:integration
```

### E2E Tests (Playwright)

```bash
# Firefox E2E (requires build first)
pnpm run build:firefox
pnpm run test:e2e

# Chromium extension E2E (requires Chrome build)
pnpm run build:chrome
pnpm run test:e2e:ext

# Run with UI mode (interactive debugging)
pnpm run test:e2e:ext:ui

# Run specific test file
npx playwright test tests/e2e/popup-ui.e2e.test.ts
```

### Visual Regression Tests

```bash
# Run visual tests
pnpm run test:visual

# Update snapshots after intentional UI changes
pnpm run test:visual:update
```

## Coverage Reports

After running tests with `--coverage`:

```bash
# View coverage summary in terminal
pnpm run test:unit -- --coverage

# Open HTML report
open coverage/lcov-report/index.html
```

### Coverage Thresholds

The following thresholds are enforced:

| Scope | Lines | Branches | Functions |
|-------|-------|----------|-----------|
| Global | 70% | 60% | 70% |
| `src/core/**` | 85% | 75% | 85% |
| `src/adapters/**` | 80% | 70% | 80% |

If coverage drops below these thresholds, tests will fail.

## Quality Checks

```bash
# Check for circular dependencies
pnpm run deps:check

# Check for code duplication
pnpm run duplication

# Validate Firefox manifest
pnpm run lint:manifest

# All quality checks together
pnpm run quality
```

## Debugging Test Failures

### Jest Tests

```bash
# Run with verbose output
pnpm run test:unit -- --verbose

# Run single test in watch mode
pnpm run test:unit -- --watch tests/unit/cache/eviction.test.ts

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest --runInBand tests/unit/cache/eviction.test.ts
```

### Playwright Tests

```bash
# Run with debug mode (opens browser devtools)
npx playwright test --debug tests/e2e/popup-ui.e2e.test.ts

# Run with trace viewer
npx playwright test --trace on
npx playwright show-trace test-results/*/trace.zip

# Generate HTML report
npx playwright show-report
```

## Environment Variables

### Required for Some Tests

```bash
# Set Firefox path (NixOS users)
export FIREFOX_PATH=$(which firefox)

# Optional: Loki telemetry testing
export LOKI_URL=https://your-loki-instance/loki/api/v1/push
export LOKI_USER=your-user
export LOKI_PASSWORD=your-password
```

### CI Detection

Tests may behave differently in CI:
- `CI=true` - Set automatically by GitHub Actions
- `NODE_OPTIONS='--experimental-vm-modules'` - Required for ESM support

## Matching CI Environment

To exactly match CI behavior:

```bash
# Set CI environment variable
CI=true NODE_OPTIONS='--experimental-vm-modules' pnpm run test:unit

# Or use the full CI command
CI=true pnpm test
```

## Common Issues

### "Cannot find module" errors

```bash
# Ensure dependencies are installed
pnpm install

# Clear Jest cache
npx jest --clearCache
```

### Playwright browser not found

```bash
# Install browsers
npx playwright install

# With system dependencies (Linux)
npx playwright install --with-deps
```

### Tests pass locally but fail in CI

1. Ensure `CI=true` is set locally
2. Check for timezone-dependent tests
3. Check for tests relying on network
4. Verify Node.js version matches (20.x)

### Coverage below threshold

```bash
# See which files need more coverage
pnpm run test:unit -- --coverage --coverageReporters=text

# Focus on uncovered lines
open coverage/lcov-report/index.html
```

## Pre-Push Checklist

Before pushing to create a PR:

```bash
# Quick check (most common failures)
pnpm run lint && pnpm run test:unit

# Full check (matches CI)
pnpm run prerelease

# If E2E tests are relevant to your changes
pnpm run build:firefox && pnpm run test:e2e
```
