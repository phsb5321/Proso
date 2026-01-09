# E2E Testing on NixOS

This guide explains how to run VoxPage E2E tests on NixOS systems.

## Overview

Playwright's downloaded browsers don't work on NixOS due to dynamic linker incompatibilities. VoxPage E2E tests are configured to automatically detect and use system browsers (Chromium) when available.

## Quick Start

### Using nix-shell (Recommended)

```bash
# Enter the development shell
nix-shell

# Build extension and run E2E tests
pnpm build:chrome && pnpm test:e2e:ext
```

The `shell.nix` file provides:
- Node.js 20.x
- pnpm package manager
- System Chromium and Firefox
- All required system libraries for headless browser testing

### Manual Setup

If you prefer not to use nix-shell:

1. **Ensure Chromium is installed**:
   ```bash
   # In your configuration.nix or home-manager
   environment.systemPackages = with pkgs; [ chromium ];
   ```

2. **Verify Chromium is available**:
   ```bash
   which chromium
   ```

3. **Run E2E tests**:
   ```bash
   pnpm build:chrome && pnpm test:e2e:ext
   ```

## How It Works

The extension fixture (`tests/e2e/extension/fixtures/extension.fixture.ts`) automatically:

1. Searches for system Chromium using `which chromium`
2. Falls back to checking `CHROMIUM_PATH` or `CHROME_PATH` environment variables
3. Uses the system browser's executable path for Playwright

### Browser Detection Order

1. `chromium` (NixOS standard)
2. `chromium-browser` (Debian/Ubuntu)
3. `google-chrome` (Google Chrome)
4. `google-chrome-stable` (Google Chrome stable channel)
5. `CHROMIUM_PATH` environment variable
6. `CHROME_PATH` environment variable

## Headless Mode

Tests run in Chrome's "new headless" mode (`--headless=new`) which supports extensions. This requires Chrome/Chromium 109+.

## Troubleshooting

### "Executable doesn't exist" Error

If you see this error, Playwright is trying to use its downloaded browser:

```
Error: browserType.launchPersistentContext: Executable doesn't exist at /nix/store/.../chrome-linux64/chrome
```

**Solution**: Ensure system Chromium is in your PATH:
```bash
which chromium  # Should return a path
```

### Content Script Not Injecting

The extension doesn't inject into `file://` URLs by default. For testing:
- Use `https://` URLs (like `https://example.com`)
- Or enable "Allow access to file URLs" in `chrome://extensions`

### Library Errors

If you see missing library errors, ensure all dependencies are available:

```bash
nix-shell  # This sets up LD_LIBRARY_PATH correctly
```

### Slow Test Startup

First run may be slow as the browser initializes. Subsequent runs should be faster.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CHROMIUM_PATH` | Override Chromium executable path |
| `CHROME_PATH` | Fallback Chrome executable path |
| `PLAYWRIGHT_BROWSERS_PATH` | Should be unset on NixOS |

## Docker Alternative

For CI environments without NixOS, use the Docker fallback:

```bash
./scripts/e2e-docker.sh
```

This runs tests in an Ubuntu-based container with standard Playwright browser installation.

## Visual Tests (Firefox)

For Firefox-based visual regression tests:

```bash
# Using the NixOS setup script
./scripts/nixos-playwright-setup.sh pnpm test:visual
```

Or manually:
```bash
export FIREFOX_PATH=$(which firefox)
pnpm test:visual
```
