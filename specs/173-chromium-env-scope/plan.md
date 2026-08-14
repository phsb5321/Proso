# Plan — Feature 173

## Constitution check

Harness-only change. No product code, no permissions, no network destination,
no user-visible surface, no credentials, no deploy. The local-host routing
principle is untouched.

## Approach

1. Hold the derived path in a module-level `chromiumLibraryPath` instead of
   `process.env`.
2. Build Chromium's launch env from it via a pure `chromiumLaunchEnv(path, base)`
   helper, so the behavior is testable without launching a browser.
3. Apply that env at both `launchChromeContext` call sites (initial + retry).
4. Guard with `scripts/chrome-mv3-diagnostics.self-test.mjs`.

## Falsification

Before: the diagnostic reaches the Firefox leg and dies with
`binary is not a Firefox executable` (NSS_3.113 vs 3.112.5).
After: both legs complete in one process.

The self-test's ambient-environment assertion is the planted-regression guard:
restoring `process.env.LD_LIBRARY_PATH = libs` turns it red.
