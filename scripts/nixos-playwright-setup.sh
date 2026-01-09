#!/usr/bin/env bash
# NixOS Playwright Setup for VoxPage
#
# Problem: Playwright downloads browser binaries that are incompatible with NixOS
# Solution: Use system Firefox from the Nix store instead
#
# Usage:
#   ./scripts/nixos-playwright-setup.sh pnpm run test:visual
#   ./scripts/nixos-playwright-setup.sh npx playwright test
#
# Or set FIREFOX_PATH directly:
#   export FIREFOX_PATH=$(which firefox)
#   pnpm run test:visual

set -e

# Find system Firefox
FIREFOX_PATH=$(which firefox 2>/dev/null || echo "")

if [ -z "$FIREFOX_PATH" ]; then
  echo "Error: Firefox not found in PATH."
  echo ""
  echo "On NixOS, install Firefox via one of these methods:"
  echo "  1. Add to environment.systemPackages in configuration.nix"
  echo "  2. Use nix-shell: nix-shell -p firefox"
  echo "  3. Use nix profile: nix profile install nixpkgs#firefox"
  echo ""
  exit 1
fi

# Resolve symlinks to get the actual binary path
FIREFOX_PATH=$(readlink -f "$FIREFOX_PATH")

# Export for Playwright
export FIREFOX_PATH
echo "Using Firefox at: $FIREFOX_PATH"

# Unset Playwright's browser path to force using our custom path
unset PLAYWRIGHT_BROWSERS_PATH

# Check Firefox version
FIREFOX_VERSION=$("$FIREFOX_PATH" --version 2>/dev/null || echo "unknown")
echo "Firefox version: $FIREFOX_VERSION"
echo ""

# Execute the passed command
if [ $# -eq 0 ]; then
  echo "No command specified. Running default visual tests..."
  exec npx playwright test --project=firefox-visual
else
  exec "$@"
fi
