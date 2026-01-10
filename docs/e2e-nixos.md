# E2E Testing on NixOS

This guide explains how to run VoxPage E2E and visual tests on NixOS systems.

## Overview

Playwright's downloaded browsers don't work on NixOS due to dynamic linker incompatibilities. VoxPage tests are configured to automatically detect and use system browsers when available.

**VoxPage is Firefox-first**, so Firefox visual tests are our primary testing target. Chromium extension tests serve as a proxy for extension functionality since Playwright doesn't support Firefox extension loading.

## Quick Start

### Using nix-shell (Recommended)

```bash
# Enter the development shell
nix-shell

# Run all tests
pnpm test                          # Unit tests
pnpm test:visual                   # Firefox visual tests
pnpm build:firefox && pnpm test:e2e:ext  # Extension E2E tests (Chromium)
```

The `shell.nix` file provides:
- Node.js 20.x
- pnpm package manager
- System Firefox and Chromium
- All required system libraries for headless browser testing

### Test Types

| Test Type | Browser | Command | Purpose |
|-----------|---------|---------|---------|
| Visual | Firefox | `pnpm test:visual` | Screenshot comparison |
| E2E Extension | Chromium | `pnpm test:e2e:ext` | Extension functionality |
| Unit | Node.js | `pnpm test` | Business logic |

## Firefox Visual Tests

Visual tests validate CSS styling, highlighting, and PDF rendering by comparing screenshots.

### Running Visual Tests

```bash
# Method 1: Using the NixOS setup script (recommended)
./scripts/nixos-playwright-setup.sh

# Method 2: Manual setup
export FIREFOX_PATH=$(which firefox)
npx playwright test --project=firefox-visual

# Method 3: From nix-shell
nix-shell --run "pnpm test:visual"
```

### Visual Test Categories

1. **Hover Preview** (`tests/visual/hover-preview.test.js`)
   - Paragraph selection styling
   - Play icon visibility
   - Light/dark mode support

2. **PDF Highlighting** (`tests/visual/pdf-highlight.test.js`)
   - Text layer span highlighting
   - Bounding box fallback
   - Multi-page navigation
   - Reduced motion support

3. **Settings Page** (`tests/visual/settings-page.test.js`)
   - Form styling
   - Provider selection

4. **Sticky Footer** (`tests/visual/sticky-footer.test.js`)
   - Playback controls
   - Progress bar

### Updating Snapshots

When intentionally changing styles, update the baseline snapshots:

```bash
export FIREFOX_PATH=$(which firefox)
npx playwright test --project=firefox-visual --update-snapshots
```

## Chromium Extension Tests

Since Playwright doesn't support Firefox extension loading, we use Chromium for extension E2E tests.

### Running Extension Tests

```bash
# Build extension first
pnpm build:firefox

# Run extension tests
pnpm test:e2e:ext
```

### Extension Test Categories

1. **Extension Loading** - Verifies extension initializes
2. **Popup UI** - Tests popup functionality
3. **Settings Page** - Tests options page
4. **Content Injection** - Tests content script loading
5. **Playback Flow** - Tests TTS functionality
6. **PDF Playback** - Tests PDF detection and handling

## Manual Setup (Without nix-shell)

### Install System Browsers

Add to your `configuration.nix` or home-manager:

```nix
# System-wide
environment.systemPackages = with pkgs; [
  firefox
  chromium
];

# Or with home-manager
home.packages = with pkgs; [
  firefox
  chromium
];
```

### Verify Installation

```bash
which firefox      # Should return a path
which chromium     # Should return a path
firefox --version  # Firefox 112+ required
```

### Run Tests

```bash
# Visual tests
export FIREFOX_PATH=$(which firefox)
npx playwright test --project=firefox-visual

# Extension tests
pnpm build:firefox && npx playwright test --project=chromium-extension
```

## Browser Detection

### Chromium Detection Order

The extension fixture searches for browsers in this order:

1. `chromium` (NixOS standard)
2. `chromium-browser` (Debian/Ubuntu)
3. `google-chrome` (Google Chrome)
4. `google-chrome-stable` (Google Chrome stable channel)
5. `CHROMIUM_PATH` environment variable
6. `CHROME_PATH` environment variable

### Firefox Detection

For visual tests, Firefox is detected via:

1. `FIREFOX_PATH` environment variable (recommended)
2. System `firefox` in PATH

## Headless Mode

- **Chromium**: Uses "new headless" mode (`--headless=new`) which supports extensions. Requires Chrome/Chromium 109+.
- **Firefox**: Uses standard headless mode for visual tests.

## Troubleshooting

### "Executable doesn't exist" Error

If you see this error, Playwright is trying to use its downloaded browser:

```
Error: browserType.launch: Executable doesn't exist at /nix/store/.../firefox/firefox
```

**Solutions**:

1. For Firefox visual tests:
   ```bash
   export FIREFOX_PATH=$(which firefox)
   npx playwright test --project=firefox-visual
   ```

2. For Chromium extension tests:
   ```bash
   # Ensure system chromium is available
   which chromium
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

### Snapshot Mismatch

Visual test failures due to font rendering differences:

1. Run locally to update snapshots
2. Or configure `maxDiffPixelRatio` in tests:
   ```javascript
   await expect(page).toHaveScreenshot('test.png', {
     maxDiffPixelRatio: 0.02  // Allow 2% difference
   });
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FIREFOX_PATH` | Firefox executable path for visual tests |
| `CHROMIUM_PATH` | Override Chromium executable path |
| `CHROME_PATH` | Fallback Chrome executable path |
| `PLAYWRIGHT_BROWSERS_PATH` | Should be unset on NixOS |

## Docker Alternative

For CI environments without NixOS, use the Docker fallback:

```bash
./scripts/e2e-docker.sh
```

This runs tests in an Ubuntu-based container with standard Playwright browser installation.

## CI Integration

The CI workflow (`.github/workflows/ci.yml`) includes:

1. **visual-tests** job: Runs Firefox visual tests
   - Installs Firefox via `npx playwright install firefox --with-deps`
   - Uploads test reports and snapshot diffs as artifacts

2. **e2e-tests** job: Runs Chromium extension tests
   - Installs Chromium via `npx playwright install chromium --with-deps`
   - Tests extension loading and functionality

Both jobs run in parallel after unit tests pass.

## Additional Resources

- [Playwright NixOS Wiki](https://wiki.nixos.org/wiki/Playwright)
- [VoxPage Firefox Manual Validation](./firefox-manual-validation.md)
- [Firefox Extension Testing Strategy](./firefox-extension-testing-strategy.md)
