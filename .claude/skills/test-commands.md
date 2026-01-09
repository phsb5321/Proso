# VoxPage Test Commands Quick Reference

## Essential Commands

```bash
# Run unit tests
pnpm test

# Run extension E2E tests (Chromium)
pnpm build:chrome && pnpm test:e2e:ext

# Run visual regression tests (Firefox)
pnpm test:visual

# Run all tests
pnpm test:all
```

## Extension E2E (Chromium)

```bash
# Standard run
pnpm test:e2e:ext

# With interactive UI
pnpm test:e2e:ext:ui

# Single file
npx playwright test tests/e2e/extension/stability.spec.ts --project=chromium-extension

# Debug mode
PWDEBUG=1 pnpm test:e2e:ext

# Docker (CI fallback)
pnpm test:e2e:ext:docker
```

## Visual Tests (Firefox)

```bash
# Run tests
pnpm test:visual

# Update baselines
pnpm test:visual:update

# Single file
npx playwright test tests/visual/sticky-footer.test.js --project=firefox-visual
```

## Diagnostics

```bash
# View HTML report
npx playwright show-report

# View trace from failed test
npx playwright show-trace test-results/*/trace.zip

# Check Playwright version
npx playwright --version

# List available projects
npx playwright test --list
```

## NixOS

```bash
# Enter dev shell
nix-shell

# Verify browsers
which chromium firefox

# Run with explicit paths
CHROMIUM_PATH=$(which chromium) pnpm test:e2e:ext
FIREFOX_PATH=$(which firefox) pnpm test:visual
```

## Test Structure

```
tests/
  e2e/
    extension/           # Chromium extension tests
      fixtures/          # Test fixtures
        extension.fixture.ts
        console.fixture.ts
        audio.fixture.ts
      audio-playback.spec.ts
      console-errors.spec.ts
      stability.spec.ts
    *.e2e.test.ts        # Firefox E2E tests
  visual/                # Visual regression tests
    *.test.js
```

## Current Status

| Project | Pass | Skip | Total |
|---------|------|------|-------|
| chromium-extension | 13 | 7 | 20 |
| firefox-e2e | Requires Firefox | - | 70 |
| firefox-visual | Requires Firefox | - | varies |
