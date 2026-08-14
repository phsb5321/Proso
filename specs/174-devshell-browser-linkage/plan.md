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

The check requires the `Mozilla Firefox <version>` banner rather than a zero
exit. On this nixpkgs wrapper an XPCOM failure exits **255**, but exit codes are
not reliable across Firefox builds, launcher wrappers, and distro packaging, and
a status alone could not tell a linkage failure apart from any other non-zero
exit. The banner proves the binary reached the point of reporting its own
version, and it carries the version worth recording.

(An earlier draft of this note claimed the failing launch exits 0. That was a
measurement artifact — `$?` was read after a pipe, so it reported `tail`'s
status, not Firefox's. Measured directly: broken 255, fixed 0.)

## Falsification

Same binary, two library paths:
- `LD_LIBRARY_PATH=<nss-3.112.5>/lib` -> check FAILs, naming `NSS_3.113`.
- `LD_LIBRARY_PATH=<nss-3.125>/lib` -> check PASSes, `Mozilla Firefox 152.0.6`.
