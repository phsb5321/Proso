# shell.nix - NixOS development environment for Proso
#
# Usage:
#   nix-shell              # Enter development shell
#   nix-shell --run "pnpm test:e2e:ext"  # Run E2E tests directly
#
# This provides:
#   - Node.js 22.x (current LTS; project supports Node.js 20+)
#   - pnpm package manager
#   - System Chromium for Playwright extension tests
#   - Firefox for visual tests
#   - Required system libraries for headless browser testing

{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "proso-dev";

  buildInputs = with pkgs; [
    # Node.js and package manager
    nodejs_22
    pnpm_10

    # Delivery harness (`make verify`, `make gate`, ...)
    gnumake

    # Deterministic brand crop, SVG proof, and raster verification tools
    imagemagick
    inkscape

    # Browsers for Playwright
    chromium
    firefox

    # WebDriver server for the real-browser reading acceptance test
    # (`make smoke-reading`).
    geckodriver

    # Required for Playwright on NixOS
    # These libraries are needed for headless browser operation
    glib
    nss
    nspr
    atk
    cups
    libdrm
    dbus
    expat
    libxkbcommon
    pango
    cairo
    alsa-lib
    mesa

    # X11 libraries for headless mode
    xorg.libX11
    xorg.libXcomposite
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXrandr
    xorg.libxcb

    # Additional utilities
    which
    git
  ];

  shellHook = ''
    echo "Proso Development Environment"
    echo "================================"
    echo ""
    echo "Browsers available:"
    echo "  - Chromium: $(which chromium)"
    echo "  - Firefox:  $(which firefox)"
    echo ""
    echo "Run E2E tests:"
    echo "  pnpm build:chrome && pnpm test:e2e:ext"
    echo ""
    echo "Run visual tests:"
    echo "  pnpm test:visual"
    echo ""
    
    # Export browser paths for Playwright
    export CHROMIUM_PATH="${pkgs.chromium}/bin/chromium"
    export FIREFOX_PATH="${pkgs.firefox}/bin/firefox"
    
    # Unset Playwright's browser path to use system browsers
    unset PLAYWRIGHT_BROWSERS_PATH
    
    # Ensure pnpm is available
    if [ ! -d "node_modules" ]; then
      echo "Installing dependencies..."
      pnpm install
    fi
  '';

  # Set library path for dynamic linking
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
    pkgs.stdenv.cc.cc.lib
    pkgs.glib
    pkgs.nss
    pkgs.nspr
    pkgs.atk
    pkgs.cups
    pkgs.libdrm
    pkgs.dbus
    pkgs.expat
    pkgs.libxkbcommon
    pkgs.pango
    pkgs.cairo
    pkgs.alsa-lib
    pkgs.mesa
    pkgs.xorg.libX11
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXext
    pkgs.xorg.libXfixes
    pkgs.xorg.libXrandr
    pkgs.xorg.libxcb
  ];
}
