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

    # AWS infrastructure toolchain (`infra/aws`). Declared HERE, not left to an
    # ad-hoc `nix shell nixpkgs#terraform`, because the infra gates are part of
    # this repo's delivery floor now: `make infra-check` runs fmt/validate/lint
    # and the policy scanners, and a tool that is only present when someone
    # remembers to summon it is a gate that silently does not run.
    #
    # Terraform >= 1.11 is a hard requirement, not a preference: the state
    # backend uses S3-native locking (`use_lockfile`), which older versions
    # ignore rather than reject — two concurrent applies would both proceed.
    terraform
    tflint
    trivy
    uv # installs the pinned checkov; see infra/aws/policy/versions.env

    # Deterministic brand crop, SVG proof, and raster verification tools
    imagemagick
    inkscape

    # Wordmark outline extraction (`scripts/extract-font-wordmark.py`). The
    # brand gate re-runs this against the vendored font on every `make verify`,
    # so the toolchain is a hard requirement, not a convenience: without it the
    # gate can only compare the source against a hash stored beside it, which
    # a coordinated edit satisfies.
    #
    # This shell takes nixpkgs from the ambient channel, so these versions are
    # NOT pinned here. `brand/fonts/manifest.json` records the versions the
    # selection research used (fontTools 4.63.0, uharfbuzz 0.53.2 — the current
    # channel's versions); determinism is relative to them. A channel that
    # outlines differently fails closed as a stale source rather than silently
    # reshaping the wordmark, which is the safe direction.
    (python3.withPackages (ps: [ ps.fonttools ps.uharfbuzz ]))

    # Browsers for Playwright
    chromium
    firefox

    # WebDriver server for the real-browser reading acceptance test
    # (`make smoke-reading`).
    geckodriver

    # Required for Playwright on NixOS
    # These libraries are needed for headless browser operation
    glib
    # `nss_latest`, not `nss`: this shell also ships `firefox`, whose `libxul.so`
    # requires the `NSS_3.113` symbol version. The top-level `nss` is 3.112.5 and
    # does NOT export it, so putting it on `LD_LIBRARY_PATH` shadows the NSS the
    # Firefox wrapper resolves for itself and every launch dies with
    # `XPCOMGlueLoad error ... Couldn't load XPCOM`. Playwright's bundled
    # Chromium is satisfied by the newer NSS too, so one coherent version serves
    # both browsers. See scripts/browser-linkage-check.mjs.
    nss_latest
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
    # Must match the `nss_latest` above: this path is what actually shadows the
    # Firefox wrapper's own NSS at launch time.
    pkgs.nss_latest
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
