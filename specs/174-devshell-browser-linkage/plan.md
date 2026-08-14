# Plan — Feature 174

## Constitution check

Developer-environment and harness only. No product code, no permissions, no
network destination, no credentials, no deploy, no Nix activation (the shell is
built on demand by `nix-shell`; nothing is switched into a profile).

## Approach

1. `shell.nix`: `pkgs.nss` -> `pkgs.nss_latest` in BOTH `buildInputs` and the
   exported `LD_LIBRARY_PATH` (the latter is what actually shadows at runtime).
   One coherent NSS serves Firefox and Playwright's Chromium.
2. `scripts/browser-linkage-check.mjs`: execute the resolved Firefox and demand a
   real version banner; classify a missing `NSS_*` symbol as a named linkage
   failure with the remedy; assert geckodriver.
3. `make browser-linkage`, made a prerequisite of `smoke-reading` and
   `public-actor-gate`.

## Note on the oracle

`firefox --version` exits **0 even when XPCOM fails to load** — the glue writes
to stderr and the shell still sees success. Exit status is therefore not a usable
oracle; the check requires the `Mozilla Firefox <version>` banner.

## Falsification

Same binary, two library paths:
- `LD_LIBRARY_PATH=<nss-3.112.5>/lib` -> check FAILs, naming `NSS_3.113`.
- `LD_LIBRARY_PATH=<nss-3.125>/lib` -> check PASSes, `Mozilla Firefox 152.0.6`.
