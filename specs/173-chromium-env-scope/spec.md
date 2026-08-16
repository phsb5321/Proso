# Feature 173 — Chromium library path must not poison the Firefox leg

Date: 14/08/2026

## Problem

`scripts/chrome-mv3-diagnostics.mjs` drives Chromium and then Firefox in one
process. On NixOS the bundled Chromium fails to start without an
`LD_LIBRARY_PATH` pointing at /nix/store lib dirs, so the script derived one and
assigned it to `process.env.LD_LIBRARY_PATH` (line 236).

That assignment is global. The Firefox child launched later in `firefoxLeg()`
inherited it, and the store's `nss-3.112.5` shadowed the NSS that the Firefox
152.0.6 wrapper supplies for itself. `libxul.so` requires `NSS_3.113`, so the
process aborted:

```
XPCOMGlueLoad error for file .../firefox-152.0.6/lib/firefox/libxul.so:
.../nss-3.112.5/lib/libnss3.so: version `NSS_3.113' not found
Couldn't load XPCOM.
```

geckodriver reported this as `Could not start Firefox: binary is not a Firefox
executable`, so the Firefox leg failed for an environment reason while the
product was healthy. The same Firefox binary passes `public-actor-gate`
standalone, which is the proof that the browser was never broken.

This misattribution matters: it makes a green product look like a browser
regression, and it blocks the combined Chromium+Firefox readiness receipt.

## Requirements

- **FR-001** Chromium receives its derived `LD_LIBRARY_PATH` through its own
  launch `env`, never through the ambient process environment.
- **FR-002** Running the Chromium leg leaves `process.env.LD_LIBRARY_PATH`
  exactly as it was, so the Firefox leg keeps the wrapper's own libraries.
- **FR-003** Both Chromium launch sites (initial profile and the cold-worker
  relaunch) use the derived path once it exists.
- **FR-004** A deterministic self-test fails closed if the global mutation
  returns.

## Out of scope

The host NSS/Firefox version skew itself. Nothing here changes packaging; the
diagnostic simply stops imposing Chromium's libraries on Firefox.

## Acceptance

`node scripts/chrome-mv3-diagnostics.self-test.mjs` passes, and
`node scripts/chrome-mv3-diagnostics.mjs` completes BOTH legs on a host where it
previously died at the Firefox leg.
